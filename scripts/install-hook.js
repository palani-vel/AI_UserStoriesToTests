/**
 * install-hook.js
 * Copies `scripts/pre-push-hook.sh` into `.git/hooks/pre-push`.
 * Usage: `node ./scripts/install-hook.js`
 */
const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const src = path.join(repoRoot, 'scripts', 'pre-push-hook.sh');
const destDir = path.join(repoRoot, '.git', 'hooks');
const dest = path.join(destDir, 'pre-push');

if (!fs.existsSync(src)) {
  console.error('Source hook not found:', src);
  process.exit(2);
}

if (!fs.existsSync(destDir)) {
  console.error('.git/hooks not found. Are you running from repository root?');
  process.exit(2);
}

try {
  fs.copyFileSync(src, dest);
  try { fs.chmodSync(dest, 0o755); } catch (e) { /* ignore on Windows */ }
  console.log('Installed hook to', dest);
  process.exit(0);
} catch (err) {
  console.error('Failed to install hook:', err);
  process.exit(1);
}
