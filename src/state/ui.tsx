import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TaskDraft } from '../db/repo';
import { todayISO } from '../domain/dates';

/* ------------------------------------------------------------------ */
/* Rutas (hash: funciona en cualquier hosting estático y sin conexión)  */
/* ------------------------------------------------------------------ */

export type RouteName =
  | 'dashboard'
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'projects'
  | 'project'
  | 'calendar'
  | 'completed'
  | 'analysis'
  | 'review'
  | 'search'
  | 'settings';

export interface Route {
  name: RouteName;
  id?: string;
}

const ROUTES: RouteName[] = ['dashboard', 'inbox', 'today', 'upcoming', 'projects', 'project', 'calendar', 'completed', 'analysis', 'review', 'search', 'settings'];

export function parseHash(hash: string): Route {
  const [, name, id] = hash.replace(/^#/, '').split('/');
  if (ROUTES.includes(name as RouteName)) {
    if (name === 'project') return id ? { name: 'project', id: decodeURIComponent(id) } : { name: 'projects' };
    return { name: name as RouteName };
  }
  return { name: 'dashboard' };
}

export function routeHref(r: Route): string {
  return r.id ? `#/${r.name}/${encodeURIComponent(r.id)}` : `#/${r.name}`;
}

/* ------------------------------------------------------------------ */

interface UIState {
  route: Route;
  navigate: (r: Route) => void;
  selectedTaskId: string | null;
  selectTask: (id: string | null) => void;
  quickAdd: { open: boolean; defaults: Partial<TaskDraft> };
  openQuickAdd: (defaults?: Partial<TaskDraft>) => void;
  closeQuickAdd: () => void;
  today: string;
  detailExpanded: boolean;
  setDetailExpanded: (v: boolean) => void;
  /** Actividad cuyo registro de cierre está abierto. */
  closureTaskId: string | null;
  openClosure: (id: string | null) => void;
}

const UIContext = createContext<UIState | null>(null);

/** Fecha de hoy que se actualiza a medianoche y al volver a la app. */
function useLiveToday(): string {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const check = () => setToday((prev) => (prev === todayISO() ? prev : todayISO()));
    const id = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return today;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; defaults: Partial<TaskDraft> }>({ open: false, defaults: {} });
  const today = useLiveToday();
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [closureTaskId, openClosure] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((r: Route) => {
    const href = routeHref(r);
    if (window.location.hash !== href) window.location.hash = href;
    else setRoute(r);
  }, []);

  const openQuickAdd = useCallback((defaults: Partial<TaskDraft> = {}) => setQuickAdd({ open: true, defaults }), []);
  const closeQuickAdd = useCallback(() => setQuickAdd((q) => ({ ...q, open: false })), []);

  const value = useMemo<UIState>(
    () => ({
      route,
      navigate,
      selectedTaskId,
      selectTask: setSelectedTaskId,
      quickAdd,
      openQuickAdd,
      closeQuickAdd,
      today,
      detailExpanded,
      setDetailExpanded,
      closureTaskId,
      openClosure,
    }),
    [route, navigate, selectedTaskId, quickAdd, openQuickAdd, closeQuickAdd, today, detailExpanded, closureTaskId],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIState {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI fuera de UIProvider');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Avisos (toasts) y confirmaciones                                     */
/* ------------------------------------------------------------------ */

export interface Toast {
  id: number;
  message: string;
  tone?: 'default' | 'error' | 'success';
  action?: { label: string; run: () => void | Promise<void> };
  duration?: number;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

interface FeedbackState {
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  confirmState: ConfirmOptions | null;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (v: boolean) => void;
}

const FeedbackContext = createContext<FeedbackState | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const seq = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
  }, []);
  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false);
    setConfirmState(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const resolveConfirm = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setConfirmState(null);
  }, []);

  const value = useMemo(
    () => ({ toasts, toast, dismissToast, confirmState, confirm, resolveConfirm }),
    [toasts, toast, dismissToast, confirmState, confirm, resolveConfirm],
  );
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback(): FeedbackState {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback fuera de FeedbackProvider');
  return ctx;
}
