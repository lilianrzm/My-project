import Dexie, { type EntityTable } from 'dexie';
import type { Activity, Category, MetaRow, Project, SettingRow, Tag, Task } from '../domain/types';

/**
 * Base de datos local (IndexedDB) de The Daily Edit.
 *
 * MIGRACIONES: nunca modifiques una versión ya publicada. Para cambiar el esquema
 * añade `this.version(N + 1).stores({...}).upgrade(tx => ...)`. Dexie aplica las
 * migraciones en orden y dentro de una transacción; si fallan, la base de datos
 * queda en la versión anterior sin pérdida de datos.
 */
export const DB_NAME = 'the-daily-edit';
export const SCHEMA_VERSION = 1;

export class DailyEditDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;
  activity!: EntityTable<Activity, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

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
