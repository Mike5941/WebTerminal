'use strict';

// node-pty ships a prebuilt `spawn-helper` binary, but on some platforms the
// executable bit is lost after `npm install`, which makes pty.spawn fail with
// "posix_spawnp failed". Re-assert +x so a fresh clone runs without manual steps.
// Defensive by design: never fail the install if anything is missing.

const fs = require('fs');
const path = require('path');

if (process.platform === 'win32') process.exit(0);

const prebuildsDir = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');

try {
  if (!fs.existsSync(prebuildsDir)) process.exit(0);

  for (const entry of fs.readdirSync(prebuildsDir)) {
    const helper = path.join(prebuildsDir, entry, 'spawn-helper');
    if (fs.existsSync(helper)) {
      fs.chmodSync(helper, 0o755);
    }
  }
} catch (err) {
  console.warn(`[fix-pty-permissions] skipped: ${err.message}`);
}
