import { useEffect } from 'react';
import { useUI } from '../state/ui';

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Atajos globales de teclado (teclado externo del iPad). No usan combinaciones reservadas por Safari. */
export function useShortcuts() {
  const { openQuickAdd, navigate, selectTask, quickAdd, route, today } = useUI();

  useEffect(() => {
    let gPending = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        navigate({ name: 'search' });
        return;
      }
      if (mod || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;

      const k = e.key.toLowerCase();
      if (gPending && Date.now() - gPending < 1200) {
        gPending = 0;
        const map: Record<string, Parameters<typeof navigate>[0]> = {
          h: { name: 'today' },
          i: { name: 'inbox' },
          p: { name: 'projects' },
          c: { name: 'calendar' },
          d: { name: 'dashboard' },
          u: { name: 'upcoming' },
        };
        if (map[k]) {
          e.preventDefault();
          navigate(map[k]);
        }
        return;
      }
      if (k === 'g') {
        gPending = Date.now();
        return;
      }
      if (k === 'n' && !quickAdd.open) {
        e.preventDefault();
        const defaults =
          route.name === 'project' && route.id
            ? { projectId: route.id }
            : route.name === 'today'
              ? { todayDate: today }
              : {};
        openQuickAdd(defaults);
      } else if (k === '/') {
        e.preventDefault();
        navigate({ name: 'search' });
      } else if (k === 'escape') {
        selectTask(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickAdd, navigate, selectTask, quickAdd.open, route, today]);
}
