import { useMemo, useState } from 'react';
import type { SortMode, Task } from '../domain/types';
import { EMPTY_FILTER, applyFilter, sortTasks, type TaskFilter } from '../domain/selectors';
import { useData } from '../state/data';

/** Estado de orden y filtros de una lista. Empieza con el orden predeterminado de Configuración. */
export function useListView(tasks: Task[], opts: { allowManual?: boolean } = {}) {
  const { settings } = useData();
  const initial: SortMode = opts.allowManual === false && settings.defaultSort === 'manual' ? 'due' : settings.defaultSort;
  const [sort, setSort] = useState<SortMode | null>(null);
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const effectiveSort = sort ?? initial;
  const visible = useMemo(() => sortTasks(applyFilter(tasks, filter), effectiveSort), [tasks, filter, effectiveSort]);
  return { sort: effectiveSort, setSort, filter, setFilter, visible };
}
