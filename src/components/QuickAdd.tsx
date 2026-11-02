import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, Flag, FolderClosed, Sun, Tag as TagIcon } from 'lucide-react';
import type { Priority } from '../domain/types';
import { PRIORITY_LABEL } from '../domain/types';
import { addDays, formatRelative } from '../domain/dates';
import { useData } from '../state/data';
import { useUI } from '../state/ui';
import { useTaskActions } from '../hooks/useTaskActions';
import { Modal } from './ui';

/** Captura rápida: escribe el título y pulsa Enter. Todo lo demás es opcional. */
export function QuickAdd() {
  const { quickAdd, closeQuickAdd, today } = useUI();
  const { projects, categories } = useData();
  const actions = useTaskActions();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [todayFlag, setTodayFlag] = useState(false);
  const [priority, setPriority] = useState<Priority>(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!quickAdd.open) return;
    const d = quickAdd.defaults;
    setTitle('');
    setDueDate(d.dueDate ?? null);
    setTodayFlag(!!d.todayDate);
    setPriority(d.priority ?? 0);
    setProjectId(d.projectId ?? null);
    setCategoryId(d.categoryId ?? null);
    setMore(false);
    setError('');
    // iPadOS solo muestra el teclado si el foco ocurre dentro del gesto del usuario; autoFocus lo resuelve.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [quickAdd.open, quickAdd.defaults]);

  const submit = async (keepOpen = false) => {
    const t = title.trim();
    if (!t) {
      setError('Escribe un título para la tarea.');
      inputRef.current?.focus();
      return;
    }
    if (busy) return;
    setBusy(true);
    const created = await actions.create({
      title: t,
      dueDate,
      todayDate: todayFlag && !dueDate ? today : null,
      priority,
      projectId,
      categoryId,
    });
    setBusy(false);
    if (!created) return;
    if (keepOpen) {
      setTitle('');
      inputRef.current?.focus();
    } else {
      closeQuickAdd();
    }
  };

  const dateLabel = dueDate ? formatRelative(dueDate, today) : todayFlag ? 'Hoy' : null;

  return (
    <Modal open={quickAdd.open} onClose={closeQuickAdd} size="md" labelledBy={`${id}-h`} className="quick-add">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <h2 id={`${id}-h`} className="sr-only">
          Nueva tarea
        </h2>
        <label htmlFor={`${id}-title`} className="sr-only">
          Título de la tarea
        </label>
        <input
          id={`${id}-title`}
          ref={inputRef}
          className="qa-input"
          placeholder="¿Qué quieres recordar?"
          autoComplete="off"
          autoFocus
          enterKeyHint="done"
          maxLength={500}
          value={title}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit(true);
            }
          }}
        />
        {error && (
          <p id={`${id}-err`} className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="qa-chips" role="group" aria-label="Opciones rápidas">
          <button
            type="button"
            className={`toggle-chip${todayFlag || dueDate === today ? ' is-on' : ''}`}
            aria-pressed={todayFlag || dueDate === today}
            onClick={() => {
              if (todayFlag || dueDate === today) {
                setTodayFlag(false);
                if (dueDate === today) setDueDate(null);
              } else {
                setTodayFlag(true);
                setDueDate(null);
              }
            }}
          >
            <Sun size={15} aria-hidden="true" /> Hoy
          </button>
          <button
            type="button"
            className={`toggle-chip${dueDate === addDays(today, 1) ? ' is-on' : ''}`}
            aria-pressed={dueDate === addDays(today, 1)}
            onClick={() => {
              setTodayFlag(false);
              setDueDate(dueDate === addDays(today, 1) ? null : addDays(today, 1));
            }}
          >
            <CalendarDays size={15} aria-hidden="true" /> Mañana
          </button>
          <button type="button" className={`toggle-chip${more ? ' is-on' : ''}`} aria-expanded={more} onClick={() => setMore((m) => !m)}>
            Más opciones
          </button>
          {dateLabel && !more && <span className="qa-summary">{dateLabel}</span>}
        </div>

        {more && (
          <div className="qa-more">
            <label className="qa-field">
              <CalendarDays size={16} aria-hidden="true" />
              <span className="sr-only">Fecha</span>
              <input
                type="date"
                value={dueDate ?? ''}
                aria-label="Fecha de vencimiento"
                onChange={(e) => {
                  setDueDate(e.target.value || null);
                  if (e.target.value) setTodayFlag(false);
                }}
              />
            </label>
            <label className="qa-field">
              <Flag size={16} aria-hidden="true" />
              <select aria-label="Prioridad" value={priority} onChange={(e) => setPriority(Number(e.target.value) as Priority)}>
                {[0, 1, 2, 3].map((p) => (
                  <option key={p} value={p}>
                    {p === 0 ? 'Sin prioridad' : `Prioridad ${PRIORITY_LABEL[p as Priority].toLowerCase()}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="qa-field">
              <FolderClosed size={16} aria-hidden="true" />
              <select aria-label="Proyecto" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)}>
                <option value="">Sin proyecto</option>
                {projects
                  .filter((p) => p.status === 'active' || p.status === 'paused' || p.id === projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="qa-field">
              <TagIcon size={16} aria-hidden="true" />
              <select aria-label="Categoría" value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="qa-foot">
          <p className="hint qa-hint">Enter guarda · ⌘Enter guarda y sigue</p>
          <div className="row-end">
            <button type="button" className="btn btn-ghost" onClick={closeQuickAdd}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Añadir tarea
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
