// Client transports. Any object with { connect(onMessage), send(msg), close() } works as a transport,
// so a host can route messages over its own networking (socket.io, WebRTC, postMessage, ...).
import { Room } from '../core/room.js';
import defaultRules from '../core/rules.js';

/** Runs the authoritative Room in the page. hotseat: all party units owned by the local player; setRole() flips DM/player view. */
export class LocalTransport {
  constructor({ rules = defaultRules, seed, scenario, dmKey = 'dm', hotseat = true, name = 'hotseat', startAsDM = true, room } = {}) {
    this.room = room || new Room(rules, { seed, scenario, dmKey });
    this.name = name; this.startAsDM = startAsDM;
    if (hotseat) for (const u of Object.values(this.room.state.units)) if (u.team === 'players' && !u.owner) u.owner = name;
    this.id = 'local' + Math.random().toString(36).slice(2, 8);
  }
  connect(onMsg) {
    // JSON round-trip mimics the wire so client code paths are identical to networked play
    this.room.join(this.id, { name: this.name, wantDM: this.startAsDM, dmKey: this.room.dmKey }, (m) => queueMicrotask(() => onMsg(JSON.parse(JSON.stringify(m)))));
  }
  send(m) { this.room.handle(this.id, m); }
  setRole(isDM) { this.room.setActor(this.id, { name: this.name, isDM }); }
  close() { this.room.leave(this.id); }
  get status() { return 'local'; }
}

/** Connects to a Room served over WebSocket (see server.js connectSocket / attachWebSocketServer). */
export class WebSocketTransport {
  constructor(url, { name = 'player', dmKey = '' } = {}) { this.url = url; this.join = { name, wantDM: !!dmKey, dmKey }; this.status = 'connecting'; }
  connect(onMsg, onStatus) {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => { this.ws.send(JSON.stringify({ t: 'join', ...this.join })); this.status = 'online'; onStatus?.('online'); };
    this.ws.onmessage = (e) => onMsg(JSON.parse(e.data));
    this.ws.onclose = () => { this.status = 'disconnected'; onStatus?.('disconnected'); };
  }
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.ws?.close(); }
}
