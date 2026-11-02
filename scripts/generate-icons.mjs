// Genera los íconos PNG de la PWA a partir del diseño SVG (usa Chromium de Playwright).
// Uso: npm run icons
import { createRequire } from 'node:module';
// Playwright puede estar instalado globalmente (no es dependencia del proyecto)
const { chromium } = createRequire(import.meta.url)('playwright');
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(out, { recursive: true });

// scale < 1 deja margen extra (zona segura de íconos "maskable")
const art = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -261)">
    <path d="M146 262a110 110 0 0 1 220 0z" fill="#81866A"/>
    <rect x="118" y="286" width="276" height="18" rx="9" fill="#81866A"/>
    <rect x="160" y="332" width="192" height="16" rx="8" fill="#81866A" opacity="0.6"/>
    <rect x="204" y="374" width="104" height="16" rx="8" fill="#81866A" opacity="0.35"/>
  </g>`;

// Fondo a sangre completa: iPadOS y Android aplican su propia máscara de esquinas.
const svg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#F2DDE2"/>${art(scale)}</svg>`;

writeFileSync(out + 'icon.svg', svg(1));

const targets = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.82 },
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0">${svg(t.scale).replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`)}</body></html>`);
  writeFileSync(out + t.file, await page.screenshot({ clip: { x: 0, y: 0, width: t.size, height: t.size }, omitBackground: false }));
  console.log('✓', t.file);
}
await browser.close();
