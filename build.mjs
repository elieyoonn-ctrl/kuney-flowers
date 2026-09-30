// Zero-dependency production bundle: copies only what the site loads into
// dist/, leaving out references, design notes, tests and dev tooling.
// There is nothing to compile — every path in the site is relative, so dist/
// can be served from any host or sub-path as-is. Run: npm run build
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const OUT = join(ROOT, 'dist');

const INCLUDE = [
  'index.html',
  'admin.html',
  'css',
  'js',
  'data',
  'fonts',
  'images',
  'public',
  'vendor',
];

// Finder litter and the notes that sit beside the assets.
const SKIP = new Set(['.DS_Store', 'README.md']);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

for (const entry of INCLUDE) {
  cpSync(join(ROOT, entry), join(OUT, entry), {
    recursive: true,
    filter: (src) => !SKIP.has(basename(src)),
  });
}

function tally(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) {
      const sub = tally(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += info.size;
    }
  }
  return { files, bytes };
}

const { files, bytes } = tally(OUT);
console.log(`\n  KUNEY FLOWERS → dist/  (${files} files, ${(bytes / 1048576).toFixed(1)} MB)\n`);
