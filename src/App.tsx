import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { useData } from './state/data';
import { useUI } from './state/ui';
import { useShortcuts } from './hooks/useShortcuts';
import { BottomNav, Sidebar } from './components/Navigation';
import { TaskDetailPanel } from './components/TaskDetail';
import { QuickAdd } from './components/QuickAdd';
import { ConfirmDialog, Toasts } from './components/ui';
import { PwaStatus } from './pwa/PwaStatus';
import { Dashboard } from './pages/Dashboard';
import { InboxPage, TodayPage, UpcomingPage } from './pages/Lists';
import { ProjectView, ProjectsPage } from './pages/Projects';
import { CalendarPage } from './pages/Calendar';
import { CompletedPage, SearchPage } from './pages/Completed';
import { ReviewPage } from './pages/Review';
import { SettingsPage } from './pages/Settings';

function Page() {
  const { route } = useUI();
  switch (route.name) {
    case 'inbox':
      return <InboxPage />;
    case 'today':
      return <TodayPage />;
    case 'upcoming':
      return <UpcomingPage />;
    case 'projects':
      return <ProjectsPage />;
    case 'project':
      return <ProjectView key={route.id} id={route.id!} />;
    case 'calendar':
      return <CalendarPage />;
    case 'completed':
      return <CompletedPage />;
    case 'review':
      return <ReviewPage />;
    case 'search':
      return <SearchPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <Dashboard />;
  }
}

const TITLES: Record<string, string> = {
  dashboard: 'Inicio',
  inbox: 'Inbox',
  today: 'Hoy',
  upcoming: 'Próximamente',
  projects: 'Proyectos',
  project: 'Proyecto',
  calendar: 'Calendario',
  completed: 'Completadas',
  review: 'Revisión semanal',
  search: 'Buscar',
  settings: 'Configuración',
};

export function App() {
  const { ready, settings } = useData();
  const { route, openQuickAdd, selectedTaskId, today } = useUI();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  useShortcuts();

  // Al cambiar de sección: volver arriba, actualizar el título y mover el foco al encabezado (lectores de pantalla)
  useEffect(() => {
    document.title = `${TITLES[route.name] ?? ''} · The Daily Edit`;
    mainRef.current?.scrollTo({ top: 0 });
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    requestAnimationFrame(() => mainRef.current?.querySelector<HTMLElement>('[data-page-title]')?.focus({ preventScroll: true }));
  }, [route.name, route.id]);

  const quickDefaults = () => {
    if (route.name === 'project' && route.id) return { projectId: route.id };
    if (route.name === 'today') return { todayDate: today };
    return {};
  };

  return (
    <div className={`app${selectedTaskId ? ' has-detail' : ''}`} data-density={settings.density}>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <Sidebar />
      <main id="main" className="main" ref={mainRef} tabIndex={-1}>
        <PwaStatus />
        {ready ? <Page /> : <div className="loading" aria-busy="true" aria-label="Cargando" />}
      </main>
      <TaskDetailPanel />
      <BottomNav />
      <button type="button" className="fab" aria-label="Nueva tarea (N)" title="Nueva tarea (N)" onClick={() => openQuickAdd(quickDefaults())}>
        <Plus size={26} aria-hidden="true" />
      </button>
      <QuickAdd />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}
