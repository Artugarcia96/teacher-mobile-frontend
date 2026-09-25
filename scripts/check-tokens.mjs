// Fails if any CSS/TSX outside src/styles/tokens.css uses raw colors or !important (docs/DESIGN.md), or if the
// landing's copy of a token drifts from src/styles/tokens.css.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;
const ALLOW = new Set(['styles/tokens.css']);
const ALLOW_IMPORTANT = new Set(['styles/base.css']);
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|tsx|ts)$/.test(name)) check(p);
  }
}

function check(file) {
  const rel = relative(ROOT, file);
  if (ALLOW.has(rel)) return;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$|\/\*.*?\*\//g, '');
    if (COLOR.test(code) && !/url\(|data:|katex/.test(code)) problems.push(`${rel}:${i + 1}  raw color → use a token: ${line.trim().slice(0, 90)}`);
    if (/!important/.test(code) && !ALLOW_IMPORTANT.has(rel)) problems.push(`${rel}:${i + 1}  !important is not allowed`);
  });
}

// The landing (landing/landing.css) has no build step, so it repeats the tokens it uses: same values as the app.
const TOKENS = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
const LANDING = readFileSync(new URL('../landing/landing.css', import.meta.url), 'utf8');
function rootTokens(css, dark) {
  const block = dark ? css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root[^{]*\{([^}]*)\}/) : css.match(/^:root\s*\{([^}]*)\}/m);
  return new Map([...(block?.[1] ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\s+/g, ' ').trim()]));
}
for (const dark of [false, true]) {
  const app = rootTokens(TOKENS, dark);
  for (const [name, value] of rootTokens(LANDING, dark)) {
    if (app.has(name) && app.get(name) !== value) {
      problems.push(`landing/landing.css  ${name} (${dark ? 'dark' : 'light'}) is ${value}, tokens.css says ${app.get(name)}`);
    }
  }
}

walk(ROOT);
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s). Colors live only in src/styles/tokens.css.`);
  process.exit(1);
}
console.log('tokens: OK');
