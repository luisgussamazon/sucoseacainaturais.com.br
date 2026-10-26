import { cp, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const out = new URL('dist/', root);
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'app.js', 'model.js', 'style.css']) {
  await copyFile(new URL(file, root), new URL(file, out));
}
await cp(new URL('../public/images/', root), new URL('images/', out), { recursive: true });
await copyFile(new URL('../public/brand.svg', root), new URL('brand.svg', out));
console.log('Demonstração gerada sem banco e sem dependências: ' + fileURLToPath(out));
