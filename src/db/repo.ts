/**
 * Capa de datos: todas las escrituras pasan por aquí.
 * La interfaz nunca toca Dexie directamente para escribir.
 */
import { db } from './db';
import { todayISO } from '../domain/dates';
import { nextOccurrenceDate } from '../domain/recurrence';
import type { Activity, ActivityType, Category, Project, Settings, Tag, Task } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { LIMITS, newId, normalizeSettings, normalizeTask } from '../domain/validate';

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

function activity(type: ActivityType, task: Pick<Task, 'id' | 'projectId' | 'title'>): Activity {
  return { id: newId(), taskId: task.id, projectId: task.projectId, type, at: nowTs(), title: task.title };
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

export async function updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const current = await db.tasks.get(id);
    if (!current) throw new Error('La tarea ya no existe.');
    const merged = normalizeTask({ ...current, ...patch, id, updatedAt: nowTs() });
    if (merged.recurrence && !merged.seriesId) merged.seriesId = merged.id;
    await db.tasks.put(merged);
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
            subtasks: task.subtasks.map((s) => ({ ...s, id: newId(), done: false })),
            recurrence: task.recurrence,
            seriesId,
            order: task.order,
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

export async function toggleTask(task: Task): Promise<{ next: Task | null }> {
  if (task.status === 'completed') {
    await reopenTask(task.id);
    return { next: null };
  }
  return completeTask(task.id);
}

/** Elimina tareas y devuelve una copia para poder deshacer. */
export async function deleteTasks(ids: string[]): Promise<Task[]> {
  return db.transaction('rw', [db.tasks, db.activity], async () => {
    const tasks = (await db.tasks.bulkGet(ids)).filter((t): t is Task => !!t);
    await db.tasks.bulkDelete(tasks.map((t) => t.id));
    await db.activity.bulkAdd(tasks.map((t) => activity('deleted', t)));
    return tasks;
  });
}

export async function restoreTasks(tasks: Task[]): Promise<void> {
  if (!tasks.length) return;
  await db.tasks.bulkPut(tasks);
}

export async function duplicateTask(id: string): Promise<Task | null> {
  const t = await db.tasks.get(id);
  if (!t) return null;
  return createTask({
    ...t,
    title: `${t.title} (copia)`.slice(0, LIMITS.title),
    status: 'open',
    completedAt: null,
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
}

/** Elimina un proyecto. mode 'keep' mueve sus tareas al Inbox; 'delete' también elimina sus tareas. */
export async function deleteProject(id: string, mode: 'keep' | 'delete'): Promise<ProjectDeletion | null> {
  return db.transaction('rw', [db.projects, db.tasks], async () => {
    const project = await db.projects.get(id);
    if (!project) return null;
    const tasks = await db.tasks.where('projectId').equals(id).toArray();
    if (mode === 'delete') {
      await db.tasks.bulkDelete(tasks.map((t) => t.id));
    } else {
      const ts = nowTs();
      await db.tasks.bulkPut(tasks.map((t) => ({ ...t, projectId: null, updatedAt: ts })));
    }
    await db.projects.delete(id);
    return {
      project,
      movedTaskIds: mode === 'keep' ? tasks.map((t) => t.id) : [],
      deletedTasks: mode === 'delete' ? tasks : [],
    };
  });
}

export async function undoDeleteProject(d: ProjectDeletion): Promise<void> {
  await db.transaction('rw', [db.projects, db.tasks], async () => {
    await db.projects.put(d.project);
    if (d.deletedTasks.length) await db.tasks.bulkPut(d.deletedTasks);
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
