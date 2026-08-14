/* Bundle src/main.ts and inline the JavaScript into src/index.template.html
   to produce the single-file game: index.html (no runtime dependencies). */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const marker = '//__BUNDLE_JS__';

const result = await build({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  write: false,
  minify: false,
  sourcemap: false,
  logLevel: 'info'
});

const js = result.outputFiles[0].text;
const template = readFileSync(path.join(root, 'src/index.template.html'), 'utf8');

if (!template.includes(marker)) {
  throw new Error(`template marker ${marker} not found in src/index.template.html`);
}

const html = template.replace(marker, () => js);
writeFileSync(path.join(root, 'index.html'), html);
console.log(`wrote index.html (${(html.length / 1024).toFixed(1)} kB, ${(js.length / 1024).toFixed(1)} kB inline JS)`);
