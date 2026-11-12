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
