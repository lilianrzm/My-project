import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Task } from '../domain/types';
import { useData } from '../state/data';
import { useUI } from '../state/ui';
import { useTaskActions } from '../hooks/useTaskActions';
import { TaskRow } from './TaskRow';

interface Props {
  tasks: Task[];
  reorderable?: boolean;
  showProject?: boolean;
  showDate?: boolean;
  empty?: ReactNode;
  label?: string;
}

interface DragState {
  id: string;
  startY: number;
  dy: number;
  from: number;
  to: number;
  height: number;
  centers: number[];
}

export function TaskList({ tasks, reorderable = false, showProject = true, showDate = true, empty, label }: Props) {
  const { projectById, categoryById, tagNames, settings } = useData();
  const { today, selectedTaskId, selectTask } = useUI();
  const actions = useTaskActions();
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const ids = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const onToggle = useCallback((t: Task) => void actions.toggle(t), [actions]);
  const onOpen = useCallback((id: string) => selectTask(id), [selectTask]);

  const onMove = useCallback(
    (id: string, dir: -1 | 1) => {
      const arr = [...idsRef.current];
      const i = arr.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      void actions.reorder(arr).then(() => {
        requestAnimationFrame(() => {
          listRef.current?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"] .task-main`)?.focus();
        });
      });
    },
    [actions],
  );

  const onDragStart = useCallback((id: string, e: ReactPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-task-id]') ?? []);
    const from = rows.findIndex((r) => r.dataset.taskId === id);
    if (from < 0) return;
    e.preventDefault();
    const rects = rows.map((r) => r.getBoundingClientRect());
    setDrag({
      id,
      startY: e.clientY,
      dy: 0,
      from,
      to: from,
      height: rects[from].height,
      centers: rects.map((r) => r.top + r.height / 2),
    });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const dy = e.clientY - d.startY;
      const center = d.centers[d.from] + dy;
      let to = 0;
      d.centers.forEach((c, i) => {
        if (i !== d.from && c < center) to++;
      });
      setDrag({ ...d, dy, to });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || d.from === d.to) return;
      const arr = [...idsRef.current];
      const [moved] = arr.splice(d.from, 1);
      arr.splice(d.to, 0, moved);
      void actions.reorder(arr);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // Solo al iniciar/terminar el arrastre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag === null, actions]);

  if (!tasks.length) return <>{empty ?? null}</>;

  const offsetFor = (i: number): string | undefined => {
    if (!drag) return undefined;
    if (i === drag.from) return `translateY(${drag.dy}px)`;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return `translateY(${-drag.height}px)`;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return `translateY(${drag.height}px)`;
    return undefined;
  };

  return (
    <div className={`task-list${drag ? ' is-reordering' : ''}`} ref={listRef} role="list" aria-label={label}>
      {tasks.map((t, i) => {
        const transform = offsetFor(i);
        return (
          <div role="listitem" key={t.id}>
            <TaskRow
              task={t}
              today={today}
              selected={selectedTaskId === t.id}
              project={t.projectId ? projectById.get(t.projectId) : undefined}
              category={t.categoryId ? categoryById.get(t.categoryId) : undefined}
              tagNames={t.tagIds.map((id) => tagNames.get(id)).filter((n): n is string => !!n)}
              settings={settings}
              showProject={showProject}
              showDate={showDate}
              draggable={reorderable && t.status === 'open'}
              isDragging={drag?.id === t.id}
              dragStyle={transform ? { transform } : undefined}
              onToggle={onToggle}
              onOpen={onOpen}
              onDragStart={reorderable ? onDragStart : undefined}
              onMove={reorderable ? onMove : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
