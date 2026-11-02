import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import * as repo from '../src/db/repo';
import { buildBackup, importBackup, parseBackup, restorePreImportSnapshot } from '../src/db/backup';
import { todayISO, addDays } from '../src/domain/dates';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await repo.initDatabase();
});

describe('tareas', () => {
  it('siembra categorías una sola vez', async () => {
    await repo.initDatabase();
    expect(await db.categories.count()).toBe(6);
    await repo.deleteCategory('cat-trabajo', null);
    await repo.initDatabase();
    expect(await db.categories.count()).toBe(5);
  });

  it('crea, edita, completa, reabre y elimina', async () => {
    const t = await repo.createTask({ title: '  Comprar flores  ' });
    expect(t.title).toBe('Comprar flores');
    await repo.updateTask(t.id, { priority: 3, notes: '<b>hola</b>' });
    expect((await db.tasks.get(t.id))!.priority).toBe(3);
    await repo.completeTask(t.id);
    expect((await db.tasks.get(t.id))!.status).toBe('completed');
    await repo.reopenTask(t.id);
    expect((await db.tasks.get(t.id))!.completedAt).toBeNull();
    const removed = await repo.deleteTasks([t.id]);
    expect(await db.tasks.count()).toBe(0);
    await repo.restoreTasks(removed);
    expect(await db.tasks.count()).toBe(1);
  });

  it('rechaza títulos vacíos', async () => {
    await expect(repo.createTask({ title: '   ' })).rejects.toThrow();
  });

  it('recurrencia: genera una sola siguiente ocurrencia y conserva el historial', async () => {
    const today = todayISO();
    const t = await repo.createTask({ title: 'Regar plantas', dueDate: today, recurrence: { freq: 'daily', interval: 1, anchor: today, weekdays: [], until: null } });
    const { next } = await repo.completeTask(t.id);
    expect(next!.dueDate).toBe(addDays(today, 1));
    expect(next!.seriesId).toBe(t.id);
    // completar de nuevo la misma no duplica
    await repo.completeTask(t.id);
    expect(await db.tasks.count()).toBe(2);
    // reabrir retira la ocurrencia no modificada
    await repo.reopenTask(t.id);
    expect(await db.tasks.count()).toBe(1);
    await repo.completeTask(t.id);
    expect(await db.tasks.count()).toBe(2);
    expect((await db.tasks.get(t.id))!.status).toBe('completed');
  });

  it('eliminar categoría reasigna tareas sin borrarlas', async () => {
    const t = await repo.createTask({ title: 'Informe', categoryId: 'cat-trabajo' });
    await repo.deleteCategory('cat-trabajo', 'cat-personal');
    expect((await db.tasks.get(t.id))!.categoryId).toBe('cat-personal');
  });

  it('eliminar proyecto conservando tareas y deshacer', async () => {
    const p = await repo.createProject({ name: 'Mudanza' });
    const t = await repo.createTask({ title: 'Cajas', projectId: p.id });
    const d = await repo.deleteProject(p.id, 'keep');
    expect((await db.tasks.get(t.id))!.projectId).toBeNull();
    await repo.undoDeleteProject(d!);
    expect((await db.tasks.get(t.id))!.projectId).toBe(p.id);
  });

  it('reordena', async () => {
    const a = await repo.createTask({ title: 'A', order: 1 });
    const b = await repo.createTask({ title: 'B', order: 2 });
    const c = await repo.createTask({ title: 'C', order: 3 });
    await repo.reorderTasks([c.id, a.id, b.id]);
    const sorted = (await db.tasks.toArray()).sort((x, y) => x.order - y.order).map((x) => x.title);
    expect(sorted).toEqual(['C', 'A', 'B']);
  });
});

describe('respaldos', () => {
  it('exporta e importa en modo reemplazo', async () => {
    const p = await repo.createProject({ name: 'Viaje' });
    const tag = await repo.getOrCreateTag('casa');
    await repo.createTask({ title: 'Pasaporte', projectId: p.id, tagIds: [tag.id] });
    const json = JSON.stringify(await buildBackup('test'));
    await db.tasks.clear();
    await repo.createTask({ title: 'Otra' });
    const parsed = parseBackup(json);
    expect(parsed.data.tasks).toHaveLength(1);
    await importBackup(parsed, 'replace');
    const tasks = await db.tasks.toArray();
    expect(tasks.map((t) => t.title)).toEqual(['Pasaporte']);
    expect(tasks[0].projectId).toBe(p.id);
    // se puede volver al estado previo
    await restorePreImportSnapshot();
    expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(['Otra']);
  });

  it('fusiona sin duplicar y gana el más reciente', async () => {
    const t = await repo.createTask({ title: 'Original' });
    const backup = await buildBackup('test');
    await repo.updateTask(t.id, { title: 'Editada localmente' });
    await repo.createTask({ title: 'Nueva local' });
    const res = await importBackup(parseBackup(JSON.stringify(backup)), 'merge');
    expect(await db.tasks.count()).toBe(2);
    expect((await db.tasks.get(t.id))!.title).toBe('Editada localmente');
    expect(res.added).toBe(0);
  });

  it('unifica etiquetas por nombre al fusionar', async () => {
    const backup = await buildBackup('test');
    backup.data.tags = [{ id: 'x1', name: 'Casa', createdAt: new Date().toISOString() }];
    backup.data.tasks = [{ ...(await repo.buildTask({ title: 'Con etiqueta', tagIds: ['x1'] })) }];
    const local = await repo.getOrCreateTag('casa');
    await importBackup(parseBackup(JSON.stringify(backup)), 'merge');
    const imported = (await db.tasks.toArray()).find((x) => x.title === 'Con etiqueta')!;
    expect(imported.tagIds).toEqual([local.id]);
    expect(await db.tags.count()).toBe(1);
  });

  it('rechaza archivos inválidos', () => {
    expect(() => parseBackup('no json')).toThrow(/JSON/);
    expect(() => parseBackup('{"format":"otro"}')).toThrow(/no es un respaldo/);
    expect(() => parseBackup('{"format":"the-daily-edit-backup","formatVersion":99,"data":{}}')).toThrow(/más nueva/);
  });

  it('omite registros inválidos y limpia referencias rotas', () => {
    const p = parseBackup(JSON.stringify({
      format: 'the-daily-edit-backup', formatVersion: 1, data: {
        tasks: [{ id: 'a', title: 'Ok', projectId: 'no-existe' }, { id: 'b', title: '' }, { title: 'sin id' }],
      },
    }));
    expect(p.data.tasks).toHaveLength(1);
    expect(p.data.tasks[0].projectId).toBeNull();
    expect(p.warnings.length).toBe(2);
  });

  it('migra la lista anterior de localStorage una sola vez', async () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    store.set('lista-de-tareas', JSON.stringify([{ id: 'x', texto: 'Vieja', hecha: false }, { id: 'y', texto: 'Hecha', hecha: true }]));
    await repo.initDatabase();
    await repo.initDatabase();
    expect(await db.tasks.count()).toBe(2);
    expect(store.has('lista-de-tareas')).toBe(true);
    delete (globalThis as any).localStorage;
  });
});
