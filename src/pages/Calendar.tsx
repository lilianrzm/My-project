import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useData } from '../state/data';
import { useUI } from '../state/ui';
import type { Task } from '../domain/types';
import {
  addDays,
  addMonthsAnchored,
  formatLong,
  formatMonthYear,
  formatDayMonth,
  parseISODate,
  startOfMonth,
  startOfWeek,
  weekdayHeaders,
} from '../domain/dates';
import { sortTasks } from '../domain/selectors';
import { TaskList } from '../components/TaskList';
import { EmptyState, PageHeader } from '../components/ui';

type Mode = 'month' | 'week';

export function CalendarPage() {
  const { tasks, settings, projectById } = useData();
  const { today, openQuickAdd, selectTask } = useUI();
  const [mode, setMode] = useState<Mode>('month');
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);

  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const arr = m.get(t.dueDate) ?? [];
      arr.push(t);
      m.set(t.dueDate, arr);
    }
    for (const [k, v] of m) m.set(k, sortTasks(v, 'due').sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1)));
    return m;
  }, [tasks]);

  const days = useMemo(() => {
    if (mode === 'week') {
      const start = startOfWeek(cursor, settings.weekStart);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const first = startOfMonth(cursor);
    const start = startOfWeek(first, settings.weekStart);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [mode, cursor, settings.weekStart]);

  const headers = weekdayHeaders(settings.weekStart);
  const month = cursor.slice(0, 7);

  const move = (dir: -1 | 1) => {
    if (mode === 'week') setCursor(addDays(cursor, dir * 7));
    else setCursor(addMonthsAnchored(startOfMonth(cursor), dir, 1));
  };

  const title =
    mode === 'month'
      ? formatMonthYear(cursor)
      : `${formatDayMonth(days[0])} – ${formatDayMonth(days[6])} ${days[6].slice(0, 4)}`;

  const selectedTasks = byDate.get(selected) ?? [];

  const onGridKey = (e: React.KeyboardEvent, day: string) => {
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in delta)) return;
    e.preventDefault();
    const next = addDays(day, delta[e.key]);
    setSelected(next);
    if (!days.includes(next)) setCursor(next);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus());
  };

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Calendario"
        title={title}
        actions={
          <>
            <div className="segmented" role="radiogroup" aria-label="Vista">
              {(['month', 'week'] as Mode[]).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={`seg${mode === m ? ' is-on' : ''}`} onClick={() => setMode(m)}>
                  {m === 'month' ? 'Mes' : 'Semana'}
                </button>
              ))}
            </div>
            <div className="cal-nav">
              <button type="button" className="icon-btn icon-btn-bordered" aria-label={mode === 'month' ? 'Mes anterior' : 'Semana anterior'} onClick={() => move(-1)}>
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setCursor(today);
                  setSelected(today);
                }}
              >
                Hoy
              </button>
              <button type="button" className="icon-btn icon-btn-bordered" aria-label={mode === 'month' ? 'Mes siguiente' : 'Semana siguiente'} onClick={() => move(1)}>
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        }
      />

      <div className={`cal-layout cal-${mode}`}>
        <div className="cal" role="grid" aria-label={title}>
          <div className="cal-head" role="row">
            {headers.map((h) => (
              <div key={h} className="cal-hcell" role="columnheader">
                {h}
              </div>
            ))}
          </div>
          {Array.from({ length: days.length / 7 }, (_, w) => (
            <div className="cal-row" role="row" key={w}>
              {days.slice(w * 7, w * 7 + 7).map((d) => {
                const list = byDate.get(d) ?? [];
                const openCount = list.filter((t) => t.status === 'open').length;
                const outside = mode === 'month' && d.slice(0, 7) !== month;
                const limit = mode === 'week' ? 12 : 3;
                return (
                  <div
                    key={d}
                    role="gridcell"
                    aria-selected={d === selected}
                    className={`cal-cell${outside ? ' is-outside' : ''}${d === today ? ' is-today' : ''}${d === selected ? ' is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="cal-day"
                      data-day={d}
                      tabIndex={d === selected ? 0 : -1}
                      aria-label={`${formatLong(d)}${openCount ? `, ${openCount} pendiente${openCount === 1 ? '' : 's'}` : ''}`}
                      onClick={() => setSelected(d)}
                      onKeyDown={(e) => onGridKey(e, d)}
                    >
                      <span className="cal-num">{parseISODate(d).getDate()}</span>
                      {mode === 'month' && openCount > 0 && <span className="cal-dot-count">{openCount}</span>}
                    </button>
                    <ul className="cal-items">
                      {list.slice(0, limit).map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className={`cal-item${t.status === 'completed' ? ' is-done' : ''}${t.status === 'open' && d < today ? ' is-overdue' : ''}`}
                            style={{ '--c': t.projectId ? projectById.get(t.projectId)?.color : undefined } as CSSProperties}
                            onClick={() => {
                              setSelected(d);
                              selectTask(t.id);
                            }}
                            tabIndex={-1}
                          >
                            {t.title}
                          </button>
                        </li>
                      ))}
                      {list.length > limit && <li className="cal-more">+{list.length - limit} más</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <section className="cal-day-panel card" aria-labelledby="cal-sel">
          <div className="card-head">
            <h2 id="cal-sel" className="card-title">
              {formatLong(selected)}
            </h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openQuickAdd({ dueDate: selected })}>
              <Plus size={15} aria-hidden="true" /> Añadir
            </button>
          </div>
          <TaskList
            tasks={selectedTasks}
            showDate={false}
            label={`Tareas del ${formatLong(selected)}`}
            empty={<EmptyState title="Día libre">No hay tareas con esta fecha.</EmptyState>}
          />
        </section>
      </div>
    </div>
  );
}
