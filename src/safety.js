// Last-resort safety net for game night (studio review, Nov 16). Socket handlers are already guarded
// (src/sockets/index.js), but an error thrown later (a timer, a promise such as a wiki push, a file
// watcher) would still end the Node process and drop every phone at the table. This logs it once per
// message, saves the campaign right away, and keeps the server running.
function install(proc = process, { log = console.warn, flush = () => {} } = {}) {
  const seen = new Set();
  const report = (kind) => (err) => {
    const msg = (err && (err.stack || err.message)) || String(err);
    const first = msg.split('\n')[0];
    if (!seen.has(first)) {
      seen.add(first);
      log(`  ${kind}: ${first}\n  The game keeps running. If something looks wrong, make a save point and restart.`);
    }
    try { flush(); } catch { /* a failed save is reported by the saver itself */ }
  };
  proc.on('unhandledRejection', report('Something failed in the background'));
  proc.on('uncaughtException', report('Something went wrong'));
  return { seen };
}

// A friendly line when the port is taken, usually because the game is already open in another window.
function portError(err, port) {
  if (err.code === 'EADDRINUSE') return `  Port ${port} is already in use. The game may already be running in another window: close it, or start with PORT=<another number>.`;
  if (err.code === 'EACCES') return `  Port ${port} needs permission on this computer. Start with PORT=3000 or another number above 1024.`;
  return null;
}

module.exports = { install, portError };
