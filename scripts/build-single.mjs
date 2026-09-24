// One self-contained HTML (JS, CSS and brand images inlined) that opens by
// double-click from Downloads, no server needed.
//   node scripts/build-single.mjs  →  dist-single/morihome-erp.html
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist-single');
fs.rmSync(out, { recursive: true, force: true });
execSync('npx vite build --logLevel error', { cwd: root, stdio: 'inherit', env: { ...process.env, SINGLE: '1' } });

const read = (p) => fs.readFileSync(path.join(out, p));
let html = read('index.html').toString();

// Only the images the app actually shows (Logo variants, login hero, loader, favicon).
const BRAND = [
  'logo-lockup@h48.png', 'logo-lockup@h96.png', 'logo-lockup@h160.png', 'logo-lockup.png',
  'logo-mark-64.png', 'logo-mark-128.png', 'logo-mark-256.png', 'logo-wordmark.png',
  'login-hero.jpg', 'favicon-32.png',
];
const dataUri = (name) => {
  const mime = name.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${read(`brand/${name}`).toString('base64')}`;
};
const brand = Object.fromEntries(BRAND.map((n) => [n, dataUri(n)]));

const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

html = html
  // favicons / touch icon: keep one inlined favicon
  .replace(/\s*<link rel="(?:icon|apple-touch-icon)"[^>]*>/g, '')
  .replace('<head>', `<head>\n    <link rel="icon" type="image/png" href="${brand['favicon-32.png']}" />`)
  .replace(/src="\.\/brand\/([^"]+)"/g, (_, n) => `src="${brand[n] ?? dataUri(n)}"`)
  .replace(/\s*<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (_, p) => `\n    <style>${read(p)}</style>`)
  .replace(/\s*<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, '')
  .replace('</body>', () => {
    const js = fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js'));
    if (js.length !== 1) throw new Error(`expected one JS chunk, got ${js.join(', ')}`);
    return `  <script>window.__MORI_BRAND__=${JSON.stringify(brand)};</script>\n    <script type="module">${safe(read(`assets/${js[0]}`).toString())}</script>\n  </body>`;
  });

if (/\.\/(assets|brand)\//.test(html.replace(/<script type="module">[\s\S]*<\/script>/, ''))) throw new Error('an asset reference was left un-inlined');
const file = path.join(out, 'morihome-erp.html');
fs.writeFileSync(file, html);
console.log(`${path.relative(root, file)}  ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
