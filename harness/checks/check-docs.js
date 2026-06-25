const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

const requiredFiles = [
  'AGENTS.md',
  'docs/README.md',
  'docs/architecture.md',
  'docs/operations.md',
  'docs/quality.md',
  'docs/plans/README.md',
  'docs/decisions/0001-agent-readable-harness.md',
  'harness/README.md',
];

function fail(message) {
  console.error(`docs check failed: ${message}`);
  process.exitCode = 1;
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`missing ${file}`);
  }
}

const agentsPath = path.join(root, 'AGENTS.md');
if (fs.existsSync(agentsPath)) {
  const lineCount = fs.readFileSync(agentsPath, 'utf8').trimEnd().split('\n').length;
  if (lineCount > 120) {
    fail(`AGENTS.md has ${lineCount} lines; keep it under 120 and move details into docs/`);
  }
}

const agentsText = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
for (const link of ['docs/architecture.md', 'docs/quality.md', 'docs/operations.md', 'harness/README.md']) {
  if (!agentsText.includes(link)) {
    fail(`AGENTS.md should link to ${link}`);
  }
}

if (!process.exitCode) {
  console.log('docs check passed');
}
