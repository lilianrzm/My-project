import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArrowUpDown, Check, Filter, X } from 'lucide-react';
import type { SortMode } from '../domain/types';
import { PRIORITY_LABEL } from '../domain/types';
import type { TaskFilter } from '../domain/selectors';
import { EMPTY_FILTER, isFilterActive } from '../domain/selectors';
import { useData } from '../state/data';
import { useFeedback } from '../state/ui';

/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  serif = true,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  serif?: boolean;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className={serif ? 'display' : 'title-sans'} tabIndex={-1} data-page-title>
          {title}
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && (
        <div className="empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Section({ title, count, children, tone, actions }: { title: ReactNode; count?: number; children: ReactNode; tone?: 'danger'; actions?: ReactNode }) {
  const id = useId();
  return (
    <section className={`section${tone ? ` section-${tone}` : ''}`} aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id} className="section-title">
          {title}
          {count !== undefined && <span className="count">{count}</span>}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function ProgressRing({ value, size = 56, label }: { value: number; size?: number; label: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="ring-value"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal basado en <dialog> (foco atrapado, Escape y capa superior nativos) */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  labelledBy,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  labelledBy?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size} ${className}`}
      aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-card">
          {title && (
            <div className="modal-head">
              <h2 id={titleId} className="modal-title">
                {title}
              </h2>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          )}
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog() {
  const { confirmState, resolveConfirm } = useFeedback();
  return (
    <Modal open={!!confirmState} onClose={() => resolveConfirm(false)} title={confirmState?.title} size="sm">
      {confirmState?.message && <p className="confirm-text">{confirmState.message}</p>}
      <div className="row-end">
        <button type="button" className="btn btn-ghost" onClick={() => resolveConfirm(false)}>
          {confirmState?.cancelLabel ?? 'Cancelar'}
        </button>
        <button
          type="button"
          autoFocus
          className={`btn ${confirmState?.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => resolveConfirm(true)}
        >
          {confirmState?.confirmLabel ?? 'Aceptar'}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function Toasts() {
  const { toasts, dismissToast } = useFeedback();
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} message={t.message} tone={t.tone} action={t.action} duration={t.duration} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

function ToastItem({
  id,
  message,
  tone,
  action,
  duration,
  onDismiss,
}: {
  id: number;
  message: string;
  tone?: string;
  action?: { label: string; run: () => void | Promise<void> };
  duration?: number;
  onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const ms = duration ?? (tone === 'error' ? 8000 : action ? 6000 : 3500);
    const t = window.setTimeout(() => onDismiss(id), ms);
    return () => window.clearTimeout(t);
  }, [id, duration, tone, action, onDismiss, paused]);
  return (
    <div
      className={`toast toast-${tone ?? 'default'}`}
      role={tone === 'error' ? 'alert' : 'status'}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast-msg">{message}</span>
      {action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            void action.run();
            onDismiss(id);
          }}
        >
          {action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Cerrar aviso" onClick={() => onDismiss(id)}>
        <X size={14} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Menú emergente sencillo                                              */
/* ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
}

export function Menu({
  label,
  trigger,
  items,
  align = 'end',
  triggerClass = 'icon-btn',
}: {
  label: string;
  trigger: ReactNode;
  items: (MenuItem | 'sep')[];
  align?: 'start' | 'end';
  triggerClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        wrap.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled]), [role="menuitemradio"]')?.focus());
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const onMenuKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not([disabled])') ?? []);
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const next = els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length];
    next?.focus();
  };

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu menu-${align}`} role="menu" id={menuId} aria-label={label} onKeyDown={onMenuKey}>
          {items.map((it, i) =>
            it === 'sep' ? (
              <div key={`sep-${i}`} className="menu-sep" role="separator" />
            ) : (
              <button
                key={it.label}
                type="button"
                role={it.checked !== undefined ? 'menuitemradio' : 'menuitem'}
                aria-checked={it.checked}
                disabled={it.disabled}
                className={`menu-item${it.danger ? ' is-danger' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onSelect();
                }}
              >
                <span className="menu-icon" aria-hidden="true">
                  {it.checked ? <Check size={16} /> : it.icon}
                </span>
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barra de orden y filtros                                             */
/* ------------------------------------------------------------------ */

export const SORT_LABEL: Record<SortMode, string> = {
  manual: 'Orden manual',
  due: 'Fecha de vencimiento',
  priority: 'Prioridad',
  created: 'Más recientes',
  title: 'Título (A–Z)',
};

export function ListToolbar({
  sort,
  onSort,
  filter,
  onFilter,
  allowProjectFilter = false,
  allowManual = true,
  hideSort = false,
}: {
  sort: SortMode;
  onSort: (s: SortMode) => void;
  filter: TaskFilter;
  onFilter: (f: TaskFilter) => void;
  allowProjectFilter?: boolean;
  allowManual?: boolean;
  hideSort?: boolean;
}) {
  const { categories, tags, projects } = useData();
  const [showFilters, setShowFilters] = useState(isFilterActive(filter));
  const active = isFilterActive(filter);
  const sorts = (Object.keys(SORT_LABEL) as SortMode[]).filter((s) => allowManual || s !== 'manual');

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        {!hideSort && <Menu
          label={`Ordenar: ${SORT_LABEL[sort]}`}
          triggerClass="btn btn-quiet btn-sm"
          align="start"
          trigger={
            <>
              <ArrowUpDown size={15} aria-hidden="true" /> {SORT_LABEL[sort]}
            </>
          }
          items={sorts.map((s) => ({ label: SORT_LABEL[s], checked: s === sort, onSelect: () => onSort(s) }))}
        />}
        <button
          type="button"
          className={`btn btn-quiet btn-sm${active ? ' is-active' : ''}`}
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter size={15} aria-hidden="true" /> Filtros{active ? ' · activos' : ''}
        </button>
        {active && (
          <button type="button" className="btn btn-link btn-sm" onClick={() => onFilter(EMPTY_FILTER)}>
            Quitar filtros
          </button>
        )}
      </div>
      {showFilters && (
        <div className="filters">
          <label className="field-inline">
            <span>Prioridad</span>
            <select
              value={String(filter.priority)}
              onChange={(e) => onFilter({ ...filter, priority: e.target.value === 'any' ? 'any' : (Number(e.target.value) as 0 | 1 | 2 | 3) })}
            >
              <option value="any">Todas</option>
              {[3, 2, 1, 0].map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p as 0 | 1 | 2 | 3]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            <span>Categoría</span>
            <select value={filter.categoryId} onChange={(e) => onFilter({ ...filter, categoryId: e.target.value })}>
              <option value="any">Todas</option>
              <option value="none">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {tags.length > 0 && (
            <label className="field-inline">
              <span>Etiqueta</span>
              <select value={filter.tagId} onChange={(e) => onFilter({ ...filter, tagId: e.target.value })}>
                <option value="any">Todas</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {allowProjectFilter && (
            <label className="field-inline">
              <span>Proyecto</span>
              <select value={filter.projectId ?? 'any'} onChange={(e) => onFilter({ ...filter, projectId: e.target.value })}>
                <option value="any">Todos</option>
                <option value="none">Sin proyecto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
