// Pruebas de extremo a extremo sobre la versión de producción (vite preview).
// Uso: npm run build && npx vite preview --port 4173 &  luego  npm run test:e2e
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = 'test-results';
mkdirSync(OUT, { recursive: true });

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1180, height: 820 },
  hasTouch: true,
  locale: 'es-MX',
  timezoneId: 'America/Mexico_City',
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const addTask = async (title, opts = {}) => {
  await page.click('.fab');
  await page.fill('.qa-input', title);
  if (opts.today) await page.click('.qa-chips >> text=Hoy');
  if (opts.tomorrow) await page.click('.qa-chips >> text=Mañana');
  await page.click('.quick-add button[type=submit]');
  await page.waitForSelector('dialog.quick-add:not([open])', { state: 'attached' });
};
const rowCount = () => page.locator('.main .task-row').count();

await page.goto(BASE);
await page.waitForSelector('.hero');

// --- PWA ---
const manifestHref = await page.getAttribute('link[rel=manifest]', 'href');
ok(!!manifestHref, 'manifest enlazado en index.html');
ok((await page.getAttribute('link[rel=apple-touch-icon]', 'href'))?.includes('apple-touch-icon.png'), 'apple-touch-icon presente');
ok((await page.getAttribute('meta[name=apple-mobile-web-app-capable]', 'content')) === 'yes', 'meta apple-mobile-web-app-capable');
const swReady = await page.evaluate(async () => {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
  return !!reg;
});
ok(swReady, 'service worker registrado y activo');

// --- Categorías iniciales ---
await page.goto(BASE + '#/settings');
await page.waitForSelector('.manage-list');
const cats = await page.locator('.manage-name').allTextContents();
ok(cats.join('|') === 'Trabajo|Personal|Finanzas|Estudios y aprendizaje|Salud y entrenamiento|Proyectos personales', 'categorías iniciales creadas');

// --- Crear tareas ---
await page.goto(BASE + '#/inbox');
await addTask('Revisar presupuesto mensual');
await addTask('Llamar a mamá');
await addTask('Comprar flores para la mesa');
ok((await rowCount()) === 3, 'captura rápida crea tareas en Inbox');

// Validación: título vacío
await page.click('.fab');
await page.click('.quick-add button[type=submit]');
ok(await page.locator('.quick-add .field-error').isVisible(), 'título vacío muestra error');
await page.keyboard.press('Escape');

await page.goto(BASE + '#/today');
await addTask('Preparar presentación del jueves'); // en Hoy, "Hoy" viene activado por defecto
await addTask('Pagar tarjeta');
ok((await rowCount()) === 2, 'tareas marcadas para hoy aparecen en Hoy');

// --- Persistencia tras recargar ---
await page.reload();
await page.waitForSelector('.task-row');
ok((await rowCount()) === 2, 'las tareas persisten tras recargar');

// --- Editar en el panel de detalle ---
await page.click('text=Pagar tarjeta');
await page.waitForSelector('.detail.is-open');
await page.click('.detail .seg:has-text("Alta")');
await page.fill('.detail .add-sub input', 'Revisar estado de cuenta');
await page.keyboard.press('Enter');
await page.fill('.detail textarea.notes', 'Fecha límite <script>alert(1)</script> el día 5');
await page.locator('.detail select').nth(1).selectOption({ label: 'Finanzas' });
await page.fill('.detail .tag-input', 'casa');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/e2e-detail.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const meta = await page.locator('.task-row:has-text("Pagar tarjeta")').innerText();
ok(meta.includes('Finanzas') && meta.includes('#casa') && meta.includes('0/1'), 'detalle guarda categoría, etiqueta y subtarea');
ok((await page.locator('.task-row:has-text("Pagar tarjeta") .prio-3').count()) === 1, 'prioridad alta visible');

// --- Completar y deshacer ---
await page.click('.task-row:has-text("Llamar") .check, .task-row:has-text("Preparar") .check');
await page.waitForTimeout(300);
ok((await rowCount()) === 1, 'completar retira la tarea de Hoy');
await page.click('.toast-action');
await page.waitForTimeout(300);
ok((await rowCount()) === 2, 'deshacer reabre la tarea');
await page.click('.task-row:has-text("Preparar") .check');
await page.waitForTimeout(300);
await page.goto(BASE + '#/completed');
await page.waitForSelector('.task-row');
ok((await page.locator('.task-row.is-done').count()) === 1, 'aparece en Completadas');

// --- Recurrencia ---
await page.goto(BASE + '#/today');
await page.click('text=Pagar tarjeta');
await page.waitForSelector('.detail.is-open');
await page.locator('.detail select').filter({ has: page.locator('option[value=monthly]') }).selectOption('monthly');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.click('.task-row:has-text("Pagar tarjeta") .check');
await page.waitForTimeout(400);
const counts = await page.evaluate(async () => {
  const req = indexedDB.open('the-daily-edit');
  const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  const all = await new Promise((r) => {
    const q = db.transaction('tasks').objectStore('tasks').getAll();
    q.onsuccess = () => r(q.result);
  });
  db.close();
  return all.filter((t) => t.title === 'Pagar tarjeta').map((t) => ({ status: t.status, due: t.dueDate, subs: t.subtasks.map((s) => s.done) }));
});
ok(counts.length === 2 && counts.some((c) => c.status === 'completed') && counts.some((c) => c.status === 'open'), 'recurrencia: conserva la completada y crea la siguiente');
await page.reload();
await page.waitForSelector('.main');
const after = await page.evaluate(async () => {
  const req = indexedDB.open('the-daily-edit');
  const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  const n = await new Promise((r) => {
    const q = db.transaction('tasks').objectStore('tasks').count();
    q.onsuccess = () => r(q.result);
  });
  db.close();
  return n;
});
ok(after === 6, 'reiniciar la app no duplica ocurrencias');

// --- Proyectos ---
await page.goto(BASE + '#/projects');
await page.click('text=Nuevo proyecto');
await page.fill('.modal input[placeholder^="Ej."]', 'Renovar el estudio');
await page.click('.modal button[type=submit]');
await page.waitForSelector('.project-progress');
await addTask('Elegir pintura');
await addTask('Comprar lámpara');
await page.click('.task-row:has-text("Elegir pintura") .check');
await page.waitForTimeout(300);
const pct = await page.locator('.project-progress .muted').innerText();
ok(pct.startsWith('50%'), `avance del proyecto calculado (${pct})`);
await page.screenshot({ path: `${OUT}/e2e-project.png` });

// --- Eliminar con deshacer ---
await page.goto(BASE + '#/inbox');
await page.waitForSelector('.task-row');
const inboxBefore = await rowCount();
await page.click('text=Comprar flores');
await page.click('.detail [aria-label="Más acciones"]');
await page.click('.menu-item:has-text("Eliminar")');
await page.waitForTimeout(300);
ok((await rowCount()) === inboxBefore - 1, `eliminar tarea (${inboxBefore} → ${await rowCount()})`);
await page.click('.toast:has-text("Tarea eliminada") .toast-action');
await page.waitForTimeout(300);
ok((await rowCount()) === inboxBefore, 'deshacer eliminación');

// --- Búsqueda (sin acentos) ---
await page.goto(BASE + '#/search');
await page.fill('#global-search', 'lampara');
await page.waitForTimeout(200);
ok((await rowCount()) === 1, 'búsqueda insensible a acentos');

// --- Exportar ---
await page.goto(BASE + '#/settings');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Exportar mis datos')]);
const name = download.suggestedFilename();
ok(/^the-daily-edit-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name), `nombre del respaldo: ${name}`);
const path = `${OUT}/${name}`;
await download.saveAs(path);
const backup = JSON.parse(readFileSync(path, 'utf8'));
ok(backup.format === 'the-daily-edit-backup' && backup.formatVersion === 1 && backup.data.tasks.length === 8, `respaldo contiene versión y todas las tareas (${backup.data.tasks.length})`);
ok(backup.data.projects.length === 1 && backup.data.categories.length === 6 && backup.data.tags.length === 1, 'respaldo contiene proyectos, categorías y etiquetas');

// --- Borrar datos, importar (reemplazo) ---
await page.evaluate(async () => {
  const req = indexedDB.open('the-daily-edit');
  const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  await new Promise((r) => {
    const tx = db.transaction(['tasks', 'projects'], 'readwrite');
    tx.objectStore('tasks').clear();
    tx.objectStore('projects').clear();
    tx.oncomplete = r;
  });
  db.close();
});
await page.reload();
await page.waitForSelector('.page-settings');
await page.setInputFiles('input[type=file]', path);
await page.waitForSelector('.preview-grid');
await page.screenshot({ path: `${OUT}/e2e-import.png` });
await page.click('.choice:has-text("Reemplazar")');
ok(await page.locator('button:has-text("Reemplazar mis datos")').isDisabled(), 'reemplazo exige confirmación explícita');
await page.check('.check-line input');
await page.click('button:has-text("Reemplazar mis datos")');
await page.waitForTimeout(500);
await page.goto(BASE + '#/inbox');
await page.waitForSelector('.task-row');
ok((await rowCount()) === inboxBefore, 'importación restaura las tareas');
await page.goto(BASE + '#/projects');
ok((await page.locator('.project-card').count()) === 1, 'importación restaura proyectos y relaciones');

// --- Importación inválida ---
await page.goto(BASE + '#/settings');
await page.setInputFiles('input[type=file]', { name: 'malo.json', mimeType: 'application/json', buffer: Buffer.from('{"hola":1}') });
ok(await page.locator('.notice-error:has-text("no es un respaldo")').isVisible(), 'archivo inválido muestra error claro');

// --- XSS: las notas se muestran como texto ---
ok(!errors.some((e) => e.includes('alert')), 'sin inyección de contenido');

// --- Sin conexión ---
await ctx.setOffline(true);
await page.goto(BASE + '#/today');
await page.reload();
await page.waitForSelector('.page', { timeout: 10000 });
ok(await page.locator('.banner-offline').isVisible(), 'la app abre sin conexión y lo indica');
await addTask('Tarea creada sin conexión');
ok((await page.locator('.task-row:has-text("sin conexión")').count()) === 1, 'crear tareas sin conexión');
await page.reload();
await page.waitForSelector('.task-row');
ok((await page.locator('.task-row:has-text("sin conexión")').count()) === 1, 'persisten tras recargar sin conexión');
await page.screenshot({ path: `${OUT}/e2e-offline.png` });
await ctx.setOffline(false);

// --- Atajos de teclado ---
await page.goto(BASE + '#/inbox');
await page.waitForSelector('.page');
await page.locator('body').click({ position: { x: 600, y: 700 } });
await page.keyboard.press('n');
ok(await page.locator('dialog.quick-add[open]').isVisible(), 'atajo N abre captura rápida');
await page.keyboard.press('Escape');
await page.keyboard.press('/');
await page.waitForTimeout(200);
ok(page.url().endsWith('#/search'), 'atajo / abre búsqueda');

// --- Responsive ---
for (const [w, h, label] of [
  [1180, 820, 'ipad-horizontal'],
  [820, 1180, 'ipad-vertical'],
  [390, 844, 'telefono'],
]) {
  await page.setViewportSize({ width: w, height: h });
  for (const r of ['dashboard', 'today', 'calendar', 'projects']) {
    await page.goto(BASE + '#/' + r);
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || document.querySelector('.main').scrollWidth > document.querySelector('.main').clientWidth);
    ok(!overflow, `${label} ${r}: sin desplazamiento horizontal`);
    await page.screenshot({ path: `${OUT}/rs-${label}-${r}.png` });
  }
}

ok(errors.length === 0, `sin errores en consola${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(failures ? 1 : 0);
