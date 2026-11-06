import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, Plus, X } from 'lucide-react';
import type { Subtask } from '../domain/types';
import { newSubtask, toggleSubtask } from '../db/repo';
import { CheckButton } from './TaskRow';
import { ProgressBar } from './ui';

/**
 * Subtareas de una actividad principal.
 * `onChange` recibe la lista completa; la regla de reapertura la resuelve quien la usa.
 */
export function SubtaskList({ subtasks, onChange }: { subtasks: Subtask[]; onChange: (list: Subtask[]) => void }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; from: number; to: number; h: number; centers: number[] } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const listRefData = useRef(subtasks);
  listRefData.current = subtasks;

  const done = subtasks.filter((s) => s.done).length;

  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...subtasks, newSubtask(t)]);
    setText('');
  };

  const move = (id: string, dir: -1 | 1) => {
    const arr = [...subtasks];
    const i = arr.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-sub="${CSS.escape(id)}"] .subtask-input`)?.focus());
  };

  const startDrag = (id: string, e: ReactPointerEvent) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-sub]') ?? []);
    const from = rows.findIndex((r) => r.dataset.sub === id);
    if (from < 0) return;
    e.preventDefault();
    const rects = rows.map((r) => r.getBoundingClientRect());
    setDrag({ id, startY: e.clientY, dy: 0, from, to: from, h: rects[from].height, centers: rects.map((r) => r.top + r.height / 2) });
  };

  useEffect(() => {
    if (!drag) return;
    const mv = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const dy = e.clientY - d.startY;
      const c = d.centers[d.from] + dy;
      let to = 0;
      d.centers.forEach((x, i) => {
        if (i !== d.from && x < c) to++;
      });
      setDrag({ ...d, dy, to });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || d.from === d.to) return;
      const arr = [...listRefData.current];
      const [m] = arr.splice(d.from, 1);
      arr.splice(d.to, 0, m);
      onChange(arr);
    };
    window.addEventListener('pointermove', mv, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag === null]);

  const offset = (i: number) => {
    if (!drag) return undefined;
    if (i === drag.from) return `translateY(${drag.dy}px)`;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return `translateY(${-drag.h}px)`;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return `translateY(${drag.h}px)`;
    return undefined;
  };

  return (
    <div className="subtask-block">
      {subtasks.length > 0 && (
        <div className="subtask-progress">
          <ProgressBar value={done / subtasks.length} label={`Progreso de subtareas: ${done} de ${subtasks.length}`} />
          <span className="small muted">
            {done}/{subtasks.length}
          </span>
        </div>
      )}
      <ul className={`subtasks${drag ? ' is-reordering' : ''}`} ref={listRef}>
        {subtasks.map((s, i) => (
          <li
            key={s.id}
            data-sub={s.id}
            className={`subtask${s.done ? ' is-done' : ''}${drag?.id === s.id ? ' is-dragging' : ''}`}
            style={offset(i) ? { transform: offset(i) } : undefined}
          >
            {subtasks.length > 1 && (
              <span className="drag-handle" aria-hidden="true" title="Arrastra para reordenar (o Alt + ↑/↓)" onPointerDown={(e) => startDrag(s.id, e)}>
                <GripVertical size={15} />
              </span>
            )}
            <CheckButton
              size="sm"
              checked={s.done}
              label={s.done ? `Reabrir subtarea: ${s.title}` : `Completar subtarea: ${s.title}`}
              onToggle={() => onChange(toggleSubtask(subtasks, s.id))}
            />
            <SubtaskTitle
              value={s.title}
              label={`Subtarea ${i + 1} de ${subtasks.length}`}
              onSave={(v) => onChange(subtasks.map((x) => (x.id === s.id ? { ...x, title: v } : x)))}
              onMove={(dir) => move(s.id, dir)}
            />
            <button type="button" className="icon-btn icon-btn-sm subtle" aria-label={`Eliminar subtarea: ${s.title}`} onClick={() => onChange(subtasks.filter((x) => x.id !== s.id))}>
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="add-sub">
        <Plus size={16} aria-hidden="true" />
        <input
          aria-label="Nueva subtarea"
          placeholder="Añadir subtarea"
          value={text}
          maxLength={500}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        {text.trim() && (
          <button type="button" className="btn btn-sm btn-quiet" onClick={add}>
            Añadir
          </button>
        )}
      </div>
    </div>
  );
}

function SubtaskTitle({ value, onSave, label, onMove }: { value: string; onSave: (v: string) => void; label: string; onMove: (dir: -1 | 1) => void }) {
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
        } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          commit();
          onMove(e.key === 'ArrowUp' ? -1 : 1);
        }
      }}
    />
  );
}
