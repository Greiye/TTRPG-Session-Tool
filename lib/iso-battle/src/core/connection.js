// Transport-agnostic server glue: wire any socket-like object to a Room.
// socket: { send(string), on('message', fn(data)), on('close', fn) }  — matches the `ws` package API.
let nextId = 1;
export function connectSocket(room, socket, { onJoin } = {}) {
  const id = 'c' + nextId++;
  const send = (m) => { try { if (socket.readyState === undefined || socket.readyState === 1) socket.send(JSON.stringify(m)); } catch { /* closed */ } };
  let joined = false;
  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return; }
    if (!joined) {
      if (msg.t !== 'join') return;
      joined = true; room.join(id, msg, send); onJoin?.(id, room.clients.get(id).actor);
      return;
    }
    room.handle(id, msg);
  });
  socket.on('close', () => { if (joined) room.leave(id); });
  return id;
}

/** Attach a Room to a `ws` WebSocketServer (or anything emitting 'connection' with ws-like sockets). */
export function attachWebSocketServer(room, wss, opts) {
  const handler = (socket) => connectSocket(room, socket, opts);
  wss.on('connection', handler);
  return () => wss.off?.('connection', handler);
}
