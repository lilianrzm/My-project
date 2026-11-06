import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { db, DailyEditDB } from '../src/db/db';
import * as repo from '../src/db/repo';
import { buildBackup, buildZipBackup, importBackup, parseBackup, parseBackupFile } from '../src/db/backup';
import { computeMetrics, EMPTY_ANALYTICS_FILTER, onTime, daysToConclude, concludedDate } from '../src/domain/analytics';
import { buildActivitiesWorkbook } from '../src/export/excel';
import { describeExtract, extractText } from '../src/docs/extract';
import { todayISO } from '../src/domain/dates';
import type { Task } from '../src/domain/types';

const lk = { categoryName: () => 'Cat', projectName: () => 'Proy', resultName: (id: string) => (id === 'res-atendida' ? 'Atendida' : 'Otro') };

beforeEach(async () => {
  await db.delete();
  await db.open();
  await repo.initDatabase();
});

describe('migración v1 → v2', () => {
  it('conserva tareas existentes y añade campos nuevos', async () => {
    db.close();
    await Dexie.delete('migra');
    const old = new Dexie('migra');
    old.version(1).stores({ tasks: 'id, status, dueDate, projectId, categoryId, completedAt, seriesId, [seriesId+dueDate], *tagIds, updatedAt', projects: 'id', categories: 'id', tags: 'id, &name', settings: 'key', activity: 'id', meta: 'key' });
    await old.open();
    await old.table('tasks').add({ id: 'a', title: 'Antigua', status: 'open', subtasks: [{ id: 's', title: 'Sub', done: true }], tagIds: [], order: 1, createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z' });
    old.close();
    const nu = new DailyEditDB('migra');
    await nu.open();
    const t = (await nu.tasks.get('a'))!;
    expect(t.title).toBe('Antigua');
    expect(t.responsible).toBe('');
    expect(t.customValues).toEqual({});
    expect(t.subtasks[0]).toMatchObject({ id: 's', done: true, completedAt: null });
    expect(nu.verno).toBe(2);
    expect((await nu.meta.get('preMigration-v2'))?.value).toBeTruthy();
    nu.close();
    await db.open();
  });
});

describe('subtareas y cierre', () => {
  it('impide completar con subtareas pendientes', async () => {
    const t = await repo.createTask({ title: 'Solicitud', subtasks: [repo.newSubtask('Revisar'), repo.newSubtask('Enviar')] });
    await expect(repo.completeTask(t.id)).rejects.toThrow(/2 subtareas pendientes/);
    const cur = (await db.tasks.get(t.id))!;
    await repo.updateTask(t.id, { subtasks: cur.subtasks.map((s) => ({ ...s, done: true, completedAt: new Date().toISOString() })) });
    expect((await db.tasks.get(t.id))!.status).toBe('open'); // la última no cierra sola
    await repo.completeTask(t.id);
    expect((await db.tasks.get(t.id))!.status).toBe('completed');
  });

  it('añadir subtarea pendiente a una completada exige reabrir', async () => {
    const t = await repo.createTask({ title: 'X' });
    await repo.completeTask(t.id);
    await expect(repo.updateTask(t.id, { subtasks: [repo.newSubtask('Nueva')] })).rejects.toThrow(/reapertura/);
    await repo.updateTask(t.id, { subtasks: [repo.newSubtask('Nueva')] }, { allowReopen: true });
    const after = (await db.tasks.get(t.id))!;
    expect(after.status).toBe('open');
    expect(after.subtasks).toHaveLength(1);
  });

  it('registro de cierre: propone fecha efectiva una sola vez y guarda historial', async () => {
    const t = await repo.createTask({ title: 'Cierre', responsible: 'Ana' });
    await repo.completeTask(t.id);
    await repo.saveClosure(t.id, { resultId: 'res-atendida' });
    let c = (await db.tasks.get(t.id))!.closure!;
    expect(c.effectiveDate).toBe(todayISO());
    expect(c.responsible).toBe('Ana');
    await repo.saveClosure(t.id, { effectiveDate: '2026-01-05' });
    await repo.saveClosure(t.id, { observations: 'ok' });
    c = (await db.tasks.get(t.id))!.closure!;
    expect(c.effectiveDate).toBe('2026-01-05'); // no se sobrescribe
    const hist = await db.activity.where('taskId').equals(t.id).toArray();
    expect(hist.filter((h) => h.type === 'closure').length).toBe(3);
  });

  it('cancelar es un estado separado y queda en el historial', async () => {
    const t = await repo.createTask({ title: 'Cancelar' });
    await repo.cancelTask(t.id);
    expect((await db.tasks.get(t.id))!.status).toBe('cancelled');
    await repo.reopenTask(t.id);
    expect((await db.tasks.get(t.id))!.status).toBe('open');
    const types = (await db.activity.where('taskId').equals(t.id).toArray()).map((a) => a.type);
    expect(types).toContain('cancelled');
  });

  it('historial registra responsable y vencimiento con valores anteriores y nuevos', async () => {
    const t = await repo.createTask({ title: 'H' });
    await repo.updateTask(t.id, { responsible: 'Luis', dueDate: '2026-12-01' });
    const ev = await db.activity.where('taskId').equals(t.id).toArray();
    const resp = ev.find((e) => e.type === 'responsible')!;
    expect(resp.changes![0]).toMatchObject({ from: null, to: 'Luis' });
    expect(ev.find((e) => e.type === 'dueDate')!.changes![0].to).toBe('2026-12-01');
  });
});

describe('campos personalizados', () => {
  it('conversiones seguras y advertencia en las destructivas', async () => {
    const f = await repo.createCustomField({ name: 'Tipo', type: 'select', options: [{ id: 'o1', label: 'Oficio' }] });
    const t = await repo.createTask({ title: 'C', customValues: { [f.id]: 'o1' } });
    await repo.updateCustomField(f.id, { type: 'multiselect' });
    expect((await db.tasks.get(t.id))!.customValues[f.id]).toEqual(['o1']);
    await expect(repo.updateCustomField(f.id, { type: 'number' })).rejects.toThrow(/eliminaría/);
    // renombrar conserva valores
    await repo.updateCustomField(f.id, { name: 'Tipo de atención' });
    expect((await db.tasks.get(t.id))!.customValues[f.id]).toEqual(['o1']);
    // archivar conserva datos
    await repo.updateCustomField(f.id, { archived: true });
    expect((await db.tasks.get(t.id))!.customValues[f.id]).toEqual(['o1']);
  });
});

describe('documentos y respaldo completo', () => {
  it('adjunta, elimina con deshacer y viaja en el ZIP', async () => {
    const t = await repo.createTask({ title: 'Con documento' });
    const file = new File(['Solicitud de información. Requiere revisar los antecedentes y preparar la respuesta correspondiente.'], 'solicitud.txt', { type: 'text/plain' });
    const att = await repo.addAttachment(t.id, file);
    expect(await db.attachments.count()).toBe(1);
    await expect(repo.addAttachment(t.id, new File(['x'], 'virus.exe'))).rejects.toThrow(/no es un tipo compatible/);

    const zip = await buildZipBackup('test');
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(entries)).toContain(`files/${att.id}`);

    const del = await repo.deleteAttachment(att.id);
    expect(await db.attachments.count()).toBe(0);
    await repo.restoreAttachment(del!);
    expect(await db.files.count()).toBe(1);

    // reemplazo desde el ZIP restaura el binario
    await db.tasks.clear();
    await db.attachments.clear();
    await db.files.clear();
    const parsed = await parseBackupFile(new File([zip], 'r.zip', { type: 'application/zip' }));
    const res = await importBackup(parsed, 'replace');
    expect(res.files).toBe(1);
    const blob = (await db.files.get(att.id))!.blob;
    expect(await blob.text()).toMatch(/Solicitud de información/);
  });

  it('eliminar una tarea elimina y restaura sus documentos', async () => {
    const t = await repo.createTask({ title: 'Doc' });
    await repo.addAttachment(t.id, new File(['hola mundo'], 'a.txt'));
    const d = await repo.deleteTasks([t.id]);
    expect(await db.attachments.count()).toBe(0);
    await repo.restoreTasks(d);
    expect(await db.attachments.count()).toBe(1);
  });

  it('acepta respaldos v1 y fusiona campos personalizados', async () => {
    const v1 = { format: 'the-daily-edit-backup', formatVersion: 1, data: { tasks: [{ id: 'old', title: 'De v1', status: 'completed', completedAt: '2026-01-02T00:00:00.000Z' }] } };
    const p = parseBackup(JSON.stringify(v1));
    expect(p.data.tasks[0].closure).toBeNull();
    await importBackup(p, 'merge');
    expect((await db.tasks.get('old'))!.status).toBe('completed');
    const f = await repo.createCustomField({ name: 'Importe', type: 'currency' });
    const json = JSON.stringify(await buildBackup('t'));
    await db.customFields.clear();
    await importBackup(parseBackup(json), 'merge');
    expect((await db.customFields.get(f.id))!.name).toBe('Importe');
  });
});

describe('indicadores', () => {
  const mk = (o: Partial<Task>): Task => ({ ...repo.buildTask({ title: 't' }), ...o });
  it('las subtareas no cuentan como actividades y las fórmulas son correctas', () => {
    const done = (created: string, concluded: string, due: string | null, subs = 0): Task =>
      mk({
        createdAt: `${created}T12:00:00.000Z`,
        status: 'completed',
        completedAt: `${concluded}T12:00:00.000Z`,
        dueDate: due,
        subtasks: Array.from({ length: subs }, (_, i) => ({ id: `s${i}`, title: 's', done: true, createdAt: null, completedAt: `${concluded}T12:00:00.000Z` })),
      } as Partial<Task>);
    const tasks = [
      done('2026-10-01', '2026-10-05', '2026-10-06', 5), // a tiempo, 4 días
      done('2026-10-01', '2026-10-11', '2026-10-06'), // tarde, 10 días
      done('2026-10-02', '2026-10-04', null), // sin vencimiento, 2 días
      mk({ status: 'cancelled', cancelledAt: new Date().toISOString() } as Partial<Task>),
      mk({ dueDate: '2026-01-01' }),
    ];
    const m = computeMetrics(tasks, EMPTY_ANALYTICS_FILTER, '2026-11-06', 1, lk);
    expect(m.completed).toBe(3); // no 8 (5 subtareas)
    expect(m.subtasksDone).toBe(5);
    expect(m.onTimePct).toBe(50); // 1 de 2 con vencimiento
    expect(m.avgDays).toBe(5.3); // (4+10+2)/3
    expect(m.pending).toBe(1);
    expect(m.overdue).toBe(1);
    expect(m.cancelled).toBe(1);
    expect(m.avgSubtasks).toBe(1); // 5 subtareas / 5 actividades
  });
  it('sin datos suficientes devuelve null, nunca divide entre cero', () => {
    const m = computeMetrics([], EMPTY_ANALYTICS_FILTER, '2026-11-06', 1, lk);
    expect(m.onTimePct).toBeNull();
    expect(m.avgDays).toBeNull();
    expect(m.avgSubtasks).toBeNull();
  });
  it('la fecha efectiva de atención prevalece en las métricas', () => {
    const t = mk({ createdAt: '2026-10-01T12:00:00.000Z', status: 'completed', completedAt: '2026-10-20T12:00:00.000Z', dueDate: '2026-10-10' } as Partial<Task>);
    t.closure = { resultId: null, attentionTypeId: null, effectiveDate: '2026-10-08', responsible: '', observations: '', folio: '', evidenceIds: [], recordedAt: '', updatedAt: '' };
    expect(concludedDate(t)).toBe('2026-10-08');
    expect(onTime(t)).toBe(true);
    expect(daysToConclude(t)).toBe(7);
  });
});

describe('Excel y extracción', () => {
  it('genera un XLSX válido con 3 hojas y una fila por actividad', async () => {
    const t = await repo.createTask({ title: '=Fórmula & <prueba>', subtasks: [repo.newSubtask('a'), repo.newSubtask('b')] });
    const ctx = { today: todayISO(), categoryById: new Map(), projectById: new Map(), tagById: new Map(), results: [], attentionTypes: [], customFields: [], attachmentCount: new Map() };
    const m = computeMetrics([t], EMPTY_ANALYTICS_FILTER, todayISO(), 1, lk);
    const bytes = buildActivitiesWorkbook([t], ctx, { metrics: m, filters: [], scope: 'all' });
    const files = unzipSync(bytes);
    const wb = strFromU8(files['xl/workbook.xml']);
    expect(wb).toContain('name="Actividades"');
    expect(wb).toContain('name="Subtareas"');
    expect(wb).toContain('name="Resumen"');
    const s1 = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect((s1.match(/<row /g) ?? []).length).toBe(2); // encabezado + 1 actividad
    expect(s1).toContain("'=Fórmula &amp; &lt;prueba&gt;");
    const s2 = strFromU8(files['xl/worksheets/sheet2.xml']);
    expect((s2.match(/<row /g) ?? []).length).toBe(3); // encabezado + 2 subtareas
  });

  it('describe por extracto sin inventar', () => {
    const d = describeExtract('Solicitud de información 683\nSe solicita la entrega administrativa del Despacho. Requiere revisar los antecedentes y preparar la respuesta correspondiente. Plazo de diez días.', 'Solicitud de información 683.pdf');
    const w = d.split(/\s+/).length;
    expect(w).toBeGreaterThanOrEqual(15);
    expect(w).toBeLessThanOrEqual(50);
    expect(d).toMatch(/entrega administrativa/);
  });

  it('extrae texto de .docx localmente', async () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Informe trimestral</w:t></w:r></w:p><w:p><w:r><w:t>Resultados de la gestión del área durante el periodo.</w:t></w:r></w:p></w:body></w:document>';
    const docx = zipSync({ 'word/document.xml': strToU8(xml) });
    const r = await extractText(new Blob([docx]), 'informe.docx');
    expect(r.status).toBe('ok');
    expect(r.text).toContain('Informe trimestral');
    expect((await extractText(new Blob(['x']), 'foto.jpg')).status).toBe('needs-ocr');
  });
});
