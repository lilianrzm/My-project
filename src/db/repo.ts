/**
 * Capa de datos: todas las escrituras pasan por aquí.
 * La interfaz nunca toca Dexie directamente para escribir.
 */
import { db } from './db';
import { todayISO } from '../domain/dates';
import { nextOccurrenceDate } from '../domain/recurrence';
import type {
  Activity,
  ActivityType,
  Attachment,
  Category,
  Closure,
  CustomField,
  CustomFieldType,
  FieldChange,
  FileBlob,
  Project,
  Settings,
  Subtask,
  Tag,
  Task,
} from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { LIMITS, newId, normalizeClosure, normalizeCustomField, normalizeSettings, normalizeTask } from '../domain/validate';
import { localDateOf } from '../domain/selectors';

/** Error de una regla de negocio, con un mensaje listo para mostrar. */
export class RuleError extends Error {
  constructor(
    public code: 'pending-subtasks' | 'reopen-required' | 'file-too-large' | 'file-type' | 'storage-full',
    message: string,
  ) {
    super(message);
    this.name = 'RuleError';
  }
}

export const pendingSubtasks = (t: Pick<Task, 'subtasks'>) => t.subtasks.filter((s) => !s.done).length;

const nowTs = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Inicialización                                                       */
/* ------------------------------------------------------------------ */

export const DEFAULT_CATEGORIES: { id: string; name: string; color: string }[] = [
  { id: 'cat-trabajo', name: 'Trabajo', color: '#81866A' },
  { id: 'cat-personal', name: 'Personal', color: '#D9A9B4' },
  { id: 'cat-finanzas', name: 'Finanzas', color: '#D4B483' },
  { id: 'cat-estudios', name: 'Estudios y aprendizaje', color: '#9DB0BF' },
  { id: 'cat-salud', name: 'Salud y entrenamiento', color: '#A7B09A' },
  { id: 'cat-proyectos', name: 'Proyectos personales', color: '#B7A6C4' },
];

const LEGACY_KEY = 'lista-de-tareas';

export async function initDatabase(): Promise<void> {
  await db.open();
  await db.transaction('rw', [db.meta, db.categories, db.settings], async () => {
    const seeded = await db.meta.get('seeded');
    if (!seeded) {
      const ts = nowTs();
      await db.categories.bulkPut(
        DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i, createdAt: ts, updatedAt: ts })),
      );
      await db.meta.put({ key: 'seeded', value: ts });
    }
    if (!(await db.settings.get('settings'))) {
      await db.settings.put({ key: 'settings', value: { ...DEFAULT_SETTINGS } });
    }
  });
  await migrateLegacyLocalStorage();
}

/** Importa (una sola vez) las tareas de la versión anterior basada en localStorage. No borra el original. */
async function migrateLegacyLocalStorage(): Promise<number> {
  if (typeof localStorage === 'undefined') return 0;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  return db.transaction('rw', [db.meta, db.tasks], async () => {
    if (await db.meta.get('legacyMigrated')) return 0;
    let items: unknown;
    try {
      items = JSON.parse(raw!);
    } catch {
      items = [];
    }
    const ts = nowTs();
    const tasks: Task[] = [];
    if (Array.isArray(items)) {
      items.forEach((it, i) => {
        if (!it || typeof it !== 'object') return;
        const o = it as { id?: unknown; texto?: unknown; hecha?: unknown };
        const title = typeof o.texto === 'string' ? o.texto.trim() : '';
        if (!title) return;
        const done = o.hecha === true;
        tasks.push(
          normalizeTask({
            id: `legacy-${typeof o.id === 'string' ? o.id : i}`,
            title,
            status: done ? 'completed' : 'open',
            completedAt: done ? ts : null,
            createdAt: ts,
            order: i,
          }),
        );
      });
    }
    await db.tasks.bulkPut(tasks);
    await db.meta.put({ key: 'legacyMigrated', value: { at: ts, count: tasks.length } });
    return tasks.length;
  });
}

/** Solicita almacenamiento persistente (no se garantiza que el navegador lo conceda). */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage || typeof navigator.storage.persist !== 'function') return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Actividad                                                            */
/* ------------------------------------------------------------------ */

function activity(type: ActivityType, task: Pick<Task, 'id' | 'projectId' | 'title'>, changes?: FieldChange[]): Activity {
  return { id: newId(), taskId: task.id, projectId: task.projectId, type, at: nowTs(), title: task.title, ...(changes ? { changes } : {}) };
}

/** Eventos de historial derivados de una edición (solo los cambios relevantes). */
function diffEvents(before: Task, after: Task): Activity[] {
  const out: Activity[] = [];
  if (before.responsible !== after.responsible) {
    out.push(activity('responsible', after, [{ field: 'Responsable', from: before.responsible || null, to: after.responsible || null }]));
  }
  if (before.dueDate !== after.dueDate) {
    out.push(activity('dueDate', after, [{ field: 'Vencimiento', from: before.dueDate, to: after.dueDate }]));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tareas                                                               */
/* ------------------------------------------------------------------ */

export type TaskDraft = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { title: string };

export function buildTask(draft: TaskDraft): Task {
  const ts = nowTs();
  const id = newId();
  return normalizeTask(
    {
      description: '',
      notes: '',
      dueDate: null,
      dueTime: null,
      priority: 0,
      categoryId: null,
      projectId: null,
      tagIds: [],
      subtasks: [],
      status: 'open',
      completedAt: null,
      todayDate: null,
      recurrence: null,
      seriesId: null,
      nextOccurrenceId: null,
      order: Date.now(),
      cancelledAt: null,
      startDate: null,
      responsible: '',
      folio: '',
      closure: null,
      customValues: {},
      ...draft,
      id,
      createdAt: ts,
      updatedAt: ts,
    },
    ts,
  );
}

export async function createTask(draft: TaskDraft): Promise<Task> {
  const title = draft.title.trim().slice(0, LIMITS.title);
  if (!title) throw new Error('La tarea necesita un título.');
  const task = buildTask({ ...draft, title });
  if (task.recurrence && !task.seriesId) task.seriesId = task.id;
  await db.transaction('rw', [db.tasks, db.activity], async () => {
    await db.tasks.add(task);
    await db.activity.add(activity('created', task));
  });
  return task;
}

/**
 * Actualiza una tarea. Reglas:
 * - Si la tarea está completada y el cambio deja subtareas pendientes, exige `allowReopen`
 *   (la interfaz pide confirmación) y entonces la reabre.
 * - Registra en el historial los cambios de responsable y de vencimiento.
 */
export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, 'id' | 'createdAt'>>,
  opts: { allowReopen?: boolean } = {},
): Promise<void> {
  await db.transaction('rw', [db.tasks, db.activity], async () => {
    const current = await db.tasks.get(id);
    if (!current) throw new Error('La tarea ya no existe.');
    const merged = normalizeTask({ ...current, ...patch, id, updatedAt: nowTs() });
    if (merged.recurrence && !merged.seriesId) merged.seriesId = merged.id;
    const events = diffEvents(current, merged);
    if (current.status === 'completed' && patch.subtasks && pendingSubtasks(merged) > 0) {
      if (!opts.allowReopen) {
        throw new RuleError('reopen-required', 'La actividad está completada. Confirma su reapertura para añadir o reabrir subtareas pendientes.');
      }
      merged.status = 'open';
      merged.completedAt = null;
      events.push(activity('reopened', merged, [{ field: 'Estado', from: 'Completada', to: 'Pendiente' }]));
    }
    await db.tasks.put(merged);
    if (events.length) await db.activity.bulkAdd(events);
  });
}

/** Guarda (o edita) el registro de cierre. La fecha efectiva solo se propone la primera vez. */
export async function saveClosure(id: string, data: Partial<Closure>): Promise<void> {
  await db.transaction('rw', [db.tasks, db.activity], async () => {
    const task = await db.tasks.get(id);
    if (!task) throw new Error('La tarea ya no existe.');
    const ts = nowTs();
    const prev = task.closure;
    const closure = normalizeClosure({
      resultId: null,
      attentionTypeId: null,
      effectiveDate: prev ? prev.effectiveDate : task.completedAt ? localDateOf(task.completedAt) : null,
      responsible: task.responsible,
      observations: '',
      folio: task.folio,
      evidenceIds: [],
      recordedAt: prev?.recordedAt ?? ts,
      ...prev,
      ...data,
      updatedAt: ts,
    })!;
    const changes: FieldChange[] = [];
    const keys: [keyof Closure, string][] = [
      ['resultId', 'Resultado'],
      ['attentionTypeId', 'Tipo de atención'],
      ['effectiveDate', 'Fecha efectiva'],
      ['responsible', 'Responsable'],
      ['folio', 'Folio'],
      ['observations', 'Observaciones'],
    ];
    for (const [k, label] of keys) {
      const a = prev ? (prev[k] as string | null) : null;
      const b = closure[k] as string | null;
      if ((a || null) !== (b || null)) changes.push({ field: label, from: a || null, to: b || null });
    }
    await db.tasks.put({ ...task, closure, updatedAt: ts });
    if (changes.length || !prev) await db.activity.add(activity('closure', task, changes));
  });
}

/**
 * Completa una tarea. Si es recurrente, genera la siguiente ocurrencia
 * (ver reglas en domain/recurrence.ts) sin duplicados.
 */
export async function completeTask(id: string): Promise<{ next: Task | null }> {
  return db.transaction('rw', [db.tasks, db.activity], async () => {
    const task = await db.tasks.get(id);
    if (!task || task.status === 'completed') return { next: null };
    const pending = pendingSubtasks(task);
    if (pending > 0) {
      throw new RuleError(
        'pending-subtasks',
        pending === 1 ? 'Queda 1 subtarea pendiente. Complétala para cerrar la actividad.' : `Quedan ${pending} subtareas pendientes. Complétalas para cerrar la actividad.`,
      );
    }
    const ts = nowTs();
    const today = todayISO();
    const updated: Task = { ...task, status: 'completed', completedAt: ts, updatedAt: ts };
    let next: Task | null = null;

    if (task.recurrence) {
      const seriesId = task.seriesId ?? task.id;
      updated.seriesId = seriesId;
      const base = task.dueDate ?? today;
      const nextDate = nextOccurrenceDate(task.recurrence, base, today);
      if (nextDate) {
        const existing = await db.tasks.where('[seriesId+dueDate]').equals([seriesId, nextDate]).first();
        if (existing) {
          updated.nextOccurrenceId = existing.id;
        } else {
          next = buildTask({
            title: task.title,
            description: task.description,
            notes: task.notes,
            dueDate: nextDate,
            dueTime: task.dueTime,
            priority: task.priority,
            categoryId: task.categoryId,
            projectId: task.projectId,
            tagIds: task.tagIds,
            subtasks: task.subtasks.map((s) => ({ ...s, id: newId(), done: false, createdAt: ts, completedAt: null })),
            recurrence: task.recurrence,
            seriesId,
            order: task.order,
            responsible: task.responsible,
            customValues: task.customValues,
          });
          await db.tasks.add(next);
          updated.nextOccurrenceId = next.id;
        }
      }
    }
    await db.tasks.put(updated);
    await db.activity.add(activity('completed', updated));
    return { next };
  });
}

export async function reopenTask(id: string): Promise<void> {
  await db.transaction('rw', [db.tasks, db.activity], async () => {
    const task = await db.tasks.get(id);
    if (!task || task.status === 'open') return;
    if (task.status === 'cancelled') {
      const updated: Task = { ...task, status: 'open', cancelledAt: null, updatedAt: nowTs() };
      await db.tasks.put(updated);
      await db.activity.add(activity('reopened', updated, [{ field: 'Estado', from: 'Cancelada', to: 'Pendiente' }]));
      return;
    }
    // Si ya se generó la siguiente ocurrencia y no se ha tocado, se retira para no tener dos abiertas.
    if (task.nextOccurrenceId) {
      const next = await db.tasks.get(task.nextOccurrenceId);
      if (next && next.status === 'open' && next.createdAt === next.updatedAt) {
        await db.tasks.delete(next.id);
      }
    }
    const updated: Task = { ...task, status: 'open', completedAt: null, nextOccurrenceId: null, updatedAt: nowTs() };
    await db.tasks.put(updated);
    await db.activity.add(activity('reopened', updated));
  });
}

/** Cancela una actividad: estado separado que no cuenta como concluida. */
export async function cancelTask(id: string): Promise<void> {
  await db.transaction('rw', [db.tasks, db.activity], async () => {
    const task = await db.tasks.get(id);
    if (!task || task.status === 'cancelled') return;
    const ts = nowTs();
    const prev = task.status === 'completed' ? 'Completada' : 'Pendiente';
    const updated: Task = { ...task, status: 'cancelled', cancelledAt: ts, completedAt: null, updatedAt: ts };
    await db.tasks.put(updated);
    await db.activity.add(activity('cancelled', updated, [{ field: 'Estado', from: prev, to: 'Cancelada' }]));
  });
}

export async function toggleTask(task: Task): Promise<{ next: Task | null }> {
  if (task.status !== 'open') {
    await reopenTask(task.id);
    return { next: null };
  }
  return completeTask(task.id);
}

export interface TaskDeletion {
  tasks: Task[];
  attachments: Attachment[];
  files: FileBlob[];
}

/** Elimina tareas (y sus documentos) y devuelve una copia para poder deshacer. */
export async function deleteTasks(ids: string[]): Promise<TaskDeletion> {
  return db.transaction('rw', [db.tasks, db.activity, db.attachments, db.files], async () => {
    const tasks = (await db.tasks.bulkGet(ids)).filter((t): t is Task => !!t);
    const taskIds = tasks.map((t) => t.id);
    const attachments = taskIds.length ? await db.attachments.where('taskId').anyOf(taskIds).toArray() : [];
    const files = (await db.files.bulkGet(attachments.map((a) => a.id))).filter((f): f is FileBlob => !!f);
    await db.tasks.bulkDelete(taskIds);
    await db.attachments.bulkDelete(attachments.map((a) => a.id));
    await db.files.bulkDelete(files.map((f) => f.id));
    await db.activity.bulkAdd(tasks.map((t) => activity('deleted', t)));
    return { tasks, attachments, files };
  });
}

export async function restoreTasks(d: TaskDeletion): Promise<void> {
  if (!d.tasks.length) return;
  await db.transaction('rw', [db.tasks, db.attachments, db.files], async () => {
    await db.tasks.bulkPut(d.tasks);
    await db.attachments.bulkPut(d.attachments);
    await db.files.bulkPut(d.files);
  });
}

export async function duplicateTask(id: string): Promise<Task | null> {
  const t = await db.tasks.get(id);
  if (!t) return null;
  return createTask({
    ...t,
    title: `${t.title} (copia)`.slice(0, LIMITS.title),
    status: 'open',
    completedAt: null,
    cancelledAt: null,
    closure: null,
    subtasks: t.subtasks.map((s) => ({ ...s, id: newId() })),
    seriesId: null,
    nextOccurrenceId: null,
    order: t.order + 0.5,
  });
}

/** Reordena: reutiliza las posiciones existentes del grupo en el nuevo orden (no afecta a otras listas). */
export async function reorderTasks(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const tasks = (await db.tasks.bulkGet(orderedIds)).filter((t): t is Task => !!t);
    const slots = tasks.map((t) => t.order).sort((a, b) => a - b);
    // Garantiza posiciones distintas
    for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const updates: Task[] = [];
    orderedIds.forEach((id, i) => {
      const t = byId.get(id);
      if (t && t.order !== slots[i]) updates.push({ ...t, order: slots[i] });
    });
    await db.tasks.bulkPut(updates);
  });
}

/* ------------------------------------------------------------------ */
/* Proyectos                                                            */
/* ------------------------------------------------------------------ */

export async function createProject(p: Pick<Project, 'name'> & Partial<Project>): Promise<Project> {
  const ts = nowTs();
  const project: Project = {
    description: '',
    color: '#81866A',
    targetDate: null,
    status: 'active',
    order: Date.now(),
    ...p,
    name: p.name.trim().slice(0, LIMITS.name),
    id: newId(),
    createdAt: ts,
    updatedAt: ts,
  };
  if (!project.name) throw new Error('El proyecto necesita un nombre.');
  await db.projects.add(project);
  return project;
}

export async function updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void> {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('El proyecto necesita un nombre.');
  await db.projects.update(id, { ...patch, updatedAt: nowTs() });
}

export interface ProjectDeletion {
  project: Project;
  movedTaskIds: string[];
  deletedTasks: Task[];
  deleted?: TaskDeletion;
}

/** Elimina un proyecto. mode 'keep' mueve sus tareas al Inbox; 'delete' también elimina sus tareas. */
export async function deleteProject(id: string, mode: 'keep' | 'delete'): Promise<ProjectDeletion | null> {
  return db.transaction('rw', [db.projects, db.tasks, db.attachments, db.files, db.activity], async () => {
    const project = await db.projects.get(id);
    if (!project) return null;
    const tasks = await db.tasks.where('projectId').equals(id).toArray();
    let deleted: TaskDeletion | undefined;
    if (mode === 'delete') {
      deleted = await deleteTasks(tasks.map((t) => t.id));
    } else {
      const ts = nowTs();
      await db.tasks.bulkPut(tasks.map((t) => ({ ...t, projectId: null, updatedAt: ts })));
    }
    await db.projects.delete(id);
    return {
      project,
      movedTaskIds: mode === 'keep' ? tasks.map((t) => t.id) : [],
      deletedTasks: mode === 'delete' ? tasks : [],
      deleted,
    };
  });
}

export async function undoDeleteProject(d: ProjectDeletion): Promise<void> {
  await db.transaction('rw', [db.projects, db.tasks, db.attachments, db.files], async () => {
    await db.projects.put(d.project);
    if (d.deleted) await restoreTasks(d.deleted);
    else if (d.deletedTasks.length) await db.tasks.bulkPut(d.deletedTasks);
    const moved = (await db.tasks.bulkGet(d.movedTaskIds)).filter((t): t is Task => !!t && t.projectId === null);
    await db.tasks.bulkPut(moved.map((t) => ({ ...t, projectId: d.project.id })));
  });
}

/* ------------------------------------------------------------------ */
/* Categorías                                                           */
/* ------------------------------------------------------------------ */

export async function createCategory(name: string, color: string): Promise<Category> {
  const n = name.trim().slice(0, LIMITS.name);
  if (!n) throw new Error('La categoría necesita un nombre.');
  const ts = nowTs();
  const last = await db.categories.orderBy('order').last();
  const c: Category = { id: newId(), name: n, color, order: (last?.order ?? 0) + 1, createdAt: ts, updatedAt: ts };
  await db.categories.add(c);
  return c;
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'color'>>): Promise<void> {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('La categoría necesita un nombre.');
  await db.categories.update(id, { ...patch, updatedAt: nowTs() });
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await Promise.all(orderedIds.map((id, i) => db.categories.update(id, { order: i })));
  });
}

/**
 * Elimina una categoría. Sus tareas NUNCA se eliminan: se reasignan a `reassignTo`
 * o quedan sin categoría (null).
 */
export async function deleteCategory(id: string, reassignTo: string | null): Promise<number> {
  return db.transaction('rw', [db.categories, db.tasks], async () => {
    if (reassignTo === id) reassignTo = null;
    const tasks = await db.tasks.where('categoryId').equals(id).toArray();
    const ts = nowTs();
    await db.tasks.bulkPut(tasks.map((t) => ({ ...t, categoryId: reassignTo, updatedAt: ts })));
    await db.categories.delete(id);
    return tasks.length;
  });
}

/* ------------------------------------------------------------------ */
/* Etiquetas                                                            */
/* ------------------------------------------------------------------ */

export async function getOrCreateTag(name: string): Promise<Tag> {
  const n = name.trim().replace(/^#/, '').slice(0, 60);
  if (!n) throw new Error('La etiqueta necesita un nombre.');
  return db.transaction('rw', db.tags, async () => {
    const all = await db.tags.toArray();
    const found = all.find((t) => t.name.toLocaleLowerCase('es-MX') === n.toLocaleLowerCase('es-MX'));
    if (found) return found;
    const tag: Tag = { id: newId(), name: n, createdAt: nowTs() };
    await db.tags.add(tag);
    return tag;
  });
}

export async function renameTag(id: string, name: string): Promise<void> {
  const n = name.trim().replace(/^#/, '').slice(0, 60);
  if (!n) throw new Error('La etiqueta necesita un nombre.');
  const clash = await db.tags.where('name').equals(n).first();
  if (clash && clash.id !== id) throw new Error('Ya existe una etiqueta con ese nombre.');
  await db.tags.update(id, { name: n });
}

export async function deleteTag(id: string): Promise<void> {
  await db.transaction('rw', [db.tags, db.tasks], async () => {
    const tasks = await db.tasks.where('tagIds').equals(id).toArray();
    const ts = nowTs();
    await db.tasks.bulkPut(tasks.map((t) => ({ ...t, tagIds: t.tagIds.filter((x) => x !== id), updatedAt: ts })));
    await db.tags.delete(id);
  });
}

/* ------------------------------------------------------------------ */
/* Configuración                                                        */
/* ------------------------------------------------------------------ */

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('settings'))?.value ?? DEFAULT_SETTINGS;
    await db.settings.put({ key: 'settings', value: normalizeSettings({ ...current, ...patch }) });
  });
}


/* ------------------------------------------------------------------ */
/* Subtareas                                                            */
/* ------------------------------------------------------------------ */

export function newSubtask(title: string): Subtask {
  return { id: newId(), title: title.trim().slice(0, LIMITS.title), done: false, createdAt: nowTs(), completedAt: null };
}

/** Marca/desmarca subtareas conservando la fecha de ejecución. */
export function toggleSubtask(list: Subtask[], id: string): Subtask[] {
  return list.map((s) => (s.id === id ? { ...s, done: !s.done, completedAt: s.done ? null : nowTs() } : s));
}

/* ------------------------------------------------------------------ */
/* Campos personalizados                                                */
/* ------------------------------------------------------------------ */

export async function createCustomField(f: Pick<CustomField, 'name' | 'type'> & Partial<CustomField>): Promise<CustomField> {
  const ts = nowTs();
  const last = await db.customFields.orderBy('order').last();
  const field = normalizeCustomField({ options: [], scope: { kind: 'all' }, description: '', ...f, id: newId(), order: (last?.order ?? 0) + 1, archived: false, createdAt: ts, updatedAt: ts });
  await db.customFields.add(field);
  return field;
}

/** Conversiones de tipo que no destruyen información. */
const SAFE_CONVERSIONS: Partial<Record<CustomFieldType, CustomFieldType[]>> = {
  text: ['longtext'],
  longtext: ['text'],
  number: ['currency', 'text', 'longtext'],
  currency: ['number', 'text', 'longtext'],
  select: ['multiselect'],
  date: ['text', 'longtext'],
};

export function isSafeConversion(from: CustomFieldType, to: CustomFieldType): boolean {
  return from === to || (SAFE_CONVERSIONS[from]?.includes(to) ?? false);
}

/** Cuántas actividades tienen valor en un campo. */
export async function countFieldValues(fieldId: string): Promise<number> {
  return db.tasks.filter((t) => t.customValues?.[fieldId] !== undefined).count();
}

/**
 * Actualiza un campo. Si cambia de tipo, convierte los valores cuando es posible; los que
 * no se pueden convertir solo se eliminan si `discardIncompatible` es true (la interfaz advierte antes).
 */
export async function updateCustomField(id: string, patch: Partial<Omit<CustomField, 'id' | 'createdAt'>>, discardIncompatible = false): Promise<void> {
  await db.transaction('rw', [db.customFields, db.tasks], async () => {
    const cur = await db.customFields.get(id);
    if (!cur) throw new Error('El campo ya no existe.');
    const next = normalizeCustomField({ ...cur, ...patch, id, updatedAt: nowTs() });
    if (next.type !== cur.type) {
      const safe = isSafeConversion(cur.type, next.type);
      if (!safe && !discardIncompatible) throw new Error('Cambiar el tipo eliminaría valores existentes. Confirma para continuar.');
      const tasks = await db.tasks.filter((t) => t.customValues?.[id] !== undefined).toArray();
      const updated = tasks.map((t) => {
        const values = { ...t.customValues };
        const v = values[id];
        if (!safe) delete values[id];
        else if (next.type === 'multiselect' && typeof v === 'string') values[id] = [v];
        else if ((next.type === 'text' || next.type === 'longtext') && typeof v !== 'string') values[id] = String(v);
        return { ...t, customValues: values };
      });
      await db.tasks.bulkPut(updated);
    }
    await db.customFields.put(next);
  });
}

export async function reorderCustomFields(ids: string[]): Promise<void> {
  await db.transaction('rw', db.customFields, async () => {
    await Promise.all(ids.map((id, i) => db.customFields.update(id, { order: i })));
  });
}

/** Elimina definitivamente un campo y sus valores (archivar es la opción que conserva datos). */
export async function deleteCustomField(id: string): Promise<void> {
  await db.transaction('rw', [db.customFields, db.tasks], async () => {
    const tasks = await db.tasks.filter((t) => t.customValues?.[id] !== undefined).toArray();
    await db.tasks.bulkPut(
      tasks.map((t) => {
        const values = { ...t.customValues };
        delete values[id];
        return { ...t, customValues: values };
      }),
    );
    await db.customFields.delete(id);
  });
}

/* ------------------------------------------------------------------ */
/* Documentos adjuntos                                                  */
/* ------------------------------------------------------------------ */

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ACCEPTED_EXT = /\.(pdf|docx|xlsx|txt|md|csv|jpe?g|png|gif|webp|heic|heif)$/i;
export const ACCEPT_ATTR = '.pdf,.docx,.xlsx,.txt,.md,.csv,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,application/pdf,image/*,text/plain';

export async function addAttachment(taskId: string, file: File): Promise<Attachment> {
  if (!ACCEPTED_EXT.test(file.name)) {
    throw new RuleError('file-type', `“${file.name}” no es un tipo compatible. Usa PDF, Word (.docx), Excel (.xlsx), TXT o imágenes.`);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new RuleError('file-too-large', `“${file.name}” supera el límite de 25 MB por documento.`);
  }
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.usage !== undefined && est.quota - est.usage < file.size * 1.2) {
      throw new RuleError('storage-full', 'No hay espacio suficiente en el almacenamiento de la app para este documento.');
    }
  } catch (e) {
    if (e instanceof RuleError) throw e;
  }
  const att: Attachment = {
    id: newId(),
    taskId,
    name: file.name.slice(0, 255),
    mime: file.type || 'application/octet-stream',
    size: file.size,
    addedAt: nowTs(),
    description: '',
    descriptionSource: 'none',
    extractStatus: 'pending',
  };
  // Safari guarda Blobs en IndexedDB; se copia a un Blob propio para no depender del File original.
  const blob = new Blob([await file.arrayBuffer()], { type: att.mime });
  await db.transaction('rw', [db.attachments, db.files, db.tasks], async () => {
    if (!(await db.tasks.get(taskId))) throw new Error('La actividad ya no existe.');
    await db.files.add({ id: att.id, blob });
    await db.attachments.add(att);
  });
  return att;
}

export async function updateAttachment(id: string, patch: Partial<Pick<Attachment, 'description' | 'descriptionSource' | 'extractStatus' | 'name'>>): Promise<void> {
  await db.attachments.update(id, patch);
}

export async function getAttachmentBlob(id: string): Promise<Blob | null> {
  return (await db.files.get(id))?.blob ?? null;
}

export interface AttachmentDeletion {
  attachment: Attachment;
  file: FileBlob | null;
}

export async function deleteAttachment(id: string): Promise<AttachmentDeletion | null> {
  return db.transaction('rw', [db.attachments, db.files, db.tasks], async () => {
    const attachment = await db.attachments.get(id);
    if (!attachment) return null;
    const file = (await db.files.get(id)) ?? null;
    await db.attachments.delete(id);
    await db.files.delete(id);
    // Quitarlo de la evidencia del cierre, si estaba
    const task = await db.tasks.get(attachment.taskId);
    if (task?.closure?.evidenceIds.includes(id)) {
      await db.tasks.put({ ...task, closure: { ...task.closure, evidenceIds: task.closure.evidenceIds.filter((x) => x !== id) } });
    }
    return { attachment, file };
  });
}

export async function restoreAttachment(d: AttachmentDeletion): Promise<void> {
  await db.transaction('rw', [db.attachments, db.files], async () => {
    if (d.file) await db.files.put(d.file);
    await db.attachments.put(d.attachment);
  });
}
