import { useMemo } from 'react';
import { Leaf } from 'lucide-react';
import { useData } from '../state/data';
import { routeHref, useUI } from '../state/ui';
import { addDays, diffDays, formatDayMonth, startOfWeek } from '../domain/dates';
import { isOverdue, localDateOf, sortTasks } from '../domain/selectors';
import { TaskList } from '../components/TaskList';
import { PageHeader, Section } from '../components/ui';

/** Revisión semanal: breve, útil y sin presión. */
export function ReviewPage() {
  const { tasks, projects, settings } = useData();
  const { today } = useUI();

  const data = useMemo(() => {
    const weekStart = startOfWeek(today, settings.weekStart);
    const weekEnd = addDays(weekStart, 6);
    const nextStart = addDays(weekEnd, 1);
    const nextEnd = addDays(nextStart, 6);

    const completedWeek = tasks
      .filter((t) => t.status === 'completed' && t.completedAt && localDateOf(t.completedAt) >= weekStart && localDateOf(t.completedAt) <= weekEnd)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    const overdue = sortTasks(tasks.filter((t) => isOverdue(t, today)), 'due');
    const upcoming = sortTasks(
      tasks.filter((t) => t.status === 'open' && t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 7)),
      'due',
    );
    const priorities = sortTasks(
      tasks.filter(
        (t) =>
          t.status === 'open' &&
          t.priority >= 2 &&
          (!t.dueDate || (t.dueDate >= nextStart && t.dueDate <= nextEnd)),
      ),
      'priority',
    );

    // Proyectos activos sin movimiento en los últimos 7 días
    const lastActivity = new Map<string, string>();
    for (const t of tasks) {
      if (!t.projectId) continue;
      const ts = [t.updatedAt, t.completedAt ?? ''].sort().pop()!;
      if ((lastActivity.get(t.projectId) ?? '') < ts) lastActivity.set(t.projectId, ts);
    }
    const stale = projects
      .filter((p) => p.status === 'active')
      .map((p) => {
        const last = [p.updatedAt, lastActivity.get(p.id) ?? ''].sort().pop()!;
        return { project: p, days: diffDays(today, localDateOf(last)) };
      })
      .filter((x) => x.days >= 7)
      .sort((a, b) => b.days - a.days);

    return { weekStart, weekEnd, nextStart, nextEnd, completedWeek, overdue, upcoming, priorities, stale };
  }, [tasks, projects, today, settings.weekStart]);

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Semana del ${formatDayMonth(data.weekStart)} al ${formatDayMonth(data.weekEnd)}`}
        title="Revisión semanal"
        subtitle="Unos minutos para cerrar la semana con claridad y empezar la siguiente con intención."
      />

      <div className="review-stats">
        <div className="stat">
          <span className="stat-num">{data.completedWeek.length}</span>
          <span className="stat-label">completadas esta semana</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.overdue.length}</span>
          <span className="stat-label">pendientes vencidas</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.upcoming.length}</span>
          <span className="stat-label">próximos 7 días</span>
        </div>
      </div>

      <Section title="Lo que lograste" count={data.completedWeek.length}>
        {data.completedWeek.length ? (
          <TaskList tasks={data.completedWeek.slice(0, 20)} label="Completadas esta semana" />
        ) : (
          <p className="muted small pad">Esta semana todavía no hay tareas completadas. Cada pequeño paso cuenta.</p>
        )}
      </Section>

      <Section title="Pendientes vencidos" count={data.overdue.length}>
        {data.overdue.length ? (
          <>
            <p className="hint pad-x">Decide con calma: reprograma, delega a otro día o elimina lo que ya no importa.</p>
            <TaskList tasks={data.overdue} label="Pendientes vencidos" />
          </>
        ) : (
          <p className="muted small pad">Nada vencido. Todo está al día.</p>
        )}
      </Section>

      <Section title="Proyectos sin actividad" count={data.stale.length}>
        {data.stale.length ? (
          <ul className="mini-list">
            {data.stale.map(({ project, days }) => (
              <li key={project.id}>
                <a className="mini-item" href={routeHref({ name: 'project', id: project.id })}>
                  <span className="mini-title">
                    <span className="dot" style={{ background: project.color }} aria-hidden="true" /> {project.name}
                  </span>
                  <span className="mini-when">hace {days} días</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small pad">Todos tus proyectos activos se movieron esta semana.</p>
        )}
      </Section>

      <Section title="Próximos compromisos" count={data.upcoming.length}>
        {data.upcoming.length ? <TaskList tasks={data.upcoming} label="Próximos compromisos" /> : <p className="muted small pad">Sin compromisos en los próximos 7 días.</p>}
      </Section>

      <Section title={`Prioridades para la semana del ${formatDayMonth(data.nextStart)}`} count={data.priorities.length}>
        {data.priorities.length ? (
          <TaskList tasks={data.priorities} label="Prioridades de la siguiente semana" />
        ) : (
          <p className="muted small pad">
            <Leaf size={14} aria-hidden="true" /> Aún no hay prioridades. Abre una tarea y marca su prioridad como media o alta para verla aquí.
          </p>
        )}
      </Section>
    </div>
  );
}
