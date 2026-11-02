import { useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  FolderClosed,
  Inbox,
  LayoutGrid,
  Leaf,
  MoreHorizontal,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
} from 'lucide-react';
import { useData } from '../state/data';
import { routeHref, useUI, type Route, type RouteName } from '../state/ui';
import { isForToday, isInbox, isOverdue } from '../domain/selectors';
import { Logo } from './Logo';
import { Modal } from './ui';

interface NavItem {
  name: RouteName;
  label: string;
  icon: ReactNode;
  count?: number;
  alert?: boolean;
}

function useNavItems(): NavItem[] {
  const { tasks } = useData();
  const { today } = useUI();
  const counts = useMemo(() => {
    let inbox = 0;
    let todayCount = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (t.status !== 'open') continue;
      if (isInbox(t)) inbox++;
      if (isForToday(t, today)) todayCount++;
      if (isOverdue(t, today)) overdue++;
    }
    return { inbox, todayCount, overdue };
  }, [tasks, today]);

  return [
    { name: 'dashboard', label: 'Dashboard', icon: <LayoutGrid size={19} /> },
    { name: 'inbox', label: 'Inbox', icon: <Inbox size={19} />, count: counts.inbox },
    { name: 'today', label: 'Hoy', icon: <Sun size={19} />, count: counts.todayCount, alert: counts.overdue > 0 },
    { name: 'upcoming', label: 'Próximamente', icon: <CalendarRange size={19} /> },
    { name: 'projects', label: 'Proyectos', icon: <FolderClosed size={19} /> },
    { name: 'calendar', label: 'Calendario', icon: <CalendarDays size={19} /> },
    { name: 'completed', label: 'Completadas', icon: <CheckCircle2 size={19} /> },
    { name: 'settings', label: 'Configuración', icon: <SettingsIcon size={19} /> },
  ];
}

function isActive(route: Route, name: RouteName) {
  return route.name === name || (name === 'projects' && route.name === 'project');
}

export function Sidebar() {
  const items = useNavItems();
  const { route, openQuickAdd } = useUI();
  const { projects, tasks } = useData();
  const active = projects.filter((p) => p.status === 'active');
  const openByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) if (t.status === 'open' && t.projectId) m.set(t.projectId, (m.get(t.projectId) ?? 0) + 1);
    return m;
  }, [tasks]);

  const main = items.filter((i) => i.name !== 'settings');
  const settings = items.find((i) => i.name === 'settings')!;

  return (
    <nav className="sidebar" aria-label="Navegación principal">
      <a className="brand" href={routeHref({ name: 'dashboard' })} aria-label="The Daily Edit, ir al inicio">
        <Logo size={30} />
        <span className="brand-name">The Daily Edit</span>
      </a>

      <a className={`search-link${route.name === 'search' ? ' is-active' : ''}`} href={routeHref({ name: 'search' })}>
        <Search size={16} aria-hidden="true" />
        <span>Buscar</span>
        <kbd aria-hidden="true">/</kbd>
      </a>

      <ul className="nav-list">
        {main.map((it) => (
          <li key={it.name}>
            <NavLink item={it} active={isActive(route, it.name)} />
          </li>
        ))}
      </ul>

      {active.length > 0 && (
        <div className="nav-projects">
          <p className="nav-heading">Proyectos activos</p>
          <ul className="nav-list">
            {active.slice(0, 12).map((p) => (
              <li key={p.id}>
                <a
                  href={routeHref({ name: 'project', id: p.id })}
                  className={`nav-link nav-link-sub${route.name === 'project' && route.id === p.id ? ' is-active' : ''}`}
                  aria-current={route.name === 'project' && route.id === p.id ? 'page' : undefined}
                >
                  <span className="dot" style={{ background: p.color }} aria-hidden="true" />
                  <span className="nav-label">{p.name}</span>
                  {!!openByProject.get(p.id) && <span className="nav-count">{openByProject.get(p.id)}</span>}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sidebar-foot">
        <a
          href={routeHref({ name: 'review' })}
          className={`nav-link${route.name === 'review' ? ' is-active' : ''}`}
          aria-current={route.name === 'review' ? 'page' : undefined}
        >
          <Leaf size={19} aria-hidden="true" />
          <span className="nav-label">Revisión semanal</span>
        </a>
        <NavLink item={settings} active={isActive(route, 'settings')} />
        <button type="button" className="btn btn-primary btn-block sidebar-add" onClick={() => openQuickAdd()}>
          <Plus size={18} aria-hidden="true" /> Nueva tarea
        </button>
      </div>
    </nav>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <a href={routeHref({ name: item.name })} className={`nav-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
      <span aria-hidden="true">{item.icon}</span>
      <span className="nav-label">{item.label}</span>
      {!!item.count && (
        <span className={`nav-count${item.alert ? ' is-alert' : ''}`}>
          {item.count}
          {item.alert && <span className="sr-only"> (hay vencidas)</span>}
        </span>
      )}
    </a>
  );
}

/** Navegación compacta para pantallas estrechas. */
export function BottomNav() {
  const items = useNavItems();
  const { route } = useUI();
  const [more, setMore] = useState(false);
  const primary: RouteName[] = ['dashboard', 'today', 'inbox', 'projects'];
  const shortLabel: Partial<Record<RouteName, string>> = { dashboard: 'Inicio' };
  const rest = items.filter((i) => !primary.includes(i.name));

  return (
    <>
      <nav className="bottom-nav" aria-label="Navegación principal">
        {primary.map((n) => {
          const it = items.find((i) => i.name === n)!;
          const act = isActive(route, n);
          return (
            <a key={n} href={routeHref({ name: n })} className={`bn-item${act ? ' is-active' : ''}`} aria-current={act ? 'page' : undefined}>
              <span className="bn-icon" aria-hidden="true">
                {it.icon}
                {!!it.count && <span className={`bn-badge${it.alert ? ' is-alert' : ''}`}>{it.count}</span>}
              </span>
              <span>{shortLabel[n] ?? it.label}</span>
            </a>
          );
        })}
        <button type="button" className={`bn-item${rest.some((r) => isActive(route, r.name)) || route.name === 'review' || route.name === 'search' ? ' is-active' : ''}`} onClick={() => setMore(true)} aria-haspopup="dialog">
          <span className="bn-icon" aria-hidden="true">
            <MoreHorizontal size={19} />
          </span>
          <span>Más</span>
        </button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Más secciones" size="sm" className="sheet">
        <ul className="nav-list">
          <li>
            <a className="nav-link" href={routeHref({ name: 'search' })} onClick={() => setMore(false)}>
              <Search size={19} aria-hidden="true" />
              <span className="nav-label">Buscar</span>
            </a>
          </li>
          {rest.map((it) => (
            <li key={it.name}>
              <a className="nav-link" href={routeHref({ name: it.name })} onClick={() => setMore(false)}>
                <span aria-hidden="true">{it.icon}</span>
                <span className="nav-label">{it.label}</span>
              </a>
            </li>
          ))}
          <li>
            <a className="nav-link" href={routeHref({ name: 'review' })} onClick={() => setMore(false)}>
              <Leaf size={19} aria-hidden="true" />
              <span className="nav-label">Revisión semanal</span>
            </a>
          </li>
        </ul>
      </Modal>
    </>
  );
}
