/**
 * Respaldos: exportación e importación en JSON.
 *
 * Formato (formatVersion 1):
 * {
 *   "format": "the-daily-edit-backup",
 *   "formatVersion": 1,
 *   "appVersion": "1.0.0",
 *   "schemaVersion": 1,
 *   "exportedAt": "2026-11-02T18:00:00.000Z",
 *   "data": { tasks, projects, categories, tags, settings, activity }
 * }
 *
 * Fusión (merge):
 *  - Los registros se identifican por id. Si un id no existe localmente, se añade.
 *  - Si existe en ambos lados, gana la versión con `updatedAt` más reciente
 *    (en empate se conserva la local).
 *  - Etiquetas con el mismo nombre pero distinto id se unifican con la local.
 *  - La configuración local se conserva.
 * Reemplazo (replace):
 *  - Se vacían todas las tablas y se cargan los datos del archivo.
 * En ambos casos todo ocurre en UNA transacción de IndexedDB: si algo falla,
 * no se aplica ningún cambio. Además se guarda una copia del estado anterior
 * para poder restaurarlo desde Configuración.
 */
import { db, SCHEMA_VERSION } from './db';
import type { Activity, Category, Project, Settings, Tag, Task } from '../domain/types';
import {
  ValidationError,
  normalizeActivity,
  normalizeCategory,
  normalizeProject,
  normalizeSettings,
  normalizeTag,
  normalizeTask,
} from '../domain/validate';
import { todayISO } from '../domain/dates';

export const BACKUP_FORMAT = 'the-daily-edit-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export interface BackupData {
  tasks: Task[];
  projects: Project[];
  categories: Category[];
  tags: Tag[];
  settings: Settings;
  activity: Activity[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export interface ParsedBackup {
  meta: { formatVersion: number; appVersion: string; exportedAt: string | null };
  data: BackupData;
  warnings: string[];
}

export async function collectData(): Promise<BackupData> {
  return db.transaction('r', [db.tasks, db.projects, db.categories, db.tags, db.settings, db.activity], async () => ({
    tasks: await db.tasks.toArray(),
    projects: await db.projects.toArray(),
    categories: await db.categories.toArray(),
    tags: await db.tags.toArray(),
    settings: normalizeSettings((await db.settings.get('settings'))?.value),
    activity: await db.activity.toArray(),
  }));
}

export async function buildBackup(appVersion: string): Promise<BackupFile> {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: await collectData(),
  };
}

export function backupFileName(date = todayISO()): string {
  return `the-daily-edit-backup-${date}.json`;
}

/** Valida el contenido de un archivo de respaldo. Lanza ValidationError con un mensaje comprensible. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError('El archivo no es un JSON válido. Comprueba que sea un respaldo de The Daily Edit.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('El archivo no tiene el formato de un respaldo de The Daily Edit.');
  }
  const r = raw as Record<string, unknown>;
  if (r.format !== BACKUP_FORMAT) {
    throw new ValidationError('Este archivo no es un respaldo de The Daily Edit.');
  }
  const fv = r.formatVersion;
  if (typeof fv !== 'number' || !Number.isInteger(fv) || fv < 1) {
    throw new ValidationError('El respaldo no indica una versión de formato válida.');
  }
  if (fv > BACKUP_FORMAT_VERSION) {
    throw new ValidationError(
      `El respaldo usa la versión de formato ${fv}, más nueva que la que admite esta app (${BACKUP_FORMAT_VERSION}). Actualiza la app e inténtalo de nuevo.`,
    );
  }
  const d = r.data as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') throw new ValidationError('El respaldo no contiene datos.');

  const warnings: string[] = [];
  const list = <T extends { id: string }>(key: string, fn: (v: unknown) => T | null): T[] => {
    const arr = d[key];
    if (arr === undefined) return [];
    if (!Array.isArray(arr)) throw new ValidationError(`La sección "${key}" del respaldo no es válida.`);
    const out: T[] = [];
    const ids = new Set<string>();
    let skipped = 0;
    for (const item of arr) {
      try {
        const v = fn(item);
        if (!v) {
          skipped++;
          continue;
        }
        const id = v.id;
        if (ids.has(id)) {
          skipped++;
          continue;
        }
        ids.add(id);
        out.push(v);
      } catch {
        skipped++;
      }
    }
    if (skipped) warnings.push(`Se omitirán ${skipped} registro(s) no válidos o duplicados en "${key}".`);
    return out;
  };

  const tasks = list('tasks', (v) => normalizeTask(v));
  const projects = list('projects', (v) => normalizeProject(v));
  const categories = list('categories', (v) => normalizeCategory(v));
  const tags = list('tags', (v) => normalizeTag(v));
  const activity = list('activity', (v) => normalizeActivity(v));
  const settings = normalizeSettings(d.settings);

  // Integridad referencial dentro del propio archivo
  const projectIds = new Set(projects.map((p) => p.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  const tagIds = new Set(tags.map((t) => t.id));
  let orphans = 0;
  for (const t of tasks) {
    if (t.projectId && !projectIds.has(t.projectId)) {
      t.projectId = null;
      orphans++;
    }
    if (t.categoryId && !categoryIds.has(t.categoryId)) {
      t.categoryId = null;
      orphans++;
    }
    const before = t.tagIds.length;
    t.tagIds = t.tagIds.filter((id) => tagIds.has(id));
    orphans += before - t.tagIds.length;
  }
  if (orphans) warnings.push(`${orphans} referencia(s) a proyectos, categorías o etiquetas inexistentes se dejarán vacías.`);

  return {
    meta: {
      formatVersion: fv,
      appVersion: typeof r.appVersion === 'string' ? r.appVersion : 'desconocida',
      exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : null,
    },
    data: { tasks, projects, categories, tags, settings, activity },
    warnings,
  };
}

export interface ImportResult {
  mode: 'merge' | 'replace';
  added: number;
  updated: number;
  unchanged: number;
}

const newer = (a: { updatedAt?: string }, b: { updatedAt?: string }) =>
  (a.updatedAt ?? '') > (b.updatedAt ?? '');

export async function importBackup(parsed: ParsedBackup, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const incoming = parsed.data;
  const tables = [db.tasks, db.projects, db.categories, db.tags, db.settings, db.activity, db.meta];

  return db.transaction('rw', tables, async () => {
    // Copia del estado anterior para poder recuperarlo
    const previous = await collectData();
    await db.meta.put({ key: 'preImportSnapshot', value: { at: new Date().toISOString(), mode, data: previous } });

    if (mode === 'replace') {
      await Promise.all([db.tasks.clear(), db.projects.clear(), db.categories.clear(), db.tags.clear(), db.activity.clear()]);
      await db.tasks.bulkAdd(incoming.tasks);
      await db.projects.bulkAdd(incoming.projects);
      await db.categories.bulkAdd(incoming.categories);
      await db.tags.bulkAdd(incoming.tags);
      await db.activity.bulkAdd(incoming.activity);
      await db.settings.put({ key: 'settings', value: incoming.settings });
      await db.meta.put({ key: 'seeded', value: new Date().toISOString() });
      const total =
        incoming.tasks.length + incoming.projects.length + incoming.categories.length + incoming.tags.length;
      return { mode, added: total, updated: 0, unchanged: 0 };
    }

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    // Etiquetas: unificar por nombre
    const localTags = await db.tags.toArray();
    const byName = new Map(localTags.map((t) => [t.name.toLocaleLowerCase('es-MX'), t]));
    const localTagIds = new Set(localTags.map((t) => t.id));
    const tagMap = new Map<string, string>();
    const tagsToAdd: Tag[] = [];
    for (const t of incoming.tags) {
      if (localTagIds.has(t.id)) {
        tagMap.set(t.id, t.id);
        unchanged++;
        continue;
      }
      const same = byName.get(t.name.toLocaleLowerCase('es-MX'));
      if (same) {
        tagMap.set(t.id, same.id);
        unchanged++;
      } else {
        tagMap.set(t.id, t.id);
        tagsToAdd.push(t);
        byName.set(t.name.toLocaleLowerCase('es-MX'), t);
        added++;
      }
    }
    await db.tags.bulkAdd(tagsToAdd);

    async function mergeTable<T extends { id: string; updatedAt: string }>(
      table: typeof db.projects | typeof db.categories | typeof db.tasks,
      items: T[],
    ) {
      const existing = await (table as unknown as { bulkGet(ids: string[]): Promise<(T | undefined)[]> }).bulkGet(
        items.map((i) => i.id),
      );
      const toPut: T[] = [];
      items.forEach((item, i) => {
        const local = existing[i];
        if (!local) {
          toPut.push(item);
          added++;
        } else if (newer(item, local)) {
          toPut.push(item);
          updated++;
        } else {
          unchanged++;
        }
      });
      await (table as unknown as { bulkPut(items: T[]): Promise<unknown> }).bulkPut(toPut);
    }

    await mergeTable(db.projects, incoming.projects);
    await mergeTable(db.categories, incoming.categories);

    const projectIds = new Set((await db.projects.toCollection().primaryKeys()) as string[]);
    const categoryIds = new Set((await db.categories.toCollection().primaryKeys()) as string[]);
    const tasks = incoming.tasks.map((t) => ({
      ...t,
      projectId: t.projectId && projectIds.has(t.projectId) ? t.projectId : null,
      categoryId: t.categoryId && categoryIds.has(t.categoryId) ? t.categoryId : null,
      tagIds: [...new Set(t.tagIds.map((id) => tagMap.get(id) ?? id))],
    }));
    await mergeTable(db.tasks, tasks);

    const existingActivity = new Set((await db.activity.toCollection().primaryKeys()) as string[]);
    await db.activity.bulkAdd(incoming.activity.filter((a) => !existingActivity.has(a.id)));

    return { mode, added, updated, unchanged };
  });
}

export interface PreImportSnapshot {
  at: string;
  mode: 'merge' | 'replace';
  data: BackupData;
}

export async function getPreImportSnapshot(): Promise<PreImportSnapshot | null> {
  const row = await db.meta.get('preImportSnapshot');
  return (row?.value as PreImportSnapshot) ?? null;
}

/** Restaura el estado guardado justo antes de la última importación. */
export async function restorePreImportSnapshot(): Promise<boolean> {
  const snap = await getPreImportSnapshot();
  if (!snap) return false;
  await db.transaction('rw', [db.tasks, db.projects, db.categories, db.tags, db.settings, db.activity, db.meta], async () => {
    await Promise.all([db.tasks.clear(), db.projects.clear(), db.categories.clear(), db.tags.clear(), db.activity.clear()]);
    await db.tasks.bulkAdd(snap.data.tasks);
    await db.projects.bulkAdd(snap.data.projects);
    await db.categories.bulkAdd(snap.data.categories);
    await db.tags.bulkAdd(snap.data.tags);
    await db.activity.bulkAdd(snap.data.activity);
    await db.settings.put({ key: 'settings', value: snap.data.settings });
    await db.meta.delete('preImportSnapshot');
  });
  return true;
}

/**
 * Entrega el archivo al usuario. En iPad, si el navegador lo admite, usa la hoja
 * de compartir (que incluye "Guardar en Archivos"); si no, descarga el archivo.
 * Devuelve cómo se entregó: no es posible verificar dónde lo guardó el usuario.
 */
export async function deliverBackup(backup: BackupFile): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const json = JSON.stringify(backup, null, 2);
  const name = backupFileName();
  const blob = new Blob([json], { type: 'application/json' });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const isTouchApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isTouchApple && typeof File !== 'undefined' && nav.share && nav.canShare) {
    const file = new File([blob], name, { type: 'application/json' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: name });
        return 'shared';
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
        // Si compartir falla, usar descarga
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
