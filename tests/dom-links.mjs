/* Static cross-check: every DOM lookup in the JS must resolve, and every
   data-action / data-admin attribute must have a handler.

   app.js sets textContent on the result of role() without null guards — a
   single typo would throw on load, and no unit test would catch it. This
   compares the selectors used against the attributes actually present in the
   HTML plus those the JS renders itself. */

import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const all = (re, src) => [...src.matchAll(re)].map((m) => m[1]);
const set = (re, src) => new Set(all(re, src));

const ROLE_ATTR = /data-role="([^"]+)"/g;
const ID_ATTR = /\sid="([^"]+)"/g;
const ROLE_CALL = /role\(\s*'([^']+)'/g;
const ID_CALL = /\$\(\s*'#([\w-]+)'/g;

const problems = [];

/* Roles built at runtime from a loop, so their names are interpolated. */
const TEMPLATED = [/^seed-\d+$/];

function checkPage({ label, js, htmlFiles, siblings = [] }) {
  const src = read(js);
  const html = htmlFiles.map(read).join('\n');

  // A role is valid if it is in the HTML, rendered by this module, or rendered
  // by a module this one renders into.
  const available = new Set([
    ...set(ROLE_ATTR, html),
    ...set(ROLE_ATTR, src),
    ...siblings.flatMap((s) => all(ROLE_ATTR, read(s))),
  ]);
  const ids = new Set(all(ID_ATTR, html));

  for (const m of src.matchAll(ROLE_CALL)) {
    const name = m.group ?? m[1];
    if (available.has(name)) continue;
    if (TEMPLATED.some((re) => re.test(name))) continue;
    problems.push(`${label}:${src.slice(0, m.index).split('\n').length}  role('${name}') resolves to null`);
  }
  for (const m of src.matchAll(ID_CALL)) {
    if (!ids.has(m[1])) {
      problems.push(`${label}:${src.slice(0, m.index).split('\n').length}  $('#${m[1]}') resolves to null`);
    }
  }
}

checkPage({
  label: 'js/app.js',
  js: 'js/app.js',
  htmlFiles: ['index.html'],
  siblings: ['js/calendar.js'],
});

checkPage({
  label: 'js/admin.js',
  js: 'js/admin.js',
  htmlFiles: ['admin.html'],
  siblings: ['js/calendar.js'],
});

/* calendar.js renders its panel then queries it — the two must agree. */
{
  const cal = read('js/calendar.js');
  const built = new Set(all(ROLE_ATTR, cal));
  for (const m of cal.matchAll(/data-role="([^"]+)"\]/g)) {
    if (!built.has(m[1])) {
      problems.push(`js/calendar.js  queries [data-role="${m[1]}"] which it never renders`);
    }
  }
}

/* Every clickable attribute needs a case in the matching switch. */
function checkHandlers(label, attr, sources, handlerRe, handlerSources) {
  const emitted = new Set(sources.flatMap((s) => all(attr, read(s))));
  const handled = new Set(handlerSources.flatMap((s) => all(handlerRe, read(s))));
  const missing = [...emitted].filter((a) => !handled.has(a) && !a.includes('${')).sort();
  if (missing.length) problems.push(`${label}: no handler for ${missing.join(', ')}`);
}

checkHandlers('data-action', /data-action="([^"]+)"/g, ['index.html', 'js/app.js'],
  /case '([^']+)':/g, ['js/app.js']);
checkHandlers('data-admin', /data-admin="([^"]+)"/g, ['admin.html', 'js/admin.js'],
  /case '([^']+)':/g, ['js/admin.js']);
checkHandlers('data-cal', /data-cal="([^"]+)"/g, ['js/admin.js'],
  /action === '([^']+)'/g, ['js/admin.js']);
checkHandlers('calendar data-action', /data-action="([^"]+)"/g, ['js/calendar.js'],
  /action === '([^']+)'|dataset\.(key)/g, ['js/calendar.js']);

if (problems.length) {
  console.log(`\n  dom links: ${problems.length} problems\n`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\n  dom links: all selectors resolve and all handlers exist\n');
