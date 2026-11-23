import Dexie, { type EntityTable } from 'dexie';
import type { Activity, Attachment, Category, CustomField, FileBlob, Goal, Habit, HabitLog, JournalEntry, MetaRow, Project, SettingRow, Tag, Task } from '../domain/types';

/**
 * Base de datos local (IndexedDB) de The Daily Edit.
 *
 * MIGRACIONES: nunca modifiques una versión ya publicada. Para cambiar el esquema
 * añade `this.version(N + 1).stores({...}).upgrade(tx => ...)`. Dexie aplica las
 * migraciones en orden y dentro de una transacción; si fallan, la base de datos
 * queda en la versión anterior sin pérdida de datos.
 */
export const DB_NAME = 'the-daily-edit';
export const SCHEMA_VERSION = 3;

export class DailyEditDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;
  activity!: EntityTable<Activity, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  customFields!: EntityTable<CustomField, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  /** Contenido binario de los adjuntos, separado de los metadatos para consultas ligeras. */
  files!: EntityTable<FileBlob, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  habits!: EntityTable<Habit, 'id'>;
  habitLogs!: EntityTable<HabitLog, 'id'>;
  journal!: EntityTable<JournalEntry, 'date'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      tasks: 'id, status, dueDate, projectId, categoryId, completedAt, seriesId, [seriesId+dueDate], *tagIds, updatedAt',
      projects: 'id, status, order',
      categories: 'id, order',
      tags: 'id, &name',
      settings: 'key',
      activity: 'id, at, taskId, projectId',
      meta: 'key',
    });

    // v2 (The Daily Edit 2.0): campos personalizados, documentos adjuntos y datos de seguimiento.
    // Solo AÑADE tablas y campos; no elimina ni reescribe información existente.
    this.version(2)
      .stores({
        customFields: 'id, order',
        attachments: 'id, taskId, addedAt',
        files: 'id',
      })
      .upgrade(async (tx) => {
        // Copia de seguridad interna previa a la migración (por si hubiera que recuperar algo).
        const tasks = await tx.table('tasks').toArray();
        await tx.table('meta').put({
          key: 'preMigration-v2',
          value: { at: new Date().toISOString(), tasks, projects: await tx.table('projects').toArray() },
        });
        await tx
          .table('tasks')
          .toCollection()
          .modify((t: Record<string, unknown>) => {
            t.cancelledAt ??= null;
            t.startDate ??= null;
            t.responsible ??= '';
            t.folio ??= '';
            t.closure ??= null;
            t.customValues ??= {};
            if (Array.isArray(t.subtasks)) {
              t.subtasks = (t.subtasks as Record<string, unknown>[]).map((s) => ({
                createdAt: null,
                completedAt: null,
                ...s,
              }));
            }
          });
      });

    // v3 (logro personal): metas, hábitos, registro de hábitos y diario.
    // Solo AÑADE: emoji en las áreas, vínculo opcional tarea → meta.
    this.version(3)
      .stores({
        goals: 'id, status, order',
        habits: 'id, order',
        habitLogs: 'id, habitId, date',
        journal: 'date',
        tasks: 'id, status, dueDate, projectId, categoryId, completedAt, seriesId, [seriesId+dueDate], *tagIds, updatedAt, goalId',
      })
      .upgrade(async (tx) => {
        const EMOJI: Record<string, string> = {
          'cat-trabajo': '💼',
          'cat-personal': '🌿',
          'cat-finanzas': '💸',
          'cat-estudios': '📚',
          'cat-salud': '💪',
          'cat-proyectos': '✨',
        };
        // Colores iniciales más alegres, solo si la persona no los había cambiado
        const OLD_TO_NEW: Record<string, string> = {
          '#81866A': '#A9B28A',
          '#D9A9B4': '#F4A6B8',
          '#D4B483': '#F5CF6B',
          '#9DB0BF': '#9DBBE8',
          '#A7B09A': '#9FD3A8',
          '#B7A6C4': '#B9A3E3',
        };
        await tx
          .table('categories')
          .toCollection()
          .modify((c: Record<string, unknown>) => {
            c.emoji ??= EMOJI[c.id as string] ?? '✨';
            if (EMOJI[c.id as string] && typeof c.color === 'string' && OLD_TO_NEW[c.color.toUpperCase()]) {
              c.color = OLD_TO_NEW[c.color.toUpperCase()];
            }
          });
        await tx
          .table('tasks')
          .toCollection()
          .modify((t: Record<string, unknown>) => {
            t.goalId ??= null;
          });
        // Nueva apariencia alegre solo si seguías con la predeterminada anterior (no se pisa una elección propia)
        const row = await tx.table('settings').get('settings');
        const a = row?.value?.appearance;
        if (row && (!a || (a.font === 'playful' && a.palette === 'olive' && a.radius === 'soft'))) {
          await tx.table('settings').put({ ...row, value: { ...row.value, appearance: { font: 'playful', palette: 'sorbet', radius: 'round' } } });
        }
      });
  }
}

export const db = new DailyEditDB();

/**
 * Si otra pestaña/instancia abre una versión más nueva del esquema,
 * cerramos la conexión y recargamos para no escribir con un esquema viejo.
 */
db.on('versionchange', () => {
  db.close();
  if (typeof window !== 'undefined') window.location.reload();
  return false;
});
