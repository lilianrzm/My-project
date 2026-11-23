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
/** Cierra el registro de cierre (2.0) si aparece tras completar. */
const skipClosure = async () => {
  const d = page.locator('dialog.closure-modal[open]');
  if (await d.isVisible().catch(() => false)) await d.locator('button:has-text("Omitir por ahora")').click();
  await page.waitForTimeout(150);
};
const check = async (sel) => {
  await page.click(sel);
  await page.waitForTimeout(300);
  await skipClosure();
};

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
ok(cats.join('|') === 'Personal|Salud y entrenamiento|Estudios y aprendizaje|Finanzas|Proyectos personales|Trabajo', 'áreas de vida iniciales (el trabajo es un área más)');
ok((await page.locator('.area-badge').first().innerText()) === '🌿', 'las áreas tienen emoji');

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
await page.locator('.detail select').filter({ has: page.locator('option:has-text("Sin área")') }).selectOption({ label: '💸 Finanzas' });
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
await check('.task-row:has-text("Llamar") .check, .task-row:has-text("Preparar") .check');
ok((await rowCount()) === 1, 'completar retira la tarea de Hoy');
await page.click('.toast-action');
await page.waitForTimeout(300);
ok((await rowCount()) === 2, 'deshacer reabre la tarea');
await check('.task-row:has-text("Preparar") .check');
await page.goto(BASE + '#/completed');
await page.waitForSelector('.task-row');
ok((await page.locator('.task-row.is-done').count()) === 1, 'aparece en Completadas');

// --- Recurrencia ---
await page.goto(BASE + '#/today');
await page.click('text=Pagar tarjeta');
await page.waitForSelector('.detail.is-open');
await page.click('.detail [data-panel="repeat"] summary');
await page.locator('.detail select').filter({ has: page.locator('option[value=monthly]') }).selectOption('monthly');
await page.waitForTimeout(400);
// Regla 2.0: no se puede cerrar con subtareas pendientes
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.click('.task-row:has-text("Pagar tarjeta") .check');
await page.waitForSelector('dialog[open]:has-text("Queda 1 subtarea")');
await page.click('dialog[open] button:has-text("Todavía no")');
await page.waitForTimeout(200);
ok((await page.locator('.task-row:has-text("Pagar tarjeta").is-done').count()) === 0, 'con subtareas pendientes pregunta antes de completar');
await page.click('text=Pagar tarjeta');
await page.waitForSelector('.detail.is-open');
await page.click('.detail .subtask .check');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await check('.task-row:has-text("Pagar tarjeta") .check');
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
await check('.task-row:has-text("Elegir pintura") .check');
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
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportar mis datos")')]);
const name = download.suggestedFilename();
ok(/^the-daily-edit-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name), `nombre del respaldo: ${name}`);
const path = `${OUT}/${name}`;
await download.saveAs(path);
const backup = JSON.parse(readFileSync(path, 'utf8'));
ok(backup.format === 'the-daily-edit-backup' && backup.formatVersion === 3 && backup.data.tasks.length === 8, `respaldo contiene versión y todas las tareas (${backup.data.tasks.length})`);
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
ok(await page.locator('.notice-error:has-text("no es un respaldo")').waitFor({ timeout: 5000 }).then(() => true, () => false), 'archivo inválido muestra error claro');

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


// =================== The Daily Edit 3.0 ===================
// --- Apariencia: nueva paleta alegre por defecto, vista previa, cancelar, guardar ---
await page.goto(BASE + '#/settings');
await page.waitForSelector('#apariencia');
ok((await page.evaluate(() => document.documentElement.dataset.palette)) === 'sorbet', 'paleta alegre “Sorbete” por defecto');
await page.click('#apariencia .ap-option:has-text("Rose & Cream")');
ok((await page.evaluate(() => document.documentElement.dataset.palette)) === 'rose', 'apariencia: vista previa inmediata');
await page.click('#apariencia button:has-text("Cancelar cambios")');
ok((await page.evaluate(() => document.documentElement.dataset.palette)) === 'sorbet', 'apariencia: cancelar revierte');
await page.click('#apariencia .ap-option:has-text("Sage & Linen")');
await page.click('#apariencia .ap-option:has-text("Editorial")');
await page.click('#apariencia button:has-text("Guardar apariencia")');
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'domcontentloaded' });
const early = await page.evaluate(() => [document.documentElement.dataset.palette, document.documentElement.dataset.font].join('|'));
ok(early === 'sage|editorial', `apariencia persiste sin destello (${early})`);
await page.waitForSelector('#apariencia');
await page.click('#apariencia button:has-text("Restablecer diseño original")');
await page.click('#apariencia button:has-text("Guardar apariencia")');
await page.waitForTimeout(300);
ok((await page.evaluate(() => document.documentElement.dataset.palette)) === 'sorbet', 'restablecer diseño original');
ok((await page.locator('text=Campos personalizados').count()) === 0 && (await page.locator('text=Seguimiento y cierre').count()) === 0, 'sin secciones de “rigor” en Configuración');

// --- Nueva área con emoji ---
await page.click('button:has-text("Nueva área")');
await page.fill('.modal input[maxlength="120"]', 'Mascotas');
await page.click('.modal .emoji-opt[aria-label="🐾"]');
await page.click('.modal button[type=submit]');
await page.waitForTimeout(300);
ok((await page.locator('.manage-item:has-text("Mascotas") .area-badge').innerText()) === '🐾', 'crear un área con emoji');

// --- Tarea con área desde la captura rápida, subtareas y documento ---
await page.goto(BASE + '#/today');
await page.waitForSelector('.page');
await page.click('.fab');
await page.fill('.qa-input', 'Bañar a Luna');
await page.click('.quick-add .area-chip:has-text("Mascotas")');
await page.click('.quick-add button[type=submit]');
await page.waitForTimeout(300);
ok((await page.locator('.task-row:has-text("Bañar a Luna") .tag-cat:has-text("🐾")').count()) === 1, 'la captura rápida asigna el área con un toque');
ok((await page.locator('.group-toggle:has-text("Mascotas")').count()) === 1, 'Hoy agrupado por área');
await page.click('text=Bañar a Luna');
await page.waitForSelector('.detail.is-open');
ok((await page.locator('.detail:has-text("Folio")').count()) === 0 && (await page.locator('.detail:has-text("Responsable")').count()) === 0, 'detalle sin folio ni responsable');
await page.click('.detail .detail-expand');
ok(await page.locator('.detail.is-expanded').isVisible(), 'el panel se expande');
for (const sub of ['Preparar toalla', 'Champú']) {
  await page.fill('.detail .add-sub input[aria-label="Nueva subtarea"]', sub);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
}
await page.setInputFiles('.detail input[type=file]', { name: 'Cuidados.txt', mimeType: 'text/plain', buffer: Buffer.from('Cuidados de Luna\nBañarla cada tres semanas con champú suave y secarla bien. Revisar orejas y uñas después del baño.') });
await page.waitForFunction(() => document.querySelector('.att-desc')?.value?.length > 20, null, { timeout: 8000 }).catch(() => null);
ok(/Bañarla cada tres semanas/.test(await page.locator('.att-desc').inputValue()), 'documento adjunto con extracto automático');
await page.click('.detail-top-actions button:has-text("Completar")');
await page.waitForSelector('dialog[open]:has-text("Quedan 2 subtareas")');
await page.click('dialog[open] button:has-text("Completar todo")');
await page.waitForTimeout(400);
ok((await page.locator('.detail .subtask.is-done').count()) === 2, '“Completar todo” marca también las subtareas');
ok((await page.locator('dialog.closure-modal').count()) === 0, 'ya no aparece el registro de cierre');
ok(await page.locator('.toast-msg').first().isVisible(), 'mensaje de ánimo al completar');
await page.click('.detail .detail-expand');
await page.keyboard.press('Escape');

// --- Hábitos ---
await page.goto(BASE + '#/habits');
await page.waitForSelector('.page');
await page.click('button:has-text("Tomar 8 vasos de agua")');
await page.click('.modal button:has-text("Crear hábito")');
await page.waitForTimeout(300);
await page.click('button:has-text("Nuevo hábito")');
await page.fill('.modal input[placeholder="Ej. Leer 10 minutos"]', 'Leer 10 minutos');
await page.click('.modal .emoji-opt[aria-label="📚"]');
await page.click('.modal button:has-text("Crear hábito")');
await page.waitForTimeout(300);
ok((await page.locator('.habit-card').count()) === 2, 'crear hábitos (también desde sugerencias)');
await page.click('.habit-today-item:has-text("agua") .habit-check');
await page.waitForTimeout(300);
ok((await page.locator('.habit-today-item:has-text("agua") .habit-check.is-done').count()) === 1, 'marcar un hábito de hoy');
await page.click('.habit-today-item:has-text("Leer") .habit-check');
await page.waitForTimeout(500);
ok(await page.locator('.toast:has-text("Todos tus hábitos de hoy")').isVisible(), 'celebración al cumplir todos los hábitos del día');
ok((await page.locator('.habit-card:has-text("agua") .habit-stats strong').first().innerText()) === '1', 'la racha empieza al cumplirlo');
ok(await page.locator('.habit-card:has-text("agua") .hw-day').nth(5).isDisabled(), 'no se marcan días anteriores a la creación del hábito');
await page.click('.habit-today-item:has-text("Leer") .habit-check');
await page.waitForTimeout(200);
await page.click('.habit-today-item:has-text("Leer") .habit-check');
await page.waitForTimeout(200);
ok((await page.locator('.habit-card:has-text("Leer") .hw-day.is-done').count()) === 1, 'marcar dos veces no duplica');
await page.screenshot({ path: `${OUT}/v3-habits-e2e.png` });

// --- Metas ---
await page.goto(BASE + '#/goals');
await page.click('button:has-text("Crear mi primera meta")');
await page.fill('.modal input[placeholder^="Ej. Leer"]', 'Leer 3 libros');
await page.locator('.modal input[inputmode=decimal]').fill('3');
await page.fill('.modal input[placeholder="libros, km, $"]', 'libros');
await page.click('.modal button:has-text("Crear meta")');
await page.waitForTimeout(300);
const card = page.locator('.goal-card:has-text("Leer 3 libros")');
await card.locator('button:has-text("1")').first().click();
await card.locator('button:has-text("1")').first().click();
await page.waitForTimeout(200);
ok((await card.locator('.goal-label').innerText()) === '2 de 3 libros', 'avance de una meta numérica');
await card.locator('button:has-text("1")').first().click();
await page.waitForTimeout(400);
ok(await page.locator('.toast:has-text("Meta lograda")').isVisible(), 'la meta se celebra al alcanzarla');
ok((await page.locator('.goal-card.is-achieved:has-text("Leer 3 libros")').count()) === 1, 'meta pasa a “Logradas”');
await page.click('button:has-text("Nueva meta")');
await page.fill('.modal input[placeholder^="Ej. Leer"]', 'Organizar la casa');
await page.click('.modal .seg:has-text("Con pasos")');
await page.click('.modal button:has-text("Crear meta")');
await page.waitForTimeout(300);
await page.locator('.goal-card:has-text("Organizar la casa") button:has-text("Añadir paso")').click();
await page.fill('.qa-input', 'Ordenar el clóset');
await page.click('.quick-add button[type=submit]');
await page.waitForTimeout(300);
ok((await page.locator('.goal-card:has-text("Organizar la casa") .goal-label').innerText()) === '0 de 1 pasos', 'pasos vinculados a una meta');
await page.screenshot({ path: `${OUT}/v3-goals-e2e.png` });

// --- Diario y Mis logros ---
await page.goto(BASE);
await page.waitForSelector('.journal-card');
await page.click('.journal-card .mood[aria-label="Muy bien"]');
await page.fill('.journal-card input', 'Un paseo al sol');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
ok((await page.locator('.area-card').count()) >= 1, 'inicio con tarjetas de colores por área');
ok(await page.locator('.streak-pill').isVisible(), 'racha visible en el inicio');
await page.goto(BASE + '#/achievements');
await page.waitForSelector('.win-stats');
ok(Number(await page.locator('.win-goals .win-num').innerText()) >= 1, 'Mis logros cuenta metas logradas');
ok(Number(await page.locator('.win-habits .win-num').innerText()) >= 2, 'Mis logros cuenta hábitos cumplidos');
ok((await page.locator('.mood-day:has-text("😊")').count()) >= 1, 'ánimo registrado en la tira de 30 días');
ok((await page.locator('.gratitude-list:has-text("Un paseo al sol")').count()) === 1, 'gratitud registrada');
ok((await page.locator('.moment-goal').count()) >= 1, 'momentos: meta lograda en la línea de tiempo');
await page.screenshot({ path: `${OUT}/v3-achievements-e2e.png` });

// --- Excel y respaldos v3 ---
await page.goto(BASE + '#/settings');
const { unzipSync, strFromU8 } = createRequire(import.meta.url)('fflate');
const [xl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportar a Excel")')]);
const xlPath = `${OUT}/${xl.suggestedFilename()}`;
await xl.saveAs(xlPath);
const xlFiles = unzipSync(readFileSync(xlPath));
const wb = strFromU8(xlFiles['xl/workbook.xml']);
ok(['Tareas', 'Subtareas', 'Metas', 'Hábitos', 'Resumen'].every((n) => wb.includes(`name="${n}"`)), `Excel real con tareas, subtareas, metas y hábitos (${xl.suggestedFilename()})`);
ok(!strFromU8(xlFiles['xl/worksheets/sheet1.xml']).includes('Folio'), 'Excel sin columnas de “rigor”');
const [zipDl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Respaldo completo")')]);
const zipPath = `${OUT}/${zipDl.suggestedFilename()}`;
await zipDl.saveAs(zipPath);
const bk = JSON.parse(strFromU8(unzipSync(readFileSync(zipPath))['backup.json']));
ok(bk.formatVersion === 3 && bk.data.goals.length === 2 && bk.data.habits.length === 2 && bk.data.habitLogs.length >= 2 && bk.data.journal.length === 1, 'respaldo v3 incluye metas, hábitos, registros y diario');
await page.setInputFiles('input[type=file][accept*="zip"]', zipPath);
await page.waitForSelector('.preview-grid');
await page.click('.modal button:has-text("Fusionar e importar")');
await page.waitForTimeout(400);
await page.goto(BASE + '#/habits');
await page.waitForTimeout(300);
ok((await page.locator('.habit-card').count()) === 2, 'fusionar el respaldo no duplica hábitos');

// --- Sin conexión con funciones 3.0 ---
await ctx.setOffline(true);
await page.goto(BASE + '#/goals');
await page.reload();
await page.waitForSelector('.goal-card', { timeout: 10000 });
ok(true, 'Metas abre sin conexión');
await ctx.setOffline(false);

// --- Responsive ---
for (const [w, h, label] of [
  [1180, 820, 'ipad-horizontal'],
  [820, 1180, 'ipad-vertical'],
  [390, 844, 'telefono'],
]) {
  await page.setViewportSize({ width: w, height: h });
  for (const r of ['dashboard', 'today', 'habits', 'goals', 'achievements', 'calendar', 'settings']) {
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
