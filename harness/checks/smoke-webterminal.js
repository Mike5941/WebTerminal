const http = require('http');
const WebSocket = require('ws');
const { createWebTerminalServer } = require('../../server');

function requestJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch (error) {
          reject(new Error(`invalid JSON from ${path}: ${error.message}`));
        }
      });
    });
    req.on('error', reject);
  });
}

function requestText(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

function listen(server, wss) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('error', onError);
      wss.off('error', onError);
      reject(error);
    };

    server.once('error', onError);
    wss.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      wss.off('error', onError);
      const address = server.address();
      if (!address || typeof address !== 'object') {
        reject(new Error('server did not expose an address'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function probeTerminal(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let output = '';
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('timed out waiting for terminal output'));
    }, 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }));
      ws.send(JSON.stringify({ type: 'input', data: 'printf "WEBTERMINAL_SMOKE_OK\\n"; exit\n' }));
    });

    ws.on('message', (message) => {
      output += message.toString();
      if (output.includes('WEBTERMINAL_SMOKE_OK')) {
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function main() {
  const { server, wss } = createWebTerminalServer();
  const port = await listen(server, wss);

  try {
    const health = await requestJson(port, '/healthz');
    if (health.statusCode !== 200 || !health.body.ok) {
      throw new Error(`unexpected health response: ${health.statusCode}`);
    }

    const index = await requestText(port, '/');
    if (index.statusCode !== 200 || !index.body.includes('WebTerminal')) {
      throw new Error(`unexpected index response: ${index.statusCode}`);
    }

    await probeTerminal(port);
    console.log('webterminal smoke passed');
  } finally {
    await close(server);
  }
}

main().catch((error) => {
  console.error(`webterminal smoke failed: ${error.message}`);
  process.exit(1);
});
