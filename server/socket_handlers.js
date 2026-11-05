function registerSocketHandlers(io) {
  // Register the per-client connection lifecycle and initial readiness event.
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    socket.emit('server:ready', { connected: true });

    // Log why this client's connection ended for server-side diagnostics.
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });
}

module.exports = registerSocketHandlers;
