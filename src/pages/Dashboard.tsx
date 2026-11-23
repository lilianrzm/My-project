import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, CalendarRange, Flame, Leaf, Plus, Sparkles, Sun, Target } from 'lucide-react';
import { useData } from '../state/data';
import { routeHref, useUI } from '../state/ui';
import { addDays, formatLong, formatRelative, greeting } from '../domain/dates';
import { completedOn, isForToday, isOverdue, sortTasks } from '../domain/selectors';
import { activeDays, dayStreak, goalProgress, isScheduled } from '../domain/personal';
import { useTaskActions } from '../hooks/useTaskActions';
import { TaskList } from '../components/TaskList';
import { EmptyState, ProgressBar, ProgressRing } from '../components/ui';
import { JournalCard } from '../components/Journal';
import { HabitCheck } from './Habits';

const SUBTITLES = [
  '¡Hoy puede ser un gran día! ✨',
  'Un paso a la vez, a tu ritmo. 🌱',
  'Haz espacio para lo que te importa. 🌸',
  'Pequeños pasos, grandes logros. 💫',
  'Hoy también cuenta. ☀️',
  'Celebra cada avance, por pequeño que sea. 🎉',
];

export function Dashboard() {
  const { tasks, settings, categories, habits, habitLogs, goals } = useData();
  const { today, openQuickAdd, navigate } = useUI();
  const actions = useTaskActions();
  const [quick, setQuick] = useState('');
  const quickRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const todays = tasks.filter((t) => isForToday(t, today));
    const overdue = todays.filter((t) => isOverdue(t, today));
    const doneToday = tasks.filter((t) => completedOn(t, today));
    const weekEnd = addDays(today, 7);
    const upcoming = sortTasks(
      tasks.filter((t) => t.status === 'open' && t.dueDate && t.dueDate > today && t.dueDate <= weekEnd),
      'due',
    );
    return { todays: sortTasks(todays, 'due'), overdue, doneToday, upcoming };
  }, [tasks, today]);

  // Progreso de hoy por área de vida
  const areaCards = useMemo(() => {
    return categories
      .map((c) => {
        const pending = stats.todays.filter((t) => t.categoryId === c.id).length;
        const done = stats.doneToday.filter((t) => t.categoryId === c.id).length;
        const open = tasks.filter((t) => t.status === 'open' && t.categoryId === c.id).length;
        return { c, pending, done, total: pending + done, open };
      })
      .filter((a) => a.total > 0 || a.open > 0);
  }, [categories, stats, tasks]);

  const habitsToday = habits.filter((h) => !h.archived && isScheduled(h, today));
  const habitDoneToday = useMemo(() => new Set(habitLogs.filter((l) => l.date === today).map((l) => l.habitId)), [habitLogs, today]);
  const streak = useMemo(() => dayStreak(activeDays(tasks, habitLogs), today), [tasks, habitLogs, today]);
  const activeGoals = goals.filter((g) => g.status === 'active').slice(0, 3);

  const totalToday = stats.todays.length + stats.doneToday.length;
  const progress = totalToday ? stats.doneToday.length / totalToday : 0;
  const subtitle = SUBTITLES[Number(today.slice(8, 10)) % SUBTITLES.length];
  const name = settings.userName.trim();
  const g = greeting();

  const submitQuick = async () => {
    const t = quick.trim();
    if (!t) {
      openQuickAdd({ todayDate: today });
      return;
    }
    const created = await actions.create({ title: t, todayDate: today });
    if (created) setQuick('');
    quickRef.current?.focus();
  };

  return (
    <div className="page page-dashboard">
      <header className="hero">
        <p className="eyebrow">{formatLong(today)}</p>
        <h1 className="display hero-title" tabIndex={-1} data-page-title>
          {g.text}
          {name ? `, ${name}` : ''} <span aria-hidden="true">{g.emoji}</span>
        </h1>
        <p className="hero-sub">{subtitle}</p>
        {streak > 0 && (
          <p className="streak-pill">
            <Flame size={16} aria-hidden="true" /> {streak === 1 ? '¡Empezaste tu racha!' : `${streak} días seguidos avanzando`}
          </p>
        )}
      </header>

      {areaCards.length > 0 && (
        <section className="area-grid" aria-label="Tus áreas hoy">
          {areaCards.map(({ c, pending, done, total, open }) => (
            <button
              key={c.id}
              type="button"
              className="area-card"
              style={{ '--area': c.color } as CSSProperties}
              onClick={() => (total ? navigate({ name: 'today' }) : openQuickAdd({ categoryId: c.id, todayDate: today }))}
            >
              <span className="area-card-top">
                <span className="area-emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="area-name">{c.name}</span>
              </span>
              {total ? (
                <>
                  <span className="area-count">
                    {done} de {total} hoy {done === total && '🎉'}
                  </span>
                  <span className="area-bar" aria-hidden="true">
                    <span style={{ width: `${(done / total) * 100}%` }} />
                  </span>
                </>
              ) : (
                <span className="area-count muted">
                  {open} pendiente{open === 1 ? '' : 's'} · <Plus size={12} aria-hidden="true" /> para hoy
                </span>
              )}
              {pending > 0 && <span className="sr-only">{pending} por hacer</span>}
            </button>
          ))}
        </section>
      )}

      <div className="dash-grid">
        <section className="card card-today" aria-labelledby="dash-today">
          <div className="card-head">
            <h2 id="dash-today" className="card-title">
              <Sun size={18} aria-hidden="true" /> Hoy
            </h2>
            <a className="btn btn-link btn-sm" href={routeHref({ name: 'today' })}>
              Ver todo <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>

          <div className="today-summary">
            <ProgressRing value={progress} label={`Progreso de hoy: ${stats.doneToday.length} de ${totalToday} tareas`} />
            <div>
              <p className="summary-big">
                {stats.todays.length === 0
                  ? stats.doneToday.length
                    ? '¡Todo listo! 🎉'
                    : 'Día despejado'
                  : `${stats.todays.length} por hacer`}
              </p>
              <p className="muted">
                {stats.doneToday.length} completada{stats.doneToday.length === 1 ? '' : 's'} hoy
                {stats.overdue.length > 0 && (
                  <>
                    {' · '}
                    <span className="text-danger">
                      {stats.overdue.length} pendiente{stats.overdue.length === 1 ? '' : 's'} de días anteriores
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <form
            className="inline-add"
            onSubmit={(e) => {
              e.preventDefault();
              void submitQuick();
            }}
          >
            <Plus size={18} aria-hidden="true" />
            <label htmlFor="dash-quick" className="sr-only">
              Añadir tarea para hoy
            </label>
            <input
              id="dash-quick"
              ref={quickRef}
              placeholder="Añadir algo para hoy…"
              value={quick}
              maxLength={500}
              enterKeyHint="done"
              autoComplete="off"
              onChange={(e) => setQuick(e.target.value)}
            />
            {quick.trim() && (
              <button type="submit" className="btn btn-primary btn-sm">
                Añadir
              </button>
            )}
          </form>

          <TaskList
            tasks={stats.todays.slice(0, 6)}
            label="Pendientes de hoy"
            empty={
              <EmptyState title={stats.doneToday.length ? '¡Lo lograste todo hoy! 🌟' : 'Un día despejado'}>
                {stats.doneToday.length ? 'Tómate un momento para disfrutarlo.' : 'Añade algo arriba o simplemente disfruta el espacio.'}
              </EmptyState>
            }
          />
          {stats.todays.length > 6 && (
            <a className="more-link" href={routeHref({ name: 'today' })}>
              y {stats.todays.length - 6} más
            </a>
          )}
        </section>

        <div className="dash-side">
          <section className="card" aria-labelledby="dash-habits">
            <div className="card-head">
              <h2 id="dash-habits" className="card-title">
                <Sparkles size={18} aria-hidden="true" /> Hábitos de hoy
              </h2>
              <a className="btn btn-link btn-sm" href={routeHref({ name: 'habits' })}>
                Ver <ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
            {habitsToday.length === 0 ? (
              <p className="muted small">
                {habits.length ? 'Hoy no toca ningún hábito. ¡Descansa! 🌙' : <a href={routeHref({ name: 'habits' })}>Crea tu primer hábito</a>}
              </p>
            ) : (
              <div className="habit-strip">
                {habitsToday.map((h) => (
                  <div key={h.id} className="habit-strip-item">
                    <HabitCheck habit={h} date={today} done={habitDoneToday.has(h.id)} />
                    <span className="habit-strip-name">{h.title}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="dash-goals">
            <div className="card-head">
              <h2 id="dash-goals" className="card-title">
                <Target size={18} aria-hidden="true" /> Mis metas
              </h2>
              <a className="btn btn-link btn-sm" href={routeHref({ name: 'goals' })}>
                Ver <ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
            {activeGoals.length === 0 ? (
              <p className="muted small">
                <a href={routeHref({ name: 'goals' })}>Define una meta</a> y mira cómo avanzas.
              </p>
            ) : (
              <ul className="mini-projects">
                {activeGoals.map((goal) => {
                  const p = goalProgress(goal, tasks);
                  return (
                    <li key={goal.id}>
                      <a href={routeHref({ name: 'goals' })} className="mini-project" style={{ '--p-color': goal.color } as CSSProperties}>
                        <span className="mini-project-top">
                          <span aria-hidden="true">{goal.emoji}</span>
                          <span className="mini-project-name">{goal.title}</span>
                          <span className="muted small">{p.pct}%</span>
                        </span>
                        <ProgressBar value={p.pct / 100} label={`Avance de ${goal.title}`} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <JournalCard date={today} compact />

          <section className="card" aria-labelledby="dash-upcoming">
            <div className="card-head">
              <h2 id="dash-upcoming" className="card-title">
                <CalendarRange size={18} aria-hidden="true" /> Próximos días
              </h2>
              <a className="btn btn-link btn-sm" href={routeHref({ name: 'upcoming' })}>
                Ver <ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
            {stats.upcoming.length === 0 ? (
              <p className="muted small">Nada en los próximos 7 días.</p>
            ) : (
              <ul className="mini-list">
                {stats.upcoming.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <UpcomingItem id={t.id} title={t.title} when={formatRelative(t.dueDate!, today)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <a className="card card-link review-link" href={routeHref({ name: 'achievements' })}>
            <Leaf size={18} aria-hidden="true" />
            <span>
              <strong>Mis logros</strong>
              <span className="muted small"> · mira todo lo que has avanzado</span>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}

function UpcomingItem({ id, title, when }: { id: string; title: string; when: string }) {
  const { selectTask } = useUI();
  return (
    <button type="button" className="mini-item" onClick={() => selectTask(id)}>
      <span className="mini-title">{title}</span>
      <span className="mini-when">{when}</span>
    </button>
  );
}
