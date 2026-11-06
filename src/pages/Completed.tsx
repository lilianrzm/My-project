import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Search as SearchIcon, X } from 'lucide-react';
import { useData } from '../state/data';
import { useFeedback, useUI } from '../state/ui';
import { addDays, formatLong, formatRelative } from '../domain/dates';
import { applyFilter, EMPTY_FILTER, isFilterActive, localDateOf, searchTasks, sortTasks, type TaskFilter } from '../domain/selectors';
import type { SortMode } from '../domain/types';
import { useTaskActions } from '../hooks/useTaskActions';
import { TaskList } from '../components/TaskList';
import { EmptyState, ListToolbar, PageHeader, Section } from '../components/ui';

export function CompletedPage() {
  const { tasks, tagNames } = useData();
  const { today } = useUI();
  const { confirm } = useFeedback();
  const actions = useTaskActions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const [limit, setLimit] = useState(100);

  const [showCancelled, setShowCancelled] = useState(false);
  const cancelledCount = useMemo(() => tasks.filter((t) => t.status === 'cancelled').length, [tasks]);
  const completed = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'completed' || (showCancelled && t.status === 'cancelled'))
        .map((t) => (t.status === 'cancelled' ? { ...t, completedAt: t.cancelledAt } : t)),
    [tasks, showCancelled],
  );
  const visible = useMemo(() => {
    let list = applyFilter(completed, filter);
    if (query.trim()) list = searchTasks(list, query, tagNames);
    return [...list].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  }, [completed, filter, query, tagNames]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof visible>();
    for (const t of visible.slice(0, limit)) {
      const d = t.completedAt ? localDateOf(t.completedAt) : 'sin-fecha';
      const arr = m.get(d) ?? [];
      arr.push(t);
      m.set(d, arr);
    }
    return [...m.entries()];
  }, [visible, limit]);

  const clearOld = async () => {
    const cutoff = addDays(today, -30);
    const old = completed.filter((t) => t.completedAt && localDateOf(t.completedAt) < cutoff);
    if (!old.length) return;
    const ok = await confirm({
      title: 'Limpiar historial antiguo',
      message: `Se eliminarán ${old.length} tarea(s) completadas hace más de 30 días. Podrás deshacerlo durante unos segundos. Te recomendamos exportar un respaldo antes.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (ok) await actions.remove(old);
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Historial" title="Completadas" subtitle={completed.length ? `${completed.length} tareas terminadas` : undefined} />

      <div className="search-box">
        <SearchIcon size={18} aria-hidden="true" />
        <label htmlFor="done-search" className="sr-only">
          Buscar en completadas
        </label>
        <input id="done-search" type="search" placeholder="Buscar en el historial" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="toolbar-row">
        <ListToolbar sort={'created' as SortMode} onSort={() => undefined} filter={filter} onFilter={setFilter} allowProjectFilter allowManual={false} hideSort />
        {cancelledCount > 0 && (
          <label className="switch">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            Incluir canceladas ({cancelledCount})
          </label>
        )}
      </div>

      {completed.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={28} />} title="Todavía no hay tareas completadas">
          Cuando termines algo, quedará guardado aquí. Podrás buscarlo o reabrirlo cuando quieras.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="Sin resultados">{query ? `Nada coincide con “${query}”.` : isFilterActive(filter) ? 'Ninguna tarea coincide con los filtros.' : ''}</EmptyState>
      ) : (
        <>
          {groups.map(([d, list]) => (
            <Section key={d} title={d === 'sin-fecha' ? 'Sin fecha' : d === today || addDays(today, -1) === d ? formatRelative(d, today) : formatLong(d)} count={list.length}>
              <TaskList tasks={sortTasks(list, 'manual').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))} label="Completadas" />
            </Section>
          ))}
          {visible.length > limit && (
            <button type="button" className="btn btn-quiet" onClick={() => setLimit((l) => l + 100)}>
              Mostrar más ({visible.length - limit} restantes)
            </button>
          )}
          <div className="page-foot">
            <button type="button" className="btn btn-link btn-sm" onClick={() => void clearOld()}>
              Limpiar completadas de hace más de 30 días
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function SearchPage() {
  const { tasks, tagNames } = useData();
  const [query, setQuery] = useState('');
  const [includeDone, setIncludeDone] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<SortMode>('due');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const results = useMemo(() => {
    const pool = includeDone ? tasks : tasks.filter((t) => t.status === 'open');
    const filtered = applyFilter(pool, filter);
    const found = query.trim() ? searchTasks(filtered, query, tagNames) : isFilterActive(filter) ? filtered : [];
    return sortTasks(found, sort);
  }, [tasks, query, includeDone, filter, sort, tagNames]);

  const searching = !!query.trim() || isFilterActive(filter);

  return (
    <div className="page">
      <PageHeader eyebrow="Buscar" title="Encuentra cualquier cosa" serif />
      <div className="search-box search-box-lg">
        <SearchIcon size={20} aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">
          Buscar tareas
        </label>
        <input
          id="global-search"
          ref={ref}
          type="search"
          placeholder="Título, notas, subtareas o etiquetas"
          value={query}
          enterKeyHint="search"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="toolbar-row">
        <label className="switch">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          Incluir completadas
        </label>
      </div>
      <ListToolbar sort={sort} onSort={setSort} filter={filter} onFilter={setFilter} allowProjectFilter allowManual={false} />
      <div aria-live="polite" className="sr-only">
        {searching ? `${results.length} resultado${results.length === 1 ? '' : 's'}` : ''}
      </div>
      {!searching ? (
        <p className="muted pad">Escribe para buscar entre todas tus tareas. La búsqueda ignora acentos y mayúsculas.</p>
      ) : (
        <TaskList
          tasks={results}
          label="Resultados de búsqueda"
          empty={<EmptyState icon={<SearchIcon size={26} />} title="Sin resultados">{query ? `Nada coincide con “${query}”.` : 'Ninguna tarea coincide con los filtros.'}</EmptyState>}
        />
      )}
    </div>
  );
}
