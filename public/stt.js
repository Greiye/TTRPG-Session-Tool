// Speech-to-text behind one interface (item 13). Two engines:
//   chrome  the browser's Web Speech API (Chrome and Edge; needs internet on the device; secure origin)
//   vosk    a local model in the browser (vosk-browser, WebAssembly). Runs offline. The DM supplies
//           the model: a Vosk model archive (.tar.gz) served from the laptop at /models/ (see docs/decisions.md, item 13).
// Interface:  const s = STT.create(engine, { model, lang });  s.on('partial'|'final'|'status', fn);
//             s.start(); s.stop(); s.engine
(() => {
  const VOSK_CDN = 'https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js';
  const listeners = { partial: [], final: [], status: [] };
  const emit = (ev, v) => listeners[ev].forEach((fn) => { try { fn(v); } catch (e) { console.error(e); } });

  function chromeEngine(lang) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    let r = null; let running = false;
    return {
      name: 'Browser (Chrome)',
      start() {
        running = true;
        r = new SR();
        Object.assign(r, { continuous: true, interimResults: true, lang: lang || navigator.language || 'en-US' });
        r.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript.trim();
            if (e.results[i].isFinal) emit('final', t); else interim += e.results[i][0].transcript;
          }
          emit('partial', interim);
        };
        r.onerror = (e) => emit('status', `Speech engine: ${e.error}`);
        r.onend = () => { if (running) r.start(); }; // the engine stops after silence; keep it alive
        r.start();
      },
      stop() { running = false; r?.stop(); },
    };
  }

  // Loads vosk-browser once, then a model from `model` (a URL, e.g. /models/vosk-small-en.tar.gz).
  let voskLib = null;
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load vosk-browser')); document.head.append(s); });
  }
  function voskEngine({ model }) {
    if (!model) return null;
    let rec = null; let ctx = null; let proc = null; let stream = null; let modelObj = null;
    return {
      name: 'Local model (Vosk)',
      async start() {
        emit('status', 'Loading local speech model…');
        if (!window.Vosk) await loadScript(VOSK_CDN);
        modelObj ??= await window.Vosk.createModel(model);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        ctx = new AudioContext();
        rec = new modelObj.KaldiRecognizer(ctx.sampleRate);
        rec.on('result', (m) => m.result?.text && emit('final', m.result.text));
        rec.on('partialresult', (m) => emit('partial', m.result?.partial || ''));
        const src = ctx.createMediaStreamSource(stream);
        proc = ctx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (e) => rec.acceptWaveform(e.inputBuffer);
        src.connect(proc); proc.connect(ctx.destination);
        emit('status', 'Listening (offline)…');
      },
      stop() {
        proc?.disconnect(); stream?.getTracks().forEach((t) => t.stop()); ctx?.close();
        try { rec?.remove(); } catch {}
        rec = null;
      },
    };
  }

  function create(engine, opts = {}) {
    const impl = engine === 'vosk' ? voskEngine(opts) : chromeEngine(opts.lang);
    const s = {
      engine: impl ? (engine === 'vosk' ? 'vosk' : 'chrome') : null,
      name: impl?.name || 'Not available',
      on(ev, fn) { listeners[ev].push(fn); return s; },
      start() { if (!impl) return emit('status', 'Speech-to-text is not available here. Use Chrome or Edge, or set up a local model.'); Promise.resolve(impl.start()).catch((e) => emit('status', e.message)); },
      stop() { impl?.stop(); },
    };
    return s;
  }

  window.STT = { create, available: () => ({ chrome: !!(window.SpeechRecognition || window.webkitSpeechRecognition), vosk: true }) };
})();

// ---------- DM live voice panel ----------
// Records the DM's mic (MediaRecorder) and streams the transcript from the engine above into the dialogue
// box. Was public/voice.js until Nov 16 (merged here, studio review). Runs only where the panel exists.
(() => {
  const $ = (s) => document.querySelector(s);
  const box = $('#voiceBox');
  if (!box) return;
  const status = (t) => { $('#voiceStatus').textContent = t; };

  let recorder = null;
  let chunks = [];
  let recog = null;
  let finalText = '';
  let interim = '';
  let recording = false;
  let lastCaption = 0;

  if (!window.STT?.available().chrome) status('Chrome or Edge is needed for live captions in the browser engine; a local model works in any browser.');
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) status('Recording needs a secure context: open the DM page via http://localhost on the host laptop.');

  function paint() {
    box.innerHTML = '';
    if (!finalText && !interim) { box.innerHTML = '<span class="interim">Press Record and speak in character…</span>'; return; }
    box.append(document.createTextNode(finalText));
    if (interim) { const s = document.createElement('span'); s.className = 'interim'; s.textContent = interim; box.append(s); }
  }

  function caption(text) {
    if (!$('#liveCaption').checked) return;
    const now = Date.now();
    if (text && now - lastCaption < 150) return;
    lastCaption = now;
    window.dmEmit('dm:caption', { text });
  }

  // Item 13: one STT interface, two engines (public/stt.js). The engine is picked in the settings row.
  function startRecognition() {
    const engine = $('#sttEngine')?.value || 'chrome';
    recog = window.STT.create(engine, { model: $('#sttModel')?.value || '/models/vosk-small-en.tar.gz' });
    recog.on('partial', (t) => { interim = t; paint(); caption(t); });
    recog.on('final', (t) => {
      interim = '';
      finalText += (finalText ? ' ' : '') + t;
      if ($('#autoSay').checked && t) window.dmEmit('dm:say', { text: t });
      paint(); caption('');
    });
    recog.on('status', (t) => status(t));
    if (!recog.engine) { status('Speech-to-text is not available in this browser. Use Chrome or Edge, or a local model.'); return; }
    recog.start();
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); saveClip(); };
      recorder.start(1000);
      recording = true;
      startRecognition();
      $('#recBtn').textContent = '■ Stop';
      $('#recDot').classList.add('live');
      status('Recording…');
    } catch (err) {
      status(`Mic unavailable: ${err.message}`);
    }
  }

  function stop() {
    recording = false;
    recog?.stop();
    recorder?.state !== 'inactive' && recorder?.stop();
    interim = '';
    paint();
    caption('');
    $('#recBtn').textContent = '● Record';
    $('#recDot').classList.remove('live');
    status('Saved below.');
  }

  function saveClip() {
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
    const transcript = finalText;
    const el = document.createElement('div');
    el.innerHTML = `<div class="row"><b>Clip ${stamp}</b><a class="btn small" download="npc-${stamp}.${ext}">Audio</a><a class="btn small" download="npc-${stamp}.txt">Transcript</a></div><audio controls></audio>`;
    el.querySelector('audio').src = url;
    el.querySelectorAll('a')[0].href = url;
    el.querySelectorAll('a')[1].href = URL.createObjectURL(new Blob([transcript || '(no transcript)'], { type: 'text/plain' }));
    $('#recordings').prepend(el);
  }

  $('#recBtn').onclick = () => (recording ? stop() : start());
  $('#voiceSend').onclick = () => { if (finalText) window.dmEmit('dm:say', { text: finalText }); };
  $('#voiceClear').onclick = () => { finalText = ''; interim = ''; paint(); caption(''); };
})();
