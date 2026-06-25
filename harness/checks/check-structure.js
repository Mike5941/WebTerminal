const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

function fail(message) {
  console.error(`structure check failed: ${message}`);
  process.exitCode = 1;
}

const serverPath = path.join(root, 'server.js');
const publicPath = path.join(root, 'public', 'index.html');

if (!fs.existsSync(serverPath)) {
  fail('missing server.js');
}

if (!fs.existsSync(publicPath)) {
  fail('missing public/index.html');
}

if (fs.existsSync(serverPath)) {
  const serverText = fs.readFileSync(serverPath, 'utf8');
  for (const exportName of ['createApp', 'createWebTerminalServer', 'start']) {
    if (!serverText.includes(exportName)) {
      fail(`server.js should expose ${exportName} for harness use`);
    }
  }
  if (!serverText.includes('/healthz')) {
    fail('server.js should expose /healthz for process probes');
  }
}

const forbiddenProductionImports = [
  { file: 'server.js', text: "require('./harness" },
  { file: 'public/index.html', text: 'harness/' },
];

for (const rule of forbiddenProductionImports) {
  const fullPath = path.join(root, rule.file);
  if (fs.existsSync(fullPath) && fs.readFileSync(fullPath, 'utf8').includes(rule.text)) {
    fail(`${rule.file} must not depend on harness code`);
  }
}

if (!process.exitCode) {
  console.log('structure check passed');
}
