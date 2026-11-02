import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, FolderClosed, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useData } from '../state/data';
import { routeHref, useFeedback, useUI } from '../state/ui';
import type { Project, ProjectStatus } from '../domain/types';
import { PROJECT_STATUS_LABEL, SWATCHES } from '../domain/types';
import { diffDays, formatDayMonthYear } from '../domain/dates';
import { projectProgress } from '../domain/selectors';
import * as repo from '../db/repo';
import { errorMessage } from '../hooks/useTaskActions';
import { useListView } from '../hooks/useListView';
import { TaskList } from '../components/TaskList';
import { EmptyState, ListToolbar, Menu, Modal, PageHeader, ProgressBar, Section } from '../components/ui';

const STATUS_ORDER: ProjectStatus[] = ['active', 'paused', 'completed', 'archived'];

export function ProjectsPage() {
  const { projects, tasks } = useData();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const groups = useMemo(() => {
    return STATUS_ORDER.filter((s) => showArchived || s !== 'archived').map((s) => ({
      status: s,
      items: projects.filter((p) => p.status === s),
    }));
  }, [projects, showArchived]);

  const archivedCount = projects.filter((p) => p.status === 'archived').length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Organización"
        title="Proyectos"
        subtitle="Agrupa tus tareas en metas con principio y fin."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={17} aria-hidden="true" /> Nuevo proyecto
          </button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderClosed size={28} />}
          title="Aún no hay proyectos"
          action={
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={17} aria-hidden="true" /> Crear proyecto
            </button>
          }
        >
          Un proyecto reúne las tareas de algo más grande: una mudanza, un curso, un viaje.
        </EmptyState>
      ) : (
        groups
          .filter((g) => g.items.length)
          .map((g) => (
            <Section key={g.status} title={g.status === 'active' ? 'Activos' : PROJECT_STATUS_LABEL[g.status] + (g.status === 'paused' ? '' : 's')} count={g.items.length}>
              <ul className="project-grid">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <ProjectCard project={p} progress={projectProgress(tasks, p.id)} />
                  </li>
                ))}
              </ul>
            </Section>
          ))
      )}
      {archivedCount > 0 && (
        <button type="button" className="btn btn-link" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Ocultar archivados' : `Mostrar archivados (${archivedCount})`}
        </button>
      )}

      <ProjectForm open={editing !== null} project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ProjectCard({ project, progress }: { project: Project; progress: { done: number; total: number; pct: number } }) {
  const { today } = useUI();
  const daysLeft = project.targetDate ? diffDays(project.targetDate, today) : null;
  return (
    <a className="project-card" href={routeHref({ name: 'project', id: project.id })} style={{ '--p-color': project.color } as React.CSSProperties}>
      <span className="project-card-band" aria-hidden="true" />
      <span className="project-card-name">{project.name}</span>
      {project.description && <span className="project-card-desc">{project.description}</span>}
      <span className="project-card-foot">
        <span className="muted small">
          {progress.done}/{progress.total} tareas
        </span>
        {daysLeft !== null && (
          <span className={`small ${daysLeft < 0 && project.status === 'active' ? 'text-danger' : 'muted'}`}>
            <CalendarDays size={13} aria-hidden="true" /> {formatDayMonthYear(project.targetDate!)}
          </span>
        )}
      </span>
      <ProgressBar value={progress.pct / 100} label={`Avance: ${progress.pct}%`} />
    </a>
  );
}

export function ProjectForm({ open, project, onClose }: { open: boolean; project: Project | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const { navigate } = useUI();
  const id = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(SWATCHES[0].value);
  const [targetDate, setTargetDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
    setColor(project?.color ?? SWATCHES[0].value);
    setTargetDate(project?.targetDate ?? '');
    setStatus(project?.status ?? 'active');
    setError('');
  }, [open, project]);

  const submit = async () => {
    if (!name.trim()) {
      setError('El proyecto necesita un nombre.');
      return;
    }
    try {
      const data = { name: name.trim(), description: description.trim(), color, targetDate: targetDate || null, status };
      if (project) {
        await repo.updateProject(project.id, data);
        toast({ message: 'Proyecto actualizado', tone: 'success' });
      } else {
        const p = await repo.createProject(data);
        toast({ message: 'Proyecto creado', tone: 'success' });
        navigate({ name: 'project', id: p.id });
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={project ? 'Editar proyecto' : 'Nuevo proyecto'}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span className="field-label">Nombre</span>
          <input
            autoFocus
            value={name}
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : undefined}
            placeholder="Ej. Renovar el estudio"
          />
        </label>
        {error && (
          <p className="field-error" id={`${id}-err`} role="alert">
            {error}
          </p>
        )}
        <label className="field">
          <span className="field-label">Descripción</span>
          <textarea value={description} rows={3} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="¿Qué significa terminarlo?" />
        </label>
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Fecha objetivo</span>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Estado</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="field">
          <legend className="field-label">Color</legend>
          <ColorPicker value={color} onChange={setColor} />
        </fieldset>
        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            {project ? 'Guardar' : 'Crear proyecto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Color">
      {SWATCHES.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === s.value.toLowerCase()}
          aria-label={s.label}
          title={s.label}
          className={`swatch${value.toLowerCase() === s.value.toLowerCase() ? ' is-on' : ''}`}
          style={{ background: s.value }}
          onClick={() => onChange(s.value)}
        />
      ))}
    </div>
  );
}

export function ProjectView({ id }: { id: string }) {
  const { projectById, tasks, settings } = useData();
  const { today, openQuickAdd, navigate } = useUI();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDone, setShowDone] = useState(settings.showCompleted);
  const project = projectById.get(id);

  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === id), [tasks, id]);
  const open = useMemo(() => projectTasks.filter((t) => t.status === 'open'), [projectTasks]);
  const done = useMemo(
    () => projectTasks.filter((t) => t.status === 'completed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [projectTasks],
  );
  const view = useListView(open);

  if (!project) {
    return (
      <div className="page">
        <EmptyState title="Proyecto no encontrado" action={<a className="btn btn-quiet" href={routeHref({ name: 'projects' })}>Ver proyectos</a>}>
          Puede que se haya eliminado.
        </EmptyState>
      </div>
    );
  }

  const pr = projectProgress(tasks, id);
  const daysLeft = project.targetDate ? diffDays(project.targetDate, today) : null;

  const doDelete = async (mode: 'keep' | 'delete') => {
    if (mode === 'delete') {
      const ok = await confirm({
        title: '¿Eliminar también sus tareas?',
        message: `Se eliminarán ${projectTasks.length} tarea(s) junto con el proyecto. Podrás deshacerlo durante unos segundos.`,
        confirmLabel: 'Eliminar todo',
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      const res = await repo.deleteProject(id, mode);
      setDeleting(false);
      navigate({ name: 'projects' });
      if (res) {
        toast({
          message: mode === 'keep' ? 'Proyecto eliminado · sus tareas pasaron al Inbox' : 'Proyecto y tareas eliminados',
          action: { label: 'Deshacer', run: () => repo.undoDeleteProject(res) },
          duration: 8000,
        });
      }
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'error' });
    }
  };

  return (
    <div className="page" style={{ '--p-color': project.color } as React.CSSProperties}>
      <a className="back-link" href={routeHref({ name: 'projects' })}>
        <ArrowLeft size={16} aria-hidden="true" /> Proyectos
      </a>
      <PageHeader
        eyebrow={
          <span className="project-eyebrow">
            <span className="dot" style={{ background: project.color }} aria-hidden="true" /> {PROJECT_STATUS_LABEL[project.status]}
            {project.targetDate && (
              <>
                {' · '}
                <span className={daysLeft! < 0 && project.status === 'active' ? 'text-danger' : ''}>
                  Objetivo: {formatDayMonthYear(project.targetDate)}
                  {project.status === 'active' && daysLeft! >= 0 ? ` (${daysLeft === 0 ? 'hoy' : `faltan ${daysLeft} días`})` : ''}
                </span>
              </>
            )}
          </span>
        }
        title={project.name}
        subtitle={project.description || undefined}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => openQuickAdd({ projectId: id })}>
              <Plus size={17} aria-hidden="true" /> Tarea
            </button>
            <Menu
              label="Opciones del proyecto"
              triggerClass="icon-btn icon-btn-bordered"
              trigger={<MoreHorizontal size={20} />}
              items={[
                { label: 'Editar proyecto', icon: <Pencil size={16} />, onSelect: () => setEditing(true) },
                ...STATUS_ORDER.filter((s) => s !== project.status).map((s) => ({
                  label: `Marcar como ${PROJECT_STATUS_LABEL[s].toLowerCase()}`,
                  onSelect: () => void repo.updateProject(id, { status: s }),
                })),
                'sep' as const,
                { label: 'Eliminar proyecto', icon: <Trash2 size={16} />, danger: true, onSelect: () => setDeleting(true) },
              ]}
            />
          </>
        }
      />

      <div className="project-progress">
        <ProgressBar value={pr.pct / 100} label={`Avance del proyecto: ${pr.pct}%`} />
        <span className="muted small">
          {pr.pct}% · {pr.done} de {pr.total} tareas
        </span>
      </div>

      <ListToolbar sort={view.sort} onSort={view.setSort} filter={view.filter} onFilter={view.setFilter} />
      <TaskList
        tasks={view.visible}
        reorderable={view.sort === 'manual'}
        showProject={false}
        label={`Tareas de ${project.name}`}
        empty={
          open.length ? (
            <EmptyState title="Sin resultados">Ninguna tarea coincide con los filtros.</EmptyState>
          ) : (
            <EmptyState
              icon={<FolderClosed size={28} />}
              title={done.length ? 'Todo listo por aquí' : 'Proyecto vacío'}
              action={
                <button type="button" className="btn btn-quiet" onClick={() => openQuickAdd({ projectId: id })}>
                  <Plus size={16} aria-hidden="true" /> Añadir tarea
                </button>
              }
            >
              {done.length ? 'Completaste todas las tareas de este proyecto.' : 'Añade la primera tarea para empezar a avanzar.'}
            </EmptyState>
          )
        }
      />

      {done.length > 0 && (
        <Section
          title="Completadas"
          count={done.length}
          actions={
            <button type="button" className="btn btn-link btn-sm" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
              {showDone ? 'Ocultar' : 'Mostrar'}
            </button>
          }
        >
          {showDone && <TaskList tasks={done} showProject={false} label="Completadas" />}
        </Section>
      )}

      <ProjectForm open={editing} project={project} onClose={() => setEditing(false)} />
      <Modal open={deleting} onClose={() => setDeleting(false)} title="Eliminar proyecto" size="sm">
        <p className="confirm-text">
          ¿Qué quieres hacer con {projectTasks.length === 1 ? 'la tarea' : `las ${projectTasks.length} tareas`} de “{project.name}”?
        </p>
        <div className="stack">
          <button type="button" className="btn btn-primary btn-block" onClick={() => void doDelete('keep')}>
            Conservar tareas (mover al Inbox)
          </button>
          {projectTasks.length > 0 && (
            <button type="button" className="btn btn-danger btn-block" onClick={() => void doDelete('delete')}>
              Eliminar también las tareas
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setDeleting(false)}>
            Cancelar
          </button>
        </div>
      </Modal>
    </div>
  );
}
