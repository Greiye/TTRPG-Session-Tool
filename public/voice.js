// Live voice placeholder: MediaRecorder captures the DM's mic, Web Speech API (where available)
// streams a transcript into the dialogue box. Swap `startRecognition` for a real STT service later.
(() => {
  const $ = (s) => document.querySelector(s);
  const box = $('#voiceBox');
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
