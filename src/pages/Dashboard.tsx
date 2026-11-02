import { useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarRange, FolderClosed, Leaf, Plus, Sun } from 'lucide-react';
import { useData } from '../state/data';
import { routeHref, useUI } from '../state/ui';
import { addDays, formatLong, formatRelative, greeting } from '../domain/dates';
import { completedOn, isForToday, isOverdue, projectProgress, sortTasks } from '../domain/selectors';
import { useTaskActions } from '../hooks/useTaskActions';
import { TaskList } from '../components/TaskList';
import { EmptyState, ProgressBar, ProgressRing } from '../components/ui';

const SUBTITLES = [
  "Let's make today a good one.",
  'One thing at a time.',
  'Small steps, beautifully done.',
  'Make space for what matters.',
  'A calm mind, a clear page.',
];

export function Dashboard() {
  const { tasks, projects, settings } = useData();
  const { today, openQuickAdd } = useUI();
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

  const activeProjects = useMemo(
    () =>
      projects
        .filter((p) => p.status === 'active')
        .map((p) => ({ project: p, progress: projectProgress(tasks, p.id) }))
        .slice(0, 4),
    [projects, tasks],
  );

  const totalToday = stats.todays.length + stats.doneToday.length;
  const progress = totalToday ? stats.doneToday.length / totalToday : 0;
  const subtitle = SUBTITLES[Number(today.slice(8, 10)) % SUBTITLES.length];
  const name = settings.userName.trim();

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
          {greeting()}
          {name ? `, ${name}` : ''}
        </h1>
        <p className="hero-sub">{subtitle}</p>
      </header>

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
                {stats.todays.length === 0 ? 'Todo en orden' : `${stats.todays.length} ${stats.todays.length === 1 ? 'pendiente' : 'pendientes'}`}
              </p>
              <p className="muted">
                {stats.doneToday.length} completada{stats.doneToday.length === 1 ? '' : 's'} hoy
                {stats.overdue.length > 0 && (
                  <>
                    {' · '}
                    <span className="text-danger">
                      {stats.overdue.length} vencida{stats.overdue.length === 1 ? '' : 's'}
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
              <EmptyState title="Un día despejado">
                No hay pendientes para hoy. Disfruta el espacio o planea algo bonito.
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
          <section className="card" aria-labelledby="dash-upcoming">
            <div className="card-head">
              <h2 id="dash-upcoming" className="card-title">
                <CalendarRange size={18} aria-hidden="true" /> Próximos vencimientos
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

          <section className="card" aria-labelledby="dash-projects">
            <div className="card-head">
              <h2 id="dash-projects" className="card-title">
                <FolderClosed size={18} aria-hidden="true" /> Proyectos activos
              </h2>
              <a className="btn btn-link btn-sm" href={routeHref({ name: 'projects' })}>
                Ver <ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
            {activeProjects.length === 0 ? (
              <p className="muted small">
                Aún no hay proyectos. <a href={routeHref({ name: 'projects' })}>Crea el primero</a>.
              </p>
            ) : (
              <ul className="mini-projects">
                {activeProjects.map(({ project, progress: pr }) => (
                  <li key={project.id}>
                    <a href={routeHref({ name: 'project', id: project.id })} className="mini-project">
                      <span className="mini-project-top">
                        <span className="dot" style={{ background: project.color }} aria-hidden="true" />
                        <span className="mini-project-name">{project.name}</span>
                        <span className="muted small">{pr.pct}%</span>
                      </span>
                      <ProgressBar value={pr.pct / 100} label={`Avance de ${project.name}`} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <a className="card card-link review-link" href={routeHref({ name: 'review' })}>
            <Leaf size={18} aria-hidden="true" />
            <span>
              <strong>Revisión semanal</strong>
              <span className="muted small"> · un momento para mirar la semana con calma</span>
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
