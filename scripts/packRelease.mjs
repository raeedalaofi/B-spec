// Zips the build for upload to itch.io.
//
// itch.io serves an HTML project by unpacking the zip and opening index.html
// at its root, so the archive must be the *contents* of dist/, not a folder
// containing them.
//
//   node scripts/packRelease.mjs [distDir] [outZip]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const out = resolve(process.argv[3] ?? 'store/bspec-html5.zip');

if (!existsSync(`${dist}/index.html`)) {
  console.error(`no build at ${dist} — run npm run build first`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-qr', out, '.', '-x', '.*'], { cwd: dist });
console.log(`${out} — ${(statSync(out).size / 1e6).toFixed(1)} MB`);
