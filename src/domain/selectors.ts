import { addDays, diffDays, startOfWeek } from './dates';
import type { ISODate, Priority, SortMode, Task } from './types';

export const isOpen = (t: Task) => t.status === 'open';

export function isOverdue(t: Task, today: ISODate): boolean {
  return isOpen(t) && !!t.dueDate && t.dueDate < today;
}

/** ¿Debe aparecer en Hoy? (vencida, programada para hoy o marcada manualmente) */
export function isForToday(t: Task, today: ISODate): boolean {
  if (!isOpen(t)) return false;
  if (t.dueDate && t.dueDate <= today) return true;
  return !!t.todayDate && t.todayDate <= today;
}

/** Inbox: tareas abiertas sin proyecto, sin fecha y no marcadas para hoy. */
export function isInbox(t: Task): boolean {
  return isOpen(t) && !t.projectId && !t.dueDate && !t.todayDate;
}

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const arr = [...tasks];
  const byOrder = (a: Task, b: Task) => a.order - b.order;
  switch (mode) {
    case 'due':
      return arr.sort((a, b) => {
        const da = (a.dueDate ?? '9999-99-99') + (a.dueTime ?? '99:99');
        const dbb = (b.dueDate ?? '9999-99-99') + (b.dueTime ?? '99:99');
        return da < dbb ? -1 : da > dbb ? 1 : byOrder(a, b);
      });
    case 'priority':
      return arr.sort((a, b) => b.priority - a.priority || byOrder(a, b));
    case 'created':
      return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    case 'title':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'es-MX', { sensitivity: 'base' }));
    case 'manual':
    default:
      return arr.sort(byOrder);
  }
}

export interface TaskFilter {
  priority: Priority | 'any';
  categoryId: string | 'any' | 'none';
  tagId: string | 'any';
  projectId?: string | 'any' | 'none';
}

export const EMPTY_FILTER: TaskFilter = { priority: 'any', categoryId: 'any', tagId: 'any', projectId: 'any' };

export function isFilterActive(f: TaskFilter): boolean {
  return f.priority !== 'any' || f.categoryId !== 'any' || f.tagId !== 'any' || (f.projectId ?? 'any') !== 'any';
}

export function applyFilter(tasks: Task[], f: TaskFilter): Task[] {
  return tasks.filter((t) => {
    if (f.priority !== 'any' && t.priority !== f.priority) return false;
    if (f.categoryId === 'none' && t.categoryId) return false;
    if (f.categoryId !== 'any' && f.categoryId !== 'none' && t.categoryId !== f.categoryId) return false;
    if (f.tagId !== 'any' && !t.tagIds.includes(f.tagId)) return false;
    const p = f.projectId ?? 'any';
    if (p === 'none' && t.projectId) return false;
    if (p !== 'any' && p !== 'none' && t.projectId !== p) return false;
    return true;
  });
}

export function normalizeText(s: string): string {
  return s
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Búsqueda insensible a mayúsculas y acentos en título, descripción, notas y subtareas. */
export function searchTasks(tasks: Task[], query: string, tagNames?: Map<string, string>): Task[] {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return tasks.filter((t) => {
    const hay = normalizeText(
      [
        t.title,
        t.description,
        t.notes,
        ...t.subtasks.map((s) => s.title),
        ...(tagNames ? t.tagIds.map((id) => tagNames.get(id) ?? '') : []),
      ].join(' \n '),
    );
    return terms.every((term) => hay.includes(term));
  });
}

export type UpcomingGroupKey = 'tomorrow' | 'thisWeek' | 'nextWeek' | 'later';

export interface UpcomingGroup {
  key: UpcomingGroupKey;
  label: string;
  tasks: Task[];
}

/** Agrupa tareas futuras: Mañana, Esta semana, Próxima semana, Más adelante. */
export function groupUpcoming(tasks: Task[], today: ISODate, weekStart: 0 | 1): UpcomingGroup[] {
  const tomorrow = addDays(today, 1);
  const thisWeekEnd = addDays(startOfWeek(today, weekStart), 6);
  const nextWeekEnd = addDays(thisWeekEnd, 7);
  const groups: Record<UpcomingGroupKey, Task[]> = { tomorrow: [], thisWeek: [], nextWeek: [], later: [] };
  for (const t of tasks) {
    if (!isOpen(t) || !t.dueDate || t.dueDate <= today) continue;
    if (t.dueDate === tomorrow) groups.tomorrow.push(t);
    else if (t.dueDate <= thisWeekEnd) groups.thisWeek.push(t);
    else if (t.dueDate <= nextWeekEnd) groups.nextWeek.push(t);
    else groups.later.push(t);
  }
  const labels: Record<UpcomingGroupKey, string> = {
    tomorrow: 'Mañana',
    thisWeek: 'Esta semana',
    nextWeek: 'Próxima semana',
    later: 'Más adelante',
  };
  return (Object.keys(groups) as UpcomingGroupKey[]).map((key) => ({
    key,
    label: labels[key],
    tasks: sortTasks(groups[key], 'due'),
  }));
}

export function projectProgress(tasks: Task[], projectId: string): { done: number; total: number; pct: number } {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    if (t.projectId !== projectId) continue;
    total++;
    if (t.status === 'completed') done++;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function completedOn(t: Task, day: ISODate): boolean {
  if (t.status !== 'completed' || !t.completedAt) return false;
  const d = new Date(t.completedAt);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return local === day;
}

export function localDateOf(ts: string): ISODate {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysUntil(due: ISODate, today: ISODate): number {
  return diffDays(due, today);
}
