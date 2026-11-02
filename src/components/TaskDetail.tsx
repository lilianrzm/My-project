import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  Copy,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import type { Priority, Recurrence, Subtask, Task } from '../domain/types';
import { PRIORITY_LABEL } from '../domain/types';
import { formatTimestamp } from '../domain/dates';
import { newId } from '../domain/validate';
import * as repo from '../db/repo';
import { useData } from '../state/data';
import { useFeedback, useUI } from '../state/ui';
import { errorMessage, useTaskActions } from '../hooks/useTaskActions';
import { CheckButton } from './TaskRow';
import { Menu } from './ui';
import { RecurrenceEditor } from './RecurrenceEditor';

/** Panel de detalles de la tarea seleccionada (lateral en iPad horizontal, hoja en vertical). */
export function TaskDetailPanel() {
  const { selectedTaskId, selectTask } = useUI();
  const { tasks } = useData();
  const task = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : undefined;

  // Si la tarea desaparece (eliminada en otra vista), cerrar el panel
  useEffect(() => {
    if (selectedTaskId && !task) {
      const t = window.setTimeout(() => selectTask(null), 0);
      return () => window.clearTimeout(t);
    }
  }, [selectedTaskId, task, selectTask]);

  const open = !!task;
  return (
    <>
      <div className={`detail-scrim${open ? ' is-open' : ''}`} onClick={() => selectTask(null)} aria-hidden="true" />
      <aside className={`detail${open ? ' is-open' : ''}`} aria-label="Detalles de la tarea" aria-hidden={!open} inert={!open}>
        {task && <TaskDetail key={task.id} task={task} onClose={() => selectTask(null)} />}
      </aside>
    </>
  );
}

const PRIORITIES: Priority[] = [0, 1, 2, 3];

function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const { projects, categories, tags, tagById, settings } = useData();
  const { today } = useUI();
  const { toast } = useFeedback();
  const actions = useTaskActions();
  const id = useId();

  // Campos de texto: borrador local, se guarda al pausar la escritura o al salir del campo
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [notes, setNotes] = useState(task.notes);
  const pending = useRef<Partial<Task>>({});
  const timer = useRef<number | undefined>(undefined);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    if (patch.title !== undefined && !patch.title.trim()) delete patch.title;
    if (!Object.keys(patch).length) return;
    try {
      await repo.updateTask(task.id, patch);
      setSavedAt(new Date().toISOString());
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'error' });
    }
  }, [task.id, toast]);

  const queue = (patch: Partial<Task>) => {
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 500);
  };

  const save = (patch: Partial<Task>) => {
    void flush().then(() => actions.update(task.id, patch));
  };

  // Guardar al cerrar/desmontar
  useEffect(() => () => void flush(), [flush]);

  // Atajos: ⌘/Ctrl + S o ⌘/Ctrl + Enter guardan y cierran; Escape cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 's' || e.key === 'Enter')) {
        e.preventDefault();
        void flush().then(() => {
          toast({ message: 'Cambios guardados', tone: 'success', duration: 1800 });
          onClose();
        });
      } else if (e.key === 'Escape' && !document.querySelector('dialog[open]') && !document.querySelector('.menu')) {
        e.preventDefault();
        void flush().then(onClose);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flush, onClose, toast]);

  // Ajustar altura del título
  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [title]);

  const done = task.status === 'completed';
  const onDueChange = (d: string) => {
    const dueDate = d || null;
    const patch: Partial<Task> = { dueDate, dueTime: dueDate ? task.dueTime : null };
    if (task.recurrence) {
      if (!dueDate) {
        patch.recurrence = null; // una recurrencia necesita fecha base
      } else {
        patch.recurrence = { ...task.recurrence, anchor: dueDate };
      }
    }
    save(patch);
  };

  const onRecurrence = (rec: Recurrence | null, due?: string) => {
    const patch: Partial<Task> = { recurrence: rec };
    if (due) patch.dueDate = due;
    save(patch);
  };

  /* Subtareas */
  const [newSub, setNewSub] = useState('');
  const setSubtasks = (subtasks: Subtask[]) => save({ subtasks });
  const addSub = () => {
    const t = newSub.trim();
    if (!t) return;
    setSubtasks([...task.subtasks, { id: newId(), title: t, done: false }]);
    setNewSub('');
  };

  /* Etiquetas */
  const [tagText, setTagText] = useState('');
  const addTag = async () => {
    const n = tagText.trim();
    if (!n) return;
    try {
      const tag = await repo.getOrCreateTag(n);
      if (!task.tagIds.includes(tag.id)) save({ tagIds: [...task.tagIds, tag.id] });
      setTagText('');
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'error' });
    }
  };

  const remove = async () => {
    await flush();
    await actions.remove([task]);
  };

  return (
    <div className="detail-inner">
      <div className="detail-top">
        <button type="button" className="icon-btn" aria-label="Cerrar detalles (Esc)" title="Cerrar (Esc)" onClick={() => void flush().then(onClose)}>
          <X size={20} />
        </button>
        <span className="detail-saved" aria-live="polite">
          {savedAt ? 'Guardado' : ''}
        </span>
        <div className="detail-top-actions">
          <button
            type="button"
            className={`btn btn-sm ${done ? 'btn-quiet' : 'btn-primary'}`}
            onClick={() => void flush().then(() => actions.toggle(task))}
          >
            {done ? (
              <>
                <RotateCcw size={15} aria-hidden="true" /> Reabrir
              </>
            ) : (
              'Completar'
            )}
          </button>
          <Menu
            label="Más acciones"
            trigger={<MoreHorizontal size={20} />}
            items={[
              { label: 'Duplicar', icon: <Copy size={16} />, onSelect: () => void actions.duplicate(task) },
              { label: 'Posponer a mañana', icon: <CalendarClock size={16} />, onSelect: () => void actions.postpone(task, 'tomorrow', settings.weekStart), disabled: done },
              { label: 'Posponer un día', icon: <CalendarPlus size={16} />, onSelect: () => void actions.postpone(task, 'plus1', settings.weekStart), disabled: done },
              { label: 'Posponer a la próxima semana', icon: <CalendarClock size={16} />, onSelect: () => void actions.postpone(task, 'nextWeek', settings.weekStart), disabled: done },
              'sep',
              { label: 'Eliminar tarea', icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove() },
            ]}
          />
        </div>
      </div>

      <div className="detail-scroll">
        <div className="detail-title-row">
          <CheckButton checked={done} label={done ? 'Reabrir tarea' : 'Completar tarea'} onToggle={() => void flush().then(() => actions.toggle(task))} />
          <label htmlFor={`${id}-title`} className="sr-only">
            Título
          </label>
          <textarea
            id={`${id}-title`}
            ref={titleRef}
            className={`detail-title${done ? ' is-done' : ''}`}
            value={title}
            rows={1}
            maxLength={500}
            onChange={(e) => {
              const v = e.target.value.replace(/\n/g, ' ');
              setTitle(v);
              queue({ title: v });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            onBlur={() => {
              if (!title.trim()) setTitle(task.title);
              void flush();
            }}
          />
        </div>
        {!title.trim() && <p className="field-error">El título no puede quedar vacío.</p>}

        <label htmlFor={`${id}-desc`} className="sr-only">
          Descripción
        </label>
        <input
          id={`${id}-desc`}
          className="detail-desc"
          placeholder="Añade una descripción breve"
          value={description}
          maxLength={2000}
          onChange={(e) => {
            setDescription(e.target.value);
            queue({ description: e.target.value });
          }}
          onBlur={() => void flush()}
        />

        <div className="detail-group">
          <button
            type="button"
            className={`toggle-chip${task.todayDate ? ' is-on' : ''}`}
            aria-pressed={!!task.todayDate}
            onClick={() => void actions.toggleToday(task)}
          >
            <Sun size={15} aria-hidden="true" /> {task.todayDate ? 'Marcada para hoy' : 'Atender hoy'}
          </button>

          <div className="field-row">
            <label className="field-label" htmlFor={`${id}-due`}>
              Fecha
            </label>
            <div className="inline-gap">
              <input id={`${id}-due`} type="date" value={task.dueDate ?? ''} onChange={(e) => onDueChange(e.target.value)} />
              {task.dueDate && (
                <button type="button" className="icon-btn icon-btn-sm" aria-label="Quitar fecha" onClick={() => onDueChange('')}>
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          {task.dueDate && (
            <div className="field-row">
              <label className="field-label" htmlFor={`${id}-time`}>
                Hora
              </label>
              <div className="inline-gap">
                <input id={`${id}-time`} type="time" value={task.dueTime ?? ''} onChange={(e) => save({ dueTime: e.target.value || null })} />
                {task.dueTime && (
                  <button type="button" className="icon-btn icon-btn-sm" aria-label="Quitar hora" onClick={() => save({ dueTime: null })}>
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="field-row">
            <span className="field-label" id={`${id}-prio`}>
              Prioridad
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby={`${id}-prio`}>
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={task.priority === p}
                  className={`seg${task.priority === p ? ' is-on' : ''} seg-p${p}`}
                  onClick={() => void actions.setPriority(task, p)}
                >
                  {p === 0 ? 'Ninguna' : PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <label className="field-label" htmlFor={`${id}-proj`}>
              Proyecto
            </label>
            <select id={`${id}-proj`} value={task.projectId ?? ''} onChange={(e) => save({ projectId: e.target.value || null })}>
              <option value="">Sin proyecto (Inbox)</option>
              {projects
                .filter((p) => p.status !== 'archived' || p.id === task.projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="field-row">
            <label className="field-label" htmlFor={`${id}-cat`}>
              Categoría
            </label>
            <select id={`${id}-cat`} value={task.categoryId ?? ''} onChange={(e) => save({ categoryId: e.target.value || null })}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row field-row-top">
            <label className="field-label" htmlFor={`${id}-tag`}>
              Etiquetas
            </label>
            <div className="tag-editor">
              {task.tagIds.map((tid) => {
                const t = tagById.get(tid);
                if (!t) return null;
                return (
                  <span key={tid} className="tag tag-removable">
                    #{t.name}
                    <button type="button" aria-label={`Quitar etiqueta ${t.name}`} onClick={() => save({ tagIds: task.tagIds.filter((x) => x !== tid) })}>
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              <input
                id={`${id}-tag`}
                className="tag-input"
                placeholder="Añadir etiqueta"
                list={`${id}-taglist`}
                value={tagText}
                maxLength={60}
                enterKeyHint="done"
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    void addTag();
                  }
                }}
                onBlur={() => void addTag()}
              />
              <datalist id={`${id}-taglist`}>
                {tags
                  .filter((t) => !task.tagIds.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
              </datalist>
            </div>
          </div>
        </div>

        <div className="detail-group">
          <RecurrenceEditor value={task.recurrence} dueDate={task.dueDate} today={today} weekStart={settings.weekStart} onChange={onRecurrence} />
        </div>

        <div className="detail-group">
          <h3 className="group-title">
            Subtareas
            {task.subtasks.length > 0 && (
              <span className="count">
                {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
              </span>
            )}
          </h3>
          <ul className="subtasks">
            {task.subtasks.map((s, i) => (
              <li key={s.id} className={`subtask${s.done ? ' is-done' : ''}`}>
                <CheckButton
                  size="sm"
                  checked={s.done}
                  label={s.done ? `Marcar pendiente: ${s.title}` : `Completar subtarea: ${s.title}`}
                  onToggle={() => setSubtasks(task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                />
                <SubtaskTitle
                  value={s.title}
                  onSave={(v) => setSubtasks(task.subtasks.map((x) => (x.id === s.id ? { ...x, title: v } : x)))}
                  label={`Subtarea ${i + 1}`}
                />
                <button
                  type="button"
                  className="icon-btn icon-btn-sm subtle"
                  aria-label={`Eliminar subtarea: ${s.title}`}
                  onClick={() => setSubtasks(task.subtasks.filter((x) => x.id !== s.id))}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
          <div className="add-sub">
            <Plus size={16} aria-hidden="true" />
            <label htmlFor={`${id}-sub`} className="sr-only">
              Nueva subtarea
            </label>
            <input
              id={`${id}-sub`}
              placeholder="Añadir subtarea"
              value={newSub}
              maxLength={500}
              enterKeyHint="done"
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSub();
                }
              }}
            />
            {newSub.trim() && (
              <button type="button" className="btn btn-sm btn-quiet" onClick={addSub}>
                Añadir
              </button>
            )}
          </div>
        </div>

        <div className="detail-group">
          <label className="group-title" htmlFor={`${id}-notes`}>
            Notas
          </label>
          <textarea
            id={`${id}-notes`}
            className="notes"
            placeholder="Escribe ideas, enlaces o detalles…"
            value={notes}
            rows={5}
            maxLength={20000}
            onChange={(e) => {
              setNotes(e.target.value);
              queue({ notes: e.target.value });
            }}
            onBlur={() => void flush()}
          />
        </div>

        <dl className="detail-meta">
          <div>
            <dt>Creada</dt>
            <dd>{formatTimestamp(task.createdAt)}</dd>
          </div>
          <div>
            <dt>Modificada</dt>
            <dd>{formatTimestamp(task.updatedAt)}</dd>
          </div>
          {task.completedAt && (
            <div>
              <dt>Completada</dt>
              <dd>{formatTimestamp(task.completedAt)}</dd>
            </div>
          )}
        </dl>
        <p className="hint detail-hint">Los cambios se guardan automáticamente · ⌘S guarda y cierra</p>
      </div>
    </div>
  );
}

function SubtaskTitle({ value, onSave, label }: { value: string; onSave: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.trim();
    if (!t) setV(value);
    else if (t !== value) onSave(t);
  };
  return (
    <input
      className="subtask-input"
      aria-label={label}
      value={v}
      maxLength={500}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{ '--w': 1 } as CSSProperties}
    />
  );
}
