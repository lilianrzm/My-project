import { useMemo } from 'react';
import { CalendarRange, Inbox as InboxIcon, Plus, Sun } from 'lucide-react';
import { useData } from '../state/data';
import { useUI } from '../state/ui';
import { addDays, formatLong } from '../domain/dates';
import { completedOn, groupUpcoming, isForToday, isInbox, isOverdue } from '../domain/selectors';
import { useListView } from '../hooks/useListView';
import { TaskList } from '../components/TaskList';
import { EmptyState, ListToolbar, PageHeader, Section } from '../components/ui';

function AddButton({ onClick, label = 'Nueva tarea' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-primary" onClick={onClick}>
      <Plus size={17} aria-hidden="true" /> {label}
    </button>
  );
}

export function InboxPage() {
  const { tasks, settings } = useData();
  const { openQuickAdd } = useUI();
  const inbox = useMemo(() => tasks.filter(isInbox), [tasks]);
  const view = useListView(inbox);
  const done = useMemo(
    () => (settings.showCompleted ? tasks.filter((t) => t.status === 'completed' && !t.projectId && !t.dueDate) : []),
    [tasks, settings.showCompleted],
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Captura"
        title="Inbox"
        subtitle="Todo lo que aún no tiene lugar. Organízalo cuando tengas un momento."
        actions={<AddButton onClick={() => openQuickAdd()} />}
      />
      <ListToolbar sort={view.sort} onSort={view.setSort} filter={view.filter} onFilter={view.setFilter} />
      <TaskList
        tasks={view.visible}
        reorderable={view.sort === 'manual'}
        label="Tareas en Inbox"
        empty={
          inbox.length ? (
            <EmptyState title="Sin resultados">Ninguna tarea coincide con los filtros.</EmptyState>
          ) : (
            <EmptyState icon={<InboxIcon size={28} />} title="Inbox vacío" action={<AddButton onClick={() => openQuickAdd()} label="Capturar algo" />}>
              Una mente despejada. Captura aquí cualquier idea en cuanto aparezca.
            </EmptyState>
          )
        }
      />
      {done.length > 0 && (
        <Section title="Completadas" count={done.length}>
          <TaskList tasks={done.slice(0, 30)} label="Completadas" />
        </Section>
      )}
    </div>
  );
}

export function TodayPage() {
  const { tasks, settings } = useData();
  const { today, openQuickAdd } = useUI();
  const all = useMemo(() => tasks.filter((t) => isForToday(t, today)), [tasks, today]);
  const view = useListView(all);
  const overdue = view.visible.filter((t) => isOverdue(t, today));
  const current = view.visible.filter((t) => !isOverdue(t, today));
  const doneToday = useMemo(
    () => (settings.showCompleted ? tasks.filter((t) => completedOn(t, today)) : []),
    [tasks, today, settings.showCompleted],
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow={formatLong(today)}
        title="Hoy"
        subtitle={all.length ? `${all.length} ${all.length === 1 ? 'tarea' : 'tareas'} para atender` : undefined}
        actions={<AddButton onClick={() => openQuickAdd({ todayDate: today })} />}
      />
      <ListToolbar sort={view.sort} onSort={view.setSort} filter={view.filter} onFilter={view.setFilter} allowProjectFilter />

      {overdue.length > 0 && (
        <Section title="Vencidas" count={overdue.length} tone="danger">
          <TaskList tasks={overdue} label="Tareas vencidas" />
        </Section>
      )}

      <Section title="Para hoy" count={current.length}>
        <TaskList
          tasks={current}
          reorderable={view.sort === 'manual'}
          label="Tareas para hoy"
          empty={
            all.length === 0 ? (
              <EmptyState icon={<Sun size={28} />} title="Nada pendiente para hoy" action={<AddButton onClick={() => openQuickAdd({ todayDate: today })} label="Añadir para hoy" />}>
                Disfruta el día. Puedes marcar cualquier tarea con “Atender hoy” para traerla aquí.
              </EmptyState>
            ) : overdue.length && !current.length ? (
              <p className="muted small pad">Solo quedan las vencidas de arriba.</p>
            ) : (
              <EmptyState title="Sin resultados">Ninguna tarea coincide con los filtros.</EmptyState>
            )
          }
        />
      </Section>

      {doneToday.length > 0 && (
        <Section title="Completadas hoy" count={doneToday.length}>
          <TaskList tasks={doneToday} label="Completadas hoy" />
        </Section>
      )}
    </div>
  );
}

export function UpcomingPage() {
  const { tasks, settings } = useData();
  const { today, openQuickAdd } = useUI();
  const future = useMemo(() => tasks.filter((t) => t.status === 'open' && !!t.dueDate && t.dueDate > today), [tasks, today]);
  const view = useListView(future, { allowManual: false });
  const groups = useMemo(() => groupUpcoming(view.visible, today, settings.weekStart), [view.visible, today, settings.weekStart]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Planificación"
        title="Próximamente"
        subtitle="Lo que viene, ordenado por fecha."
        actions={<AddButton onClick={() => openQuickAdd({ dueDate: addDays(today, 1) })} />}
      />
      <ListToolbar sort={view.sort} onSort={view.setSort} filter={view.filter} onFilter={view.setFilter} allowProjectFilter allowManual={false} />
      {future.length === 0 ? (
        <EmptyState icon={<CalendarRange size={28} />} title="Sin compromisos próximos" action={<AddButton onClick={() => openQuickAdd({ dueDate: addDays(today, 1) })} label="Planear algo" />}>
          Cuando asignes fechas futuras a tus tareas, aparecerán aquí agrupadas.
        </EmptyState>
      ) : (
        groups
          .filter((g) => g.tasks.length > 0)
          .map((g) => (
            <Section key={g.key} title={g.label} count={g.tasks.length}>
              <TaskList tasks={g.tasks} label={g.label} />
            </Section>
          ))
      )}
      {future.length > 0 && view.visible.length === 0 && <EmptyState title="Sin resultados">Ninguna tarea coincide con los filtros.</EmptyState>}
    </div>
  );
}
