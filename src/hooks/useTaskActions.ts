import { useMemo } from 'react';
import * as repo from '../db/repo';
import { addDays, formatRelative, startOfWeek } from '../domain/dates';
import type { Priority, Task } from '../domain/types';
import { useFeedback, useUI } from '../state/ui';
import { useData } from '../state/data';

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) {
    if (e.name === 'QuotaExceededError' || /quota/i.test(e.message)) {
      return 'No hay espacio de almacenamiento disponible. Exporta un respaldo y libera espacio en el iPad.';
    }
    return e.message;
  }
  return 'Ocurrió un error inesperado al guardar. Inténtalo de nuevo.';
}

/** Acciones sobre tareas con avisos y "deshacer". Las funciones son estables. */
export function useTaskActions() {
  const { toast } = useFeedback();
  const { today, selectTask, openClosure } = useUI();
  const { settings } = useData();
  const closurePrompt = settings.closurePrompt;

  return useMemo(() => {
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        toast({ message: errorMessage(e), tone: 'error' });
        return undefined;
      }
    };

    return {
      toggle: (task: Task) =>
        safe(async () => {
          const wasOpen = task.status === 'open';
          const { next } = await repo.toggleTask(task);
          if (wasOpen) {
            toast({
              message: next?.dueDate ? `Completada · se repite ${formatRelative(next.dueDate, today).toLowerCase()}` : 'Tarea completada',
              action: { label: 'Deshacer', run: () => void safe(() => repo.reopenTask(task.id)) },
            });
            if (closurePrompt) openClosure(task.id);
          }
        }),
      update: (id: string, patch: Partial<Task>) => safe(() => repo.updateTask(id, patch)),
      remove: (tasks: Task[]) =>
        safe(async () => {
          const removed = await repo.deleteTasks(tasks.map((t) => t.id));
          selectTask(null);
          toast({
            message: removed.tasks.length === 1 ? 'Tarea eliminada' : `${removed.tasks.length} tareas eliminadas`,
            action: { label: 'Deshacer', run: () => void safe(() => repo.restoreTasks(removed)) },
            duration: 7000,
          });
        }),
      duplicate: (task: Task) =>
        safe(async () => {
          const copy = await repo.duplicateTask(task.id);
          if (copy) {
            toast({ message: 'Tarea duplicada', action: { label: 'Abrir', run: () => selectTask(copy.id) } });
          }
        }),
      postpone: (task: Task, when: 'tomorrow' | 'nextWeek' | 'plus1', weekStart: 0 | 1) =>
        safe(async () => {
          const base = task.dueDate && task.dueDate > today ? task.dueDate : today;
          const date =
            when === 'tomorrow'
              ? addDays(today, 1)
              : when === 'plus1'
                ? addDays(base, 1)
                : addDays(startOfWeek(today, weekStart), 7);
          const prev = { dueDate: task.dueDate, todayDate: task.todayDate };
          await repo.updateTask(task.id, { dueDate: date, todayDate: null });
          toast({
            message: `Pospuesta para ${formatRelative(date, today).toLowerCase()}`,
            action: { label: 'Deshacer', run: () => void safe(() => repo.updateTask(task.id, prev)) },
          });
        }),
      cancel: (task: Task) =>
        safe(async () => {
          await repo.cancelTask(task.id);
          toast({ message: 'Actividad cancelada', action: { label: 'Deshacer', run: () => void safe(() => repo.reopenTask(task.id)) } });
        }),
      setPriority: (task: Task, priority: Priority) => safe(() => repo.updateTask(task.id, { priority })),
      toggleToday: (task: Task) =>
        safe(() => repo.updateTask(task.id, { todayDate: task.todayDate ? null : today })),
      reorder: (ids: string[]) => safe(() => repo.reorderTasks(ids)),
      create: (draft: repo.TaskDraft) => safe(() => repo.createTask(draft)),
    };
  }, [toast, today, selectTask, openClosure, closurePrompt]);
}

export type TaskActions = ReturnType<typeof useTaskActions>;
