import { memo, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { CalendarDays, Check, GripVertical, ListChecks, Repeat, StickyNote, Sun } from 'lucide-react';
import { formatRelative, formatTime } from '../domain/dates';
import type { Category, Priority, Project, Settings, Task } from '../domain/types';
import { PRIORITY_LABEL } from '../domain/types';

export function PriorityMark({ priority, withLabel = false }: { priority: Priority; withLabel?: boolean }) {
  if (!priority) return null;
  return (
    <span className={`prio prio-${priority}`} title={`Prioridad ${PRIORITY_LABEL[priority].toLowerCase()}`}>
      <span className="prio-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {withLabel ? <span className="prio-label">{PRIORITY_LABEL[priority]}</span> : <span className="sr-only">Prioridad {PRIORITY_LABEL[priority].toLowerCase()}</span>}
    </span>
  );
}

interface CheckProps {
  checked: boolean;
  label: string;
  onToggle: () => void;
  size?: 'md' | 'sm';
}

export function CheckButton({ checked, label, onToggle, size = 'md' }: CheckProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`check check-${size}${checked ? ' is-checked' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span className="check-box" aria-hidden="true">
        <Check size={size === 'sm' ? 12 : 14} strokeWidth={3} />
      </span>
    </button>
  );
}

export interface TaskRowProps {
  task: Task;
  today: string;
  selected: boolean;
  project?: Project;
  category?: Category;
  tagNames: string[];
  settings: Settings;
  showProject?: boolean;
  showDate?: boolean;
  draggable?: boolean;
  dragStyle?: CSSProperties;
  isDragging?: boolean;
  onToggle: (t: Task) => void;
  onOpen: (id: string) => void;
  onDragStart?: (id: string, e: ReactPointerEvent) => void;
  onMove?: (id: string, dir: -1 | 1) => void;
}

function TaskRowInner(p: TaskRowProps) {
  const { task, today } = p;
  const done = task.status === 'completed';
  const cancelled = task.status === 'cancelled';
  const overdue = !done && !!task.dueDate && task.dueDate < today;
  const subDone = task.subtasks.filter((s) => s.done).length;
  const hasNotes = !!(task.notes.trim() || task.description.trim());

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (p.onMove && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      p.onMove(task.id, e.key === 'ArrowUp' ? -1 : 1);
    }
  };

  return (
    <div
      className={`task-row${done || cancelled ? ' is-done' : ''}${cancelled ? ' is-cancelled' : ''}${p.selected ? ' is-selected' : ''}${p.isDragging ? ' is-dragging' : ''}`}
      style={p.dragStyle}
      data-task-id={task.id}
      onClick={() => p.onOpen(task.id)}
    >
      {p.draggable && (
        <span
          className="drag-handle"
          aria-hidden="true"
          title="Arrastra para reordenar (o Alt + ↑/↓)"
          onPointerDown={(e) => p.onDragStart?.(task.id, e)}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </span>
      )}
      <CheckButton
        checked={done}
        label={done ? `Reabrir: ${task.title}` : cancelled ? `Reactivar: ${task.title}` : `Completar: ${task.title}`}
        onToggle={() => p.onToggle(task)}
      />
      <button
        type="button"
        className="task-main"
        aria-current={p.selected ? 'true' : undefined}
        aria-description={overdue ? 'Vencida' : undefined}
        onClick={(e) => {
          e.stopPropagation();
          p.onOpen(task.id);
        }}
        onKeyDown={onKey}
      >
        <div className="task-title-line">
          <span className="task-title">{task.title}</span>
          <PriorityMark priority={task.priority} />
        </div>
        <div className="task-meta">
          {cancelled && <span className="meta-chip is-cancelled">Cancelada</span>}
          {p.showDate !== false && task.dueDate && (
            <span className={`meta-chip${overdue ? ' is-overdue' : task.dueDate === today ? ' is-today' : ''}`}>
              <CalendarDays size={13} aria-hidden="true" />
              {overdue ? 'Vencida · ' : ''}
              {formatRelative(task.dueDate, today)}
              {task.dueTime ? ` · ${formatTime(task.dueTime, p.settings.timeFormat)}` : ''}
            </span>
          )}
          {task.todayDate && !task.dueDate && !done && (
            <span className="meta-chip is-today">
              <Sun size={13} aria-hidden="true" /> Hoy
            </span>
          )}
          {task.recurrence && (
            <span className="meta-icon" title="Tarea recurrente">
              <Repeat size={13} aria-hidden="true" />
              <span className="sr-only">Recurrente</span>
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="meta-chip">
              <ListChecks size={13} aria-hidden="true" />
              {subDone}/{task.subtasks.length}
            </span>
          )}
          {hasNotes && (
            <span className="meta-icon" title="Tiene notas">
              <StickyNote size={13} aria-hidden="true" />
              <span className="sr-only">Con notas</span>
            </span>
          )}
          {p.showProject !== false && p.project && (
            <span className="meta-chip">
              <span className="dot" style={{ background: p.project.color }} aria-hidden="true" />
              {p.project.name}
            </span>
          )}
          {p.category && (
            <span className="tag tag-cat" style={{ '--tag-color': p.category.color } as CSSProperties}>
              {p.category.name}
            </span>
          )}
          {p.tagNames.map((n) => (
            <span key={n} className="tag">
              #{n}
            </span>
          ))}
        </div>
      </button>
    </div>
  );
}

/** Solo se vuelve a renderizar si cambia la propia tarea (updatedAt) o su contexto visual. */
export const TaskRow = memo(TaskRowInner, (a, b) =>
  a.task.id === b.task.id &&
  a.task.updatedAt === b.task.updatedAt &&
  a.task.status === b.task.status &&
  a.today === b.today &&
  a.selected === b.selected &&
  a.project === b.project &&
  a.category === b.category &&
  a.tagNames.join('|') === b.tagNames.join('|') &&
  a.settings === b.settings &&
  a.showProject === b.showProject &&
  a.showDate === b.showDate &&
  a.draggable === b.draggable &&
  a.isDragging === b.isDragging &&
  a.dragStyle?.transform === b.dragStyle?.transform &&
  a.onToggle === b.onToggle &&
  a.onOpen === b.onOpen &&
  a.onMove === b.onMove &&
  a.onDragStart === b.onDragStart,
);
