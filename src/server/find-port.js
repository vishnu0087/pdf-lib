import net from 'net';

/** Try `startPort`, then `startPort+1`, … until a port accepts a listen (or `maxAttempts`). */
export function findAvailablePort(startPort, maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryPort = (port) => {
      const probe = net.createServer();
      probe.once('error', (err) => {
        probe.removeAllListeners();
        if (err.code === 'EADDRINUSE') {
          attempts += 1;
          if (attempts >= maxAttempts) {
            reject(
              new Error(
                `No free port after ${maxAttempts} attempts starting at ${startPort}`
              )
            );
            return;
          }
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });
      probe.once('listening', () => {
        probe.close(() => resolve(port));
      });
      probe.listen(port);
    };
    tryPort(startPort);
  });
}
