import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Ban, CalendarClock, CalendarPlus, ChevronDown, Copy, Maximize2, Minimize2, MoreHorizontal, RotateCcw, Sun, Trash2, X } from 'lucide-react';
import type { Priority, Recurrence, Subtask, Task } from '../domain/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../domain/types';
import { formatTimestamp } from '../domain/dates';
import * as repo from '../db/repo';
import { db } from '../db/db';
import { useData } from '../state/data';
import { useFeedback, useUI } from '../state/ui';
import { errorMessage, useTaskActions } from '../hooks/useTaskActions';
import { CheckButton } from './TaskRow';
import { Menu } from './ui';
import { RecurrenceEditor } from './RecurrenceEditor';
import { SubtaskList } from './SubtaskList';
import { Attachments } from './Attachments';
import { CustomFieldsEditor, applicableFields } from './CustomFieldsEditor';
import { ClosureSummary, HistoryList } from './Closure';

/** Panel de detalles: lateral (consulta rápida) o expandido (más espacio para leer y editar). */
export function TaskDetailPanel() {
  const { selectedTaskId, selectTask, detailExpanded, setDetailExpanded } = useUI();
  const { tasks } = useData();
  const task = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : undefined;

  useEffect(() => {
    if (selectedTaskId && !task) {
      const t = window.setTimeout(() => selectTask(null), 0);
      return () => window.clearTimeout(t);
    }
  }, [selectedTaskId, task, selectTask]);

  const open = !!task;
  const expanded = open && detailExpanded;
  return (
    <>
      <div className={`detail-scrim${open ? ' is-open' : ''}${expanded ? ' is-expanded' : ''}`} onClick={() => selectTask(null)} aria-hidden="true" />
      <aside
        className={`detail${open ? ' is-open' : ''}${expanded ? ' is-expanded' : ''}`}
        aria-label={expanded ? 'Detalles de la actividad (vista expandida)' : 'Detalles de la actividad'}
        aria-hidden={!open}
        inert={!open}
      >
        {task && <TaskDetail key={task.id} task={task} expanded={expanded} onToggleExpand={() => setDetailExpanded(!detailExpanded)} onClose={() => selectTask(null)} />}
      </aside>
    </>
  );
}

const PRIORITIES: Priority[] = [0, 1, 2, 3];
const SECTION_KEY = 'tde-detail-sections';

function readSections(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SECTION_KEY) || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Sección plegable; recuerda si estaba abierta (preferencia local de este dispositivo). */
function Panel({ id, title, badge, defaultOpen = true, children }: { id: string; title: string; badge?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => readSections()[id] ?? defaultOpen);
  return (
    <details
      className="panel"
      data-panel={id}
      open={open}
      onToggle={(e) => {
        const v = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(v);
        try {
          localStorage.setItem(SECTION_KEY, JSON.stringify({ ...readSections(), [id]: v }));
        } catch {
          /* opcional */
        }
      }}
    >
      <summary className="panel-summary">
        <span className="group-title">
          {title}
          {badge}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="panel-chevron" />
      </summary>
      <div className="panel-body">{children}</div>
    </details>
  );
}

function TaskDetail({ task, expanded, onToggleExpand, onClose }: { task: Task; expanded: boolean; onToggleExpand: () => void; onClose: () => void }) {
  const { projects, categories, tags, tagById, settings, customFields } = useData();
  const { today } = useUI();
  const { toast, confirm } = useFeedback();
  const actions = useTaskActions();
  const id = useId();
  const attachmentCount = useLiveQuery(() => db.attachments.where('taskId').equals(task.id).count(), [task.id]) ?? 0;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [notes, setNotes] = useState(task.notes);
  const [responsible, setResponsible] = useState(task.responsible);
  const [folio, setFolio] = useState(task.folio);
  useEffect(() => setResponsible(task.responsible), [task.responsible]);
  useEffect(() => setFolio(task.folio), [task.folio]);
  const pending = useRef<Partial<Task>>({});
  const timer = useRef<number | undefined>(undefined);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
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

  useEffect(() => () => void flush(), [flush]);

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

  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [title, expanded]);

  const done = task.status === 'completed';
  const cancelled = task.status === 'cancelled';
  const pendingSubs = repo.pendingSubtasks(task);

  const onDueChange = (d: string) => {
    const dueDate = d || null;
    const patch: Partial<Task> = { dueDate, dueTime: dueDate ? task.dueTime : null };
    if (task.recurrence) patch.recurrence = dueDate ? { ...task.recurrence, anchor: dueDate } : null;
    save(patch);
  };

  const onRecurrence = (rec: Recurrence | null, due?: string) => {
    const patch: Partial<Task> = { recurrence: rec };
    if (due) patch.dueDate = due;
    save(patch);
  };

  /** Regla: añadir o reabrir una subtarea en una actividad completada pide confirmar su reapertura. */
  const setSubtasks = async (subtasks: Subtask[]) => {
    await flush();
    if (done && subtasks.some((s) => !s.done)) {
      const ok = await confirm({
        title: '¿Reabrir la actividad?',
        message: 'La actividad está completada. Para añadir o reabrir una subtarea pendiente, la actividad principal volverá a quedar pendiente.',
        confirmLabel: 'Reabrir actividad',
      });
      if (!ok) return;
      try {
        await repo.updateTask(task.id, { subtasks }, { allowReopen: true });
      } catch (e) {
        toast({ message: errorMessage(e), tone: 'error' });
      }
      return;
    }
    await actions.update(task.id, { subtasks });
  };

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
    if (attachmentCount) {
      const ok = await confirm({
        title: 'Eliminar actividad',
        message: `También se eliminarán ${attachmentCount} documento(s) adjunto(s). Podrás deshacerlo durante unos segundos.`,
        confirmLabel: 'Eliminar',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await actions.remove([task]);
  };

  const fieldsHere = applicableFields(customFields, task);

  const header = (
    <div className="detail-top">
      <button type="button" className="icon-btn" aria-label="Cerrar detalles (Esc)" title="Cerrar (Esc)" onClick={() => void flush().then(onClose)}>
        <X size={20} />
      </button>
      <button
        type="button"
        className="icon-btn detail-expand"
        aria-pressed={expanded}
        aria-label={expanded ? 'Volver al panel lateral' : 'Expandir panel'}
        title={expanded ? 'Volver al panel lateral' : 'Expandir panel'}
        onClick={onToggleExpand}
      >
        {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
      <span className="detail-saved" aria-live="polite">
        {savedAt ? 'Guardado' : ''}
      </span>
      <div className="detail-top-actions">
        {cancelled ? (
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => void actions.toggle(task)}>
            <RotateCcw size={15} aria-hidden="true" /> Reactivar
          </button>
        ) : (
          <button
            type="button"
            className={`btn btn-sm ${done ? 'btn-quiet' : 'btn-primary'}${!done && pendingSubs ? ' is-blocked' : ''}`}
            aria-describedby={!done && pendingSubs ? `${id}-blocked` : undefined}
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
        )}
        <Menu
          label="Más acciones"
          trigger={<MoreHorizontal size={20} />}
          items={[
            { label: 'Duplicar', icon: <Copy size={16} />, onSelect: () => void actions.duplicate(task) },
            { label: 'Posponer a mañana', icon: <CalendarClock size={16} />, onSelect: () => void actions.postpone(task, 'tomorrow', settings.weekStart), disabled: task.status !== 'open' },
            { label: 'Posponer un día', icon: <CalendarPlus size={16} />, onSelect: () => void actions.postpone(task, 'plus1', settings.weekStart), disabled: task.status !== 'open' },
            { label: 'Posponer a la próxima semana', icon: <CalendarClock size={16} />, onSelect: () => void actions.postpone(task, 'nextWeek', settings.weekStart), disabled: task.status !== 'open' },
            'sep',
            { label: 'Cancelar actividad', icon: <Ban size={16} />, onSelect: () => void actions.cancel(task), disabled: cancelled },
            { label: 'Eliminar actividad', icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove() },
          ]}
        />
      </div>
    </div>
  );

  const titleBlock = (
    <>
      <div className="detail-title-row">
        <CheckButton checked={done} label={done ? 'Reabrir actividad' : 'Completar actividad'} onToggle={() => void flush().then(() => actions.toggle(task))} />
        <label htmlFor={`${id}-title`} className="sr-only">
          Título
        </label>
        <textarea
          id={`${id}-title`}
          ref={titleRef}
          className={`detail-title${done || cancelled ? ' is-done' : ''}`}
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
      <div className="detail-status">
        <span className={`status-pill status-${task.status}`}>{STATUS_LABEL[task.status]}</span>
        {!done && !cancelled && pendingSubs > 0 && (
          <span id={`${id}-blocked`} className="small muted">
            {pendingSubs === 1 ? '1 subtarea pendiente para poder completarla' : `${pendingSubs} subtareas pendientes para poder completarla`}
          </span>
        )}
      </div>
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
    </>
  );

  const planning = (
    <Panel id="plan" title="Planificación">
      <button type="button" className={`toggle-chip${task.todayDate ? ' is-on' : ''}`} aria-pressed={!!task.todayDate} onClick={() => void actions.toggleToday(task)}>
        <Sun size={15} aria-hidden="true" /> {task.todayDate ? 'Marcada para hoy' : 'Atender hoy'}
      </button>
      <div className="field-row">
        <label className="field-label" htmlFor={`${id}-start`}>
          Inicio
        </label>
        <div className="inline-gap">
          <input id={`${id}-start`} type="date" value={task.startDate ?? ''} onChange={(e) => save({ startDate: e.target.value || null })} />
          {task.startDate && (
            <button type="button" className="icon-btn icon-btn-sm" aria-label="Quitar fecha de inicio" onClick={() => save({ startDate: null })}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="field-row">
        <label className="field-label" htmlFor={`${id}-due`}>
          Vencimiento
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
            <button key={p} type="button" role="radio" aria-checked={task.priority === p} className={`seg${task.priority === p ? ' is-on' : ''}`} onClick={() => void actions.setPriority(task, p)}>
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
      <div className="field-row">
        <label className="field-label" htmlFor={`${id}-resp`}>
          Responsable
        </label>
        <input
          id={`${id}-resp`}
          value={responsible}
          maxLength={120}
          placeholder="Opcional"
          list={`${id}-resp-list`}
          onChange={(e) => setResponsible(e.target.value)}
          onBlur={() => responsible.trim() !== task.responsible && save({ responsible: responsible.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <ResponsibleList id={`${id}-resp-list`} />
      </div>
      <div className="field-row">
        <label className="field-label" htmlFor={`${id}-folio`}>
          Folio
        </label>
        <input
          id={`${id}-folio`}
          value={folio}
          maxLength={120}
          placeholder="Folio o referencia (opcional)"
          onChange={(e) => setFolio(e.target.value)}
          onBlur={() => folio.trim() !== task.folio && save({ folio: folio.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
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
    </Panel>
  );

  const subtasks = (
    <Panel
      id="subtasks"
      title="Subtareas"
      badge={
        task.subtasks.length > 0 && (
          <span className="count">
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
          </span>
        )
      }
    >
      <SubtaskList subtasks={task.subtasks} onChange={(list) => void setSubtasks(list)} />
    </Panel>
  );

  const custom = fieldsHere.length > 0 && (
    <Panel id="custom" title="Campos personalizados">
      <CustomFieldsEditor fields={customFields} task={task} onChange={(customValues) => save({ customValues })} />
    </Panel>
  );

  const docs = (
    <Panel id="docs" title="Documentos" badge={attachmentCount > 0 && <span className="count">{attachmentCount}</span>}>
      <Attachments taskId={task.id} title={task.title} />
    </Panel>
  );

  const closure = (
    <Panel id="closure" title="Seguimiento y cierre" defaultOpen={done}>
      <ClosureSummary task={task} />
    </Panel>
  );

  const recurrence = (
    <Panel id="repeat" title="Repetición" badge={task.recurrence && <span className="count">activa</span>} defaultOpen={false}>
      <RecurrenceEditor value={task.recurrence} dueDate={task.dueDate} today={today} weekStart={settings.weekStart} onChange={onRecurrence} />
    </Panel>
  );

  const notesBlock = (
    <Panel id="notes" title="Notas">
      <label className="sr-only" htmlFor={`${id}-notes`}>
        Notas
      </label>
      <textarea
        id={`${id}-notes`}
        className="notes"
        placeholder="Escribe ideas, enlaces o detalles…"
        value={notes}
        rows={expanded ? 8 : 5}
        maxLength={20000}
        onChange={(e) => {
          setNotes(e.target.value);
          queue({ notes: e.target.value });
        }}
        onBlur={() => void flush()}
      />
    </Panel>
  );

  const history = (
    <Panel id="history" title="Historial" defaultOpen={false}>
      <HistoryList taskId={task.id} />
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
    </Panel>
  );

  return (
    <div className="detail-inner">
      {header}
      <div className="detail-scroll">
        {expanded ? (
          <div className="detail-columns">
            <div className="detail-col">
              {titleBlock}
              {subtasks}
              {planning}
              {notesBlock}
            </div>
            <div className="detail-col">
              {docs}
              {closure}
              {custom}
              {recurrence}
              {history}
            </div>
          </div>
        ) : (
          <>
            {titleBlock}
            {planning}
            {subtasks}
            {custom}
            {docs}
            {closure}
            {recurrence}
            {notesBlock}
            {history}
          </>
        )}
        <p className="hint detail-hint">Los cambios se guardan automáticamente · ⌘S guarda y cierra</p>
      </div>
    </div>
  );
}

/** Sugerencias de responsables ya usados. */
function ResponsibleList({ id }: { id: string }) {
  const { tasks } = useData();
  const names = [...new Set(tasks.map((t) => t.responsible).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-MX'));
  return (
    <datalist id={id}>
      {names.slice(0, 100).map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
}
