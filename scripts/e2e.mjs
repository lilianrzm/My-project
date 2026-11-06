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
await page.waitForTimeout(300);
ok(await page.locator('.toast:has-text("subtarea pendiente")').isVisible(), 'impide completar con subtareas pendientes');
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
ok(backup.format === 'the-daily-edit-backup' && backup.formatVersion === 2 && backup.data.tasks.length === 8, `respaldo contiene versión y todas las tareas (${backup.data.tasks.length})`);
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


// =================== The Daily Edit 2.0 ===================
// --- Apariencia: vista previa, cancelar, guardar y persistencia sin destello ---
await page.goto(BASE + '#/settings');
await page.waitForSelector('#apariencia');
await page.click('#apariencia .ap-option:has-text("Rose & Cream")');
await page.click('#apariencia .ap-option:has-text("Editorial")');
ok((await page.evaluate(() => document.documentElement.dataset.palette)) === 'rose', 'apariencia: vista previa inmediata de la paleta');
await page.click('#apariencia button:has-text("Cancelar cambios")');
ok((await page.evaluate(() => document.documentElement.dataset.palette)) === 'olive', 'apariencia: cancelar revierte');
await page.click('#apariencia .ap-option:has-text("Sage & Linen")');
await page.click('#apariencia .ap-option:has-text("Editorial")');
await page.click('#apariencia .seg:has-text("Más redondeadas")');
await page.screenshot({ path: `${OUT}/v2-appearance.png` });
await page.click('#apariencia button:has-text("Guardar apariencia")');
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'domcontentloaded' });
const early = await page.evaluate(() => [document.documentElement.dataset.palette, document.documentElement.dataset.font, document.documentElement.dataset.radius].join('|'));
ok(early === 'sage|editorial|round', `apariencia persiste y se aplica antes de cargar la app (${early})`);
await page.waitForSelector('#apariencia');
await page.screenshot({ path: `${OUT}/v2-sage-editorial.png` });
await page.click('#apariencia button:has-text("Restablecer diseño original")');
await page.click('#apariencia button:has-text("Guardar apariencia")');
await page.waitForTimeout(300);
ok((await page.evaluate(() => document.documentElement.dataset.font)) === 'playful', 'restablecer diseño original');

// --- Campo personalizado (selección única, ámbito: todas) ---
await page.click('button:has-text("Nuevo campo")');
await page.fill('.modal input[placeholder="Ej. Tipo de atención"]', 'Canal');
await page.locator('.modal select').first().selectOption('select');
for (const o of ['Oficio', 'Correo']) {
  await page.fill('.modal input[placeholder^="Añadir opción y pulsar"]', o);
  await page.keyboard.press('Enter');
}
await page.click('.modal button:has-text("Guardar campo")');
await page.waitForTimeout(300);
ok((await page.locator('.manage-name:has-text("Canal")').count()) === 1, 'crear campo personalizado');

// --- Actividad con subtareas, documento, campo y cierre ---
await page.goto(BASE + '#/today');
await page.waitForSelector('.page');
await addTask('Atender solicitud de información');
await page.click('text=Atender solicitud de información');
await page.waitForSelector('.detail.is-open');
await page.click('.detail .detail-expand');
await page.waitForTimeout(300);
ok(await page.locator('.detail.is-expanded').isVisible(), 'el panel de detalles se expande');
for (const sub of ['Revisar documentación', 'Consultar área responsable', 'Enviar oficio']) {
  await page.fill('.detail .add-sub input[aria-label="Nueva subtarea"]', sub);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
}
ok((await page.locator('.detail .subtask').count()) === 3, 'añadir subtareas');
await page.locator('[data-panel="custom"] select').selectOption({ label: 'Oficio' });
await page.fill('.detail input[placeholder="Opcional"]', 'Ana');
await page.keyboard.press('Enter');
await page.setInputFiles('.detail input[type=file]', { name: 'Solicitud de información 683.txt', mimeType: 'text/plain', buffer: Buffer.from('Solicitud de información 683\nSe solicita la entrega administrativa del Despacho. Requiere revisar los antecedentes y preparar la respuesta correspondiente en un plazo de diez días hábiles.') });
await page.waitForSelector('.att-name:has-text("683")');
await page.waitForFunction(() => document.querySelector('.att-desc')?.value?.length > 20, null, { timeout: 5000 }).catch(() => null);
const desc = await page.locator('.att-desc').inputValue();
ok(/entrega administrativa/.test(desc), `descripción automática por extracto (${desc.split(/\s+/).length} palabras)`);
await page.screenshot({ path: `${OUT}/v2-detail-expanded.png` });
await page.click('.detail-top-actions button:has-text("Completar")');
await page.waitForTimeout(300);
ok(await page.locator('.toast:has-text("3 subtareas pendientes")').isVisible(), 'no se completa con subtareas pendientes');
for (let i = 0; i < 3; i++) {
  await page.locator('.detail .subtask:not(.is-done) .check').first().click();
  await page.waitForTimeout(200);
}
ok((await page.locator('.detail .status-pill').innerText()) === 'Pendiente', 'la última subtarea no cierra sola la actividad');
await page.click('.detail-top-actions button:has-text("Completar")');
await page.waitForSelector('dialog.closure-modal[open]');
await page.waitForTimeout(200);
ok(/^\d{4}-\d{2}-\d{2}$/.test(await page.locator('dialog.closure-modal input[type=date]').inputValue()), 'cierre: propone la fecha efectiva de atención');
await page.locator('dialog.closure-modal select').first().selectOption({ label: 'Atendida' });
await page.locator('dialog.closure-modal select').nth(1).selectOption({ label: 'Oficio' });
await page.fill('dialog.closure-modal textarea', 'Respuesta enviada por oficio.');
await page.screenshot({ path: `${OUT}/v2-closure.png` });
await page.click('dialog.closure-modal button:has-text("Guardar registro")');
await page.waitForTimeout(300);
await page.click('.detail [data-panel="closure"] summary').catch(() => null);
ok((await page.locator('.closure-summary:has-text("Atendida")').count()) === 1, 'registro de cierre guardado y visible');
// añadir subtarea a completada pide reabrir
await page.fill('.detail .add-sub input[aria-label="Nueva subtarea"]', 'Archivar expediente');
await page.keyboard.press('Enter');
await page.waitForSelector('dialog[open]:has-text("¿Reabrir la actividad?")');
ok(true, 'añadir subtarea a una completada pide confirmar la reapertura');
await page.click('dialog[open] button:has-text("Cancelar")');
await page.waitForTimeout(200);
ok((await page.locator('.detail .subtask').count()) === 3, 'cancelar no modifica la actividad');
await page.click('.detail [data-panel="history"] summary');
ok((await page.locator('.history li').count()) >= 3, 'historial de cambios visible');
await page.click('.detail .detail-expand');
await page.keyboard.press('Escape');

// --- Hoy agrupado por categoría ---
await page.goto(BASE + '#/today');
await addTask('Llamar al banco');
await page.click('text=Llamar al banco');
await page.locator('.detail select').filter({ has: page.locator('option:has-text("Sin categoría")') }).first().selectOption({ label: 'Finanzas' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok((await page.locator('.group-toggle:has-text("Finanzas")').count()) === 1, 'Hoy agrupado por categoría (predeterminado)');
await page.click('.group-toggle:has-text("Finanzas")');
ok((await page.locator('.task-row:has-text("Llamar al banco")').count()) === 0, 'los grupos se contraen');
await page.click('.group-toggle:has-text("Finanzas")');
await page.screenshot({ path: `${OUT}/v2-today-grouped.png` });

// --- Análisis ---
await page.goto(BASE + '#/analysis');
await page.waitForSelector('.kpi-grid');
const completedKpi = await page.locator('.kpi-completed .kpi-value').innerText();
ok(Number(completedKpi) >= 1, `indicador de completadas (${completedKpi})`);
const subKpi = await page.locator('.kpi-subtasksDone .kpi-value').innerText();
ok(Number(subKpi) >= 3, `subtareas contadas aparte (${subKpi})`);
await page.locator('.an-filters select').filter({ has: page.locator('option:has-text("Atendida parcialmente")') }).selectOption({ label: 'Atendida' });
await page.waitForTimeout(200);
ok((await page.locator('.kpi-completed .kpi-value').innerText()) === '1', 'los filtros actualizan los indicadores');
ok((await page.locator('.rtable tbody tr').count()) >= 1, 'tabla de registros');
await page.screenshot({ path: `${OUT}/v2-analysis.png`, fullPage: false });
await page.click('button:has-text("Exportar a Excel")');
const [xl] = await Promise.all([page.waitForEvent('download'), page.click('.modal button:has-text("Exportar todos los registros")')]);
const xlPath = `${OUT}/${xl.suggestedFilename()}`;
await xl.saveAs(xlPath);
const { unzipSync, strFromU8 } = createRequire(import.meta.url)('fflate');
const xlFiles = unzipSync(readFileSync(xlPath));
const wb = strFromU8(xlFiles['xl/workbook.xml']);
ok(['Actividades', 'Subtareas', 'Resumen'].every((n) => wb.includes(`name="${n}"`)), `Excel real con 3 hojas (${xl.suggestedFilename()})`);
const sheet1 = strFromU8(xlFiles['xl/worksheets/sheet1.xml']);
ok(sheet1.includes('Canal') && sheet1.includes('Oficio'), 'Excel incluye campos personalizados');
ok((strFromU8(xlFiles['xl/worksheets/sheet2.xml']).match(/Revisar documentación/g) ?? []).length === 1, 'Excel: subtareas en su hoja, sin duplicar actividades');

// --- Respaldo completo ZIP con documentos ---
await page.goto(BASE + '#/settings');
const [zipDl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Respaldo completo")')]);
const zipPath = `${OUT}/${zipDl.suggestedFilename()}`;
await zipDl.saveAs(zipPath);
const zipEntries = unzipSync(readFileSync(zipPath));
ok(!!zipEntries['backup.json'] && Object.keys(zipEntries).some((k) => k.startsWith('files/')), 'respaldo ZIP con manifiesto y documentos');
await page.setInputFiles('input[type=file][accept*="zip"]', zipPath);
await page.waitForSelector('.preview-grid');
ok((await page.locator('.preview-grid div:has-text("Documentos") dd').innerText()) === '1', 'vista previa del ZIP muestra documentos');
await page.click('.modal button:has-text("Fusionar e importar")');
await page.waitForTimeout(400);
ok(await page.locator('.toast:has-text("Importación completada")').isVisible(), 'importar ZIP (fusión)');

// --- Offline con funciones 2.0 ---
await ctx.setOffline(true);
await page.goto(BASE + '#/analysis');
await page.reload();
await page.waitForSelector('.kpi-grid', { timeout: 10000 });
ok(true, 'Análisis abre sin conexión');
await ctx.setOffline(false);

// --- Responsive ---
for (const [w, h, label] of [
  [1180, 820, 'ipad-horizontal'],
  [820, 1180, 'ipad-vertical'],
  [390, 844, 'telefono'],
]) {
  await page.setViewportSize({ width: w, height: h });
  for (const r of ['dashboard', 'today', 'calendar', 'projects', 'analysis', 'settings']) {
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
