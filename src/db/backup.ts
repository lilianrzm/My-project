/**
 * Respaldos.
 *
 * Dos formatos:
 *  - JSON (`the-daily-edit-backup-AAAA-MM-DD.json`): todos los datos y configuración, SIN el
 *    contenido de los documentos adjuntos (ligero, fácil de inspeccionar).
 *  - ZIP completo (`the-daily-edit-respaldo-completo-AAAA-MM-DD.zip`): `backup.json` (mismo formato)
 *    + carpeta `files/` con cada documento adjunto, nombrado por su id.
 *
 * Formato JSON (formatVersion 2; la app sigue aceptando la versión 1):
 * {
 *   "format": "the-daily-edit-backup", "formatVersion": 2, "appVersion": "2.0.0",
 *   "schemaVersion": 2, "exportedAt": "…", "includesFiles": false,
 *   "data": { tasks, projects, categories, tags, settings, activity, customFields, attachments }
 * }
 *
 * Fusión (merge):
 *  - Los registros se identifican por id. Si un id no existe localmente, se añade.
 *  - Si existe en ambos lados, gana la versión con `updatedAt` más reciente (en empate, la local).
 *  - Etiquetas con el mismo nombre pero distinto id se unifican con la local.
 *  - La configuración local (incluida la apariencia) se conserva.
 *  - Documentos: se añaden los que no existan; nunca se sobrescribe un documento local.
 * Reemplazo (replace): se vacían las tablas y se cargan los datos del archivo.
 * En ambos casos todo ocurre en UNA transacción de IndexedDB: si algo falla, no cambia nada.
 * Antes de importar se guarda una copia del estado anterior para poder restaurarlo.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { db, SCHEMA_VERSION } from './db';
import type { Activity, Attachment, Category, CustomField, FileBlob, Project, Settings, Tag, Task } from '../domain/types';
import {
  ValidationError,
  normalizeActivity,
  normalizeAttachment,
  normalizeCategory,
  normalizeCustomField,
  normalizeProject,
  normalizeSettings,
  normalizeTag,
  normalizeTask,
} from '../domain/validate';
import { todayISO } from '../domain/dates';

export const BACKUP_FORMAT = 'the-daily-edit-backup';
export const BACKUP_FORMAT_VERSION = 2;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const MAX_ZIP_BYTES = 500 * 1024 * 1024;

export interface BackupData {
  tasks: Task[];
  projects: Project[];
  categories: Category[];
  tags: Tag[];
  settings: Settings;
  activity: Activity[];
  customFields: CustomField[];
  attachments: Attachment[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  includesFiles: boolean;
  data: BackupData;
}

export interface ParsedBackup {
  meta: { formatVersion: number; appVersion: string; exportedAt: string | null; includesFiles: boolean };
  data: BackupData;
  /** Contenido de los documentos (solo en respaldos ZIP). */
  files: Map<string, Uint8Array>;
  warnings: string[];
}

const ALL_TABLES = () => [db.tasks, db.projects, db.categories, db.tags, db.settings, db.activity, db.customFields, db.attachments];

export async function collectData(): Promise<BackupData> {
  return db.transaction('r', ALL_TABLES(), async () => ({
    tasks: await db.tasks.toArray(),
    projects: await db.projects.toArray(),
    categories: await db.categories.toArray(),
    tags: await db.tags.toArray(),
    settings: normalizeSettings((await db.settings.get('settings'))?.value),
    activity: await db.activity.toArray(),
    customFields: await db.customFields.toArray(),
    attachments: await db.attachments.toArray(),
  }));
}

export async function buildBackup(appVersion: string, includesFiles = false): Promise<BackupFile> {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    includesFiles,
    data: await collectData(),
  };
}

export function backupFileName(date = todayISO()): string {
  return `the-daily-edit-backup-${date}.json`;
}

export function zipBackupFileName(date = todayISO()): string {
  return `the-daily-edit-respaldo-completo-${date}.zip`;
}

/** Genera el ZIP completo: backup.json + files/<id>. */
export async function buildZipBackup(appVersion: string): Promise<Blob> {
  const backup = await buildBackup(appVersion, true);
  const entries: Zippable = {
    'backup.json': [strToU8(JSON.stringify(backup, null, 2)), { level: 6 }],
  };
  const blobs = (await db.files.bulkGet(backup.data.attachments.map((a) => a.id))).filter((f): f is FileBlob => !!f);
  for (const f of blobs) {
    // Los documentos ya suelen estar comprimidos: se guardan sin recomprimir (más rápido en iPad).
    entries[`files/${f.id}`] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  }
  const out = zipSync(entries);
  return new Blob([out as BlobPart], { type: 'application/zip' });
}

/** Lee un respaldo .json o .zip. */
export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip';
  if (!isZip) {
    if (file.size > MAX_BACKUP_BYTES) throw new ValidationError('El archivo es demasiado grande para ser un respaldo JSON (máx. 50 MB).');
    return parseBackup(await file.text());
  }
  if (file.size > MAX_ZIP_BYTES) throw new ValidationError('El respaldo ZIP es demasiado grande (máx. 500 MB).');
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new ValidationError('El archivo ZIP está dañado o no es un respaldo de The Daily Edit.');
  }
  const json = entries['backup.json'];
  if (!json) throw new ValidationError('El ZIP no contiene backup.json: no es un respaldo completo de The Daily Edit.');
  const parsed = parseBackup(strFromU8(json));
  const files = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    const m = /^files\/([^/]+)$/.exec(path);
    if (m) files.set(m[1], bytes);
  }
  const before = parsed.data.attachments.length;
  parsed.data.attachments = parsed.data.attachments.filter((a) => files.has(a.id));
  const missing = before - parsed.data.attachments.length;
  if (missing) parsed.warnings.push(`${missing} documento(s) del respaldo no tienen archivo y se omitirán.`);
  parsed.files = files;
  parsed.meta.includesFiles = true;
  return parsed;
}

/** Valida el contenido de un respaldo JSON. Lanza ValidationError con un mensaje comprensible. */
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
        if (!v || ids.has(v.id)) {
          skipped++;
          continue;
        }
        ids.add(v.id);
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
  const customFields = list('customFields', (v) => normalizeCustomField(v));
  const taskIds = new Set(tasks.map((t) => t.id));
  const attachments = list('attachments', (v) => normalizeAttachment(v)).filter((a) => taskIds.has(a.taskId));
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
  const includesFiles = r.includesFiles === true;
  if (!includesFiles && attachments.length) {
    warnings.push(`Este respaldo JSON no incluye el contenido de ${attachments.length} documento(s); solo se conservarán los que ya existan en este dispositivo.`);
  }

  return {
    meta: {
      formatVersion: fv,
      appVersion: typeof r.appVersion === 'string' ? r.appVersion : 'desconocida',
      exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : null,
      includesFiles,
    },
    data: { tasks, projects, categories, tags, settings, activity, customFields, attachments },
    files: new Map(),
    warnings,
  };
}

export interface ImportResult {
  mode: 'merge' | 'replace';
  added: number;
  updated: number;
  unchanged: number;
  files: number;
}

const newer = (a: { updatedAt?: string }, b: { updatedAt?: string }) => (a.updatedAt ?? '') > (b.updatedAt ?? '');

export async function importBackup(parsed: ParsedBackup, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const incoming = parsed.data;
  const tables = [...ALL_TABLES(), db.files, db.meta];
  // Blobs fuera de la transacción: crear Blobs es síncrono, pero se prepara antes para no alargarla.
  const incomingFiles = new Map<string, Blob>();
  for (const a of incoming.attachments) {
    const bytes = parsed.files.get(a.id);
    if (bytes) incomingFiles.set(a.id, new Blob([bytes as BlobPart], { type: a.mime }));
  }

  return db.transaction('rw', tables, async () => {
    // Copia del estado anterior para poder recuperarlo. Los binarios de los documentos
    // no se duplican: se conservan en la tabla `files` mientras exista esta copia.
    const previous = await collectData();
    const oldSnap = (await db.meta.get('preImportSnapshot'))?.value as PreImportSnapshot | undefined;
    await db.meta.put({ key: 'preImportSnapshot', value: { at: new Date().toISOString(), mode, data: previous } });
    // Limpiar binarios que solo referenciaba la copia anterior
    if (oldSnap) {
      const keep = new Set(previous.attachments.map((a) => a.id));
      const orphan = oldSnap.data.attachments?.map((a) => a.id).filter((id) => !keep.has(id)) ?? [];
      if (orphan.length) await db.files.bulkDelete(orphan);
    }

    const localFileIds = new Set((await db.files.toCollection().primaryKeys()) as string[]);
    const filesToAdd: FileBlob[] = [];
    const attachmentsUsable = (list: Attachment[]) =>
      list.filter((a) => {
        if (incomingFiles.has(a.id)) {
          if (!localFileIds.has(a.id)) filesToAdd.push({ id: a.id, blob: incomingFiles.get(a.id)! });
          return true;
        }
        return localFileIds.has(a.id); // JSON sin binarios: solo si el archivo ya está en este dispositivo
      });

    if (mode === 'replace') {
      await Promise.all([db.tasks.clear(), db.projects.clear(), db.categories.clear(), db.tags.clear(), db.activity.clear(), db.customFields.clear(), db.attachments.clear()]);
      const atts = attachmentsUsable(incoming.attachments);
      await db.tasks.bulkAdd(incoming.tasks);
      await db.projects.bulkAdd(incoming.projects);
      await db.categories.bulkAdd(incoming.categories);
      await db.tags.bulkAdd(incoming.tags);
      await db.activity.bulkAdd(incoming.activity);
      await db.customFields.bulkAdd(incoming.customFields);
      await db.files.bulkPut(filesToAdd);
      await db.attachments.bulkAdd(atts);
      await db.settings.put({ key: 'settings', value: incoming.settings });
      await db.meta.put({ key: 'seeded', value: new Date().toISOString() });
      const total = incoming.tasks.length + incoming.projects.length + incoming.categories.length + incoming.tags.length + incoming.customFields.length;
      return { mode, added: total, updated: 0, unchanged: 0, files: atts.length };
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
      table: typeof db.projects | typeof db.categories | typeof db.tasks | typeof db.customFields,
      items: T[],
    ) {
      const t = table as unknown as { bulkGet(ids: string[]): Promise<(T | undefined)[]>; bulkPut(items: T[]): Promise<unknown> };
      const existing = await t.bulkGet(items.map((i) => i.id));
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
      await t.bulkPut(toPut);
    }

    await mergeTable(db.projects, incoming.projects);
    await mergeTable(db.categories, incoming.categories);
    await mergeTable(db.customFields, incoming.customFields);

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

    // Documentos: solo se añaden los nuevos, asociados a actividades existentes
    const localAtt = new Set((await db.attachments.toCollection().primaryKeys()) as string[]);
    const taskIdsNow = new Set((await db.tasks.toCollection().primaryKeys()) as string[]);
    const newAtts = attachmentsUsable(incoming.attachments.filter((a) => !localAtt.has(a.id) && taskIdsNow.has(a.taskId)));
    await db.files.bulkPut(filesToAdd.filter((f) => newAtts.some((a) => a.id === f.id)));
    await db.attachments.bulkAdd(newAtts);

    return { mode, added, updated, unchanged, files: newAtts.length };
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
  await db.transaction('rw', [...ALL_TABLES(), db.files, db.meta], async () => {
    const current = await db.attachments.toArray();
    await Promise.all([db.tasks.clear(), db.projects.clear(), db.categories.clear(), db.tags.clear(), db.activity.clear(), db.customFields.clear(), db.attachments.clear()]);
    await db.tasks.bulkAdd(snap.data.tasks);
    await db.projects.bulkAdd(snap.data.projects);
    await db.categories.bulkAdd(snap.data.categories);
    await db.tags.bulkAdd(snap.data.tags);
    await db.activity.bulkAdd(snap.data.activity);
    await db.customFields.bulkAdd(snap.data.customFields ?? []);
    // Solo documentos cuyo binario sigue disponible
    const fileIds = new Set((await db.files.toCollection().primaryKeys()) as string[]);
    const atts = (snap.data.attachments ?? []).filter((a) => fileIds.has(a.id));
    await db.attachments.bulkAdd(atts);
    // Binarios importados que ya nadie referencia
    const keep = new Set(atts.map((a) => a.id));
    await db.files.bulkDelete(current.map((a) => a.id).filter((id) => !keep.has(id)));
    await db.settings.put({ key: 'settings', value: normalizeSettings(snap.data.settings) });
    await db.meta.delete('preImportSnapshot');
  });
  return true;
}

/**
 * Entrega un archivo al usuario. En iPad, si el navegador lo admite, usa la hoja de compartir
 * (que incluye "Guardar en Archivos"); si no, lo descarga.
 * Devuelve cómo se entregó: no es posible verificar dónde lo guardó el usuario.
 */
export async function deliverFile(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const isTouchApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isTouchApple && typeof File !== 'undefined' && nav.share && nav.canShare) {
    const file = new File([blob], name, { type: blob.type });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: name });
        return 'shared';
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
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

export async function deliverBackup(backup: BackupFile): Promise<'shared' | 'downloaded' | 'cancelled'> {
  return deliverFile(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), backupFileName());
}
