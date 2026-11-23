import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, DailyEditDB } from '../src/db/db';
import * as repo from '../src/db/repo';
import { buildBackup, importBackup, parseBackup } from '../src/db/backup';
import { activeDays, bestHabitStreak, dayStreak, goalProgress, habitRate, habitStreak, isScheduled, logSet } from '../src/domain/personal';
import type { Habit } from '../src/domain/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await repo.initDatabase();
});

const habit = (o: Partial<Habit> = {}): Habit => ({ id: 'h', title: 'Agua', emoji: '💧', color: '#9FD3A8', categoryId: null, weekdays: [], archived: false, order: 0, createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '', ...o });

describe('migración v2 → v3', () => {
  it('añade emoji a las áreas, colores alegres y conserva todo', async () => {
    db.close();
    await Dexie.delete('mig3');
    const v2 = new Dexie('mig3');
    v2.version(1).stores({ tasks: 'id, status, dueDate, projectId, categoryId, completedAt, seriesId, [seriesId+dueDate], *tagIds, updatedAt', projects: 'id, status, order', categories: 'id, order', tags: 'id, &name', settings: 'key', activity: 'id, at, taskId, projectId', meta: 'key' });
    v2.version(2).stores({ customFields: 'id, order', attachments: 'id, taskId, addedAt', files: 'id' });
    await v2.open();
    await v2.table('categories').bulkAdd([
      { id: 'cat-salud', name: 'Salud', color: '#A7B09A', order: 0 },
      { id: 'cat-finanzas', name: 'Finanzas', color: '#123456', order: 1 },
      { id: 'mia', name: 'Mía', color: '#D9A9B4', order: 2 },
    ]);
    await v2.table('tasks').add({ id: 't', title: 'Vieja', status: 'open', subtasks: [], tagIds: [], customValues: {}, order: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    v2.close();
    const v3 = new DailyEditDB('mig3');
    await v3.open();
    const cats = await v3.categories.toArray();
    expect(cats.find((c) => c.id === 'cat-salud')).toMatchObject({ emoji: '💪', color: '#9FD3A8' });
    expect(cats.find((c) => c.id === 'cat-finanzas')).toMatchObject({ emoji: '💸', color: '#123456' }); // color propio intacto
    expect(cats.find((c) => c.id === 'mia')).toMatchObject({ emoji: '✨', color: '#D9A9B4' });
    expect((await v3.tasks.get('t'))!.goalId).toBeNull();
    v3.close();
    await db.open();
  });
});

describe('metas', () => {
  it('meta numérica se logra al alcanzar el objetivo', async () => {
    const g = await repo.createGoal({ title: 'Leer 12 libros', kind: 'count', target: 12, unit: 'libros' });
    expect((await repo.updateGoal(g.id, { current: 11 })).achieved).toBe(false);
    expect((await repo.updateGoal(g.id, { current: 12 })).achieved).toBe(true);
    expect((await db.goals.get(g.id))!.status).toBe('achieved');
  });
  it('progreso por tareas vinculadas y eliminar conserva las tareas', async () => {
    const g = await repo.createGoal({ title: 'Mudanza', kind: 'tasks' });
    const a = await repo.createTask({ title: 'Cajas', goalId: g.id });
    await repo.createTask({ title: 'Flete', goalId: g.id });
    await repo.completeTask(a.id);
    const p = goalProgress((await db.goals.get(g.id))!, await db.tasks.toArray());
    expect(p).toMatchObject({ value: 1, total: 2, pct: 50 });
    const d = await repo.deleteGoal(g.id);
    expect(await db.tasks.count()).toBe(2);
    expect((await db.tasks.get(a.id))!.goalId).toBeNull();
    await repo.restoreGoal(d!);
    expect((await db.tasks.get(a.id))!.goalId).toBe(g.id);
  });
});

describe('hábitos y rachas', () => {
  it('marcar dos veces el mismo día no duplica', async () => {
    const h = await repo.createHabit({ title: 'Agua' });
    expect(await repo.toggleHabit(h.id, '2026-11-20')).toBe(true);
    expect(await repo.toggleHabit(h.id, '2026-11-20')).toBe(false);
    await repo.toggleHabit(h.id, '2026-11-20');
    expect(await db.habitLogs.count()).toBe(1);
  });
  it('racha: hoy sin marcar no rompe; un día sin cumplir sí', () => {
    const h = habit();
    const done = new Set(['2026-11-20', '2026-11-21', '2026-11-22']);
    expect(habitStreak(h, done, '2026-11-23')).toBe(3);
    done.add('2026-11-23');
    expect(habitStreak(h, done, '2026-11-23')).toBe(4);
    expect(habitStreak(h, new Set(['2026-11-20', '2026-11-22']), '2026-11-23')).toBe(1);
  });
  it('días que no tocan no rompen la racha', () => {
    // lunes, miércoles y viernes
    const h = habit({ weekdays: [1, 3, 5] });
    expect(isScheduled(h, '2026-11-22')).toBe(false); // domingo
    const done = new Set(['2026-11-16', '2026-11-18', '2026-11-20']);
    expect(habitStreak(h, done, '2026-11-22')).toBe(3);
    expect(bestHabitStreak(h, done, '2026-11-22')).toBe(3);
    expect(habitRate(h, done, '2026-11-22', 7)).toBe(100);
  });
  it('racha general con tareas y hábitos', () => {
    const logs = [{ id: 'h:2026-11-21', habitId: 'h', date: '2026-11-21', at: '' }];
    const tasks = [{ ...repo.buildTask({ title: 'x' }), status: 'completed' as const, completedAt: '2026-11-22T15:00:00' }];
    const act = activeDays(tasks, logs);
    expect(dayStreak(act, '2026-11-23')).toBe(2);
    expect(logSet(logs, 'h').has('2026-11-21')).toBe(true);
  });
});

describe('completar con subtareas', () => {
  it('puede completar las subtareas pendientes de una vez', async () => {
    const t = await repo.createTask({ title: 'Viaje', subtasks: [repo.newSubtask('Maleta'), repo.newSubtask('Boletos')] });
    await expect(repo.completeTask(t.id)).rejects.toThrow();
    await repo.completeTask(t.id, { completeSubtasks: true });
    const after = (await db.tasks.get(t.id))!;
    expect(after.status).toBe('completed');
    expect(after.subtasks.every((s) => s.done && s.completedAt)).toBe(true);
  });
});

describe('respaldo v3', () => {
  it('incluye metas, hábitos, registros y diario', async () => {
    const g = await repo.createGoal({ title: 'Correr 10K' });
    const h = await repo.createHabit({ title: 'Meditar', weekdays: [1, 2] });
    await repo.toggleHabit(h.id, '2026-11-23');
    await repo.saveJournal('2026-11-23', { mood: 4, gratitude: 'Mi familia', proud: 'Terminé el curso' });
    await repo.createTask({ title: 'Entrenar', goalId: g.id });
    const json = JSON.stringify(await buildBackup('t'));
    await Promise.all([db.goals.clear(), db.habits.clear(), db.habitLogs.clear(), db.journal.clear(), db.tasks.clear()]);
    const parsed = parseBackup(json);
    expect(parsed.meta.formatVersion).toBe(3);
    await importBackup(parsed, 'merge');
    expect(await db.goals.count()).toBe(1);
    expect((await db.habits.get(h.id))!.weekdays).toEqual([1, 2]);
    expect(await db.habitLogs.count()).toBe(1);
    expect((await db.journal.get('2026-11-23'))!.mood).toBe(4);
    expect((await db.tasks.toArray())[0].goalId).toBe(g.id);
    // fusionar otra vez no duplica
    await importBackup(parseBackup(json), 'merge');
    expect(await db.habitLogs.count()).toBe(1);
    expect(await db.goals.count()).toBe(1);
  });
});
