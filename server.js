const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const os = require('os');
const path = require('path');

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';

const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');

function createApp() {
  const app = express();

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'webterminal' });
  });

  app.use(express.static(path.join(__dirname, 'public')));

  return app;
}

function createWebTerminalServer() {
  const app = createApp();
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env,
    });

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    ws.on('message', (msg) => {
      const data = JSON.parse(msg);
      if (data.type === 'input') {
        term.write(data.data);
      } else if (data.type === 'resize') {
        term.resize(data.cols, data.rows);
      }
    });

    ws.on('close', () => {
      term.kill();
    });
  });

  return { app, server, wss };
}

function start() {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const host = process.env.HOST || DEFAULT_HOST;
  const { server } = createWebTerminalServer();

  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`WebTerminal listening on http://${host}:${actualPort}`);
  });

  return server;
}

if (require.main === module) {
  start();
}

module.exports = {
  createApp,
  createWebTerminalServer,
  start,
};
