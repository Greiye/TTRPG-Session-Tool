// Shared Socket.IO handle, set once by server.js so modules can emit without circular imports.
module.exports = { io: null };
