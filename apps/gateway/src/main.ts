import { createServer } from 'node:http';
import { Server } from 'socket.io';
// Импорт с .ts-расширением осознанно: dev-режим запускает исходники напрямую
// (Node 24 type stripping), а tsc при сборке переписывает расширение на .js
// (rewriteRelativeImportExtensions).
import { buildHealthPayload } from './health-payload.ts';

const port = Number(process.env.GATEWAY_PORT ?? 3002);

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(buildHealthPayload()));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer);

io.on('connection', (socket) => {
  // TODO(core): структурное логирование (pino) и auth хендшейка — issue #2/#3.
  console.log(`gateway: подключение ${socket.id}`);
  socket.on('disconnect', (reason: string) => {
    console.log(`gateway: отключение ${socket.id} (${reason})`);
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`gateway: слушает порт ${port}`);
});
