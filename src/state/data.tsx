import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Category, CustomField, Project, Settings, Tag, Task } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { normalizeSettings } from '../domain/validate';

export interface DataState {
  ready: boolean;
  tasks: Task[];
  projects: Project[];
  categories: Category[];
  tags: Tag[];
  settings: Settings;
  /** Campos personalizados (incluye archivados), en orden de visualización. */
  customFields: CustomField[];
  projectById: Map<string, Project>;
  categoryById: Map<string, Category>;
  tagById: Map<string, Tag>;
  tagNames: Map<string, string>;
}

const DataContext = createContext<DataState | null>(null);

/**
 * Suscripciones reactivas a IndexedDB (Dexie liveQuery).
 * Cada tabla se observa por separado: cambiar una tarea no vuelve a consultar proyectos, etc.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const projects = useLiveQuery(() => db.projects.orderBy('order').toArray(), []);
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
  const tags = useLiveQuery(() => db.tags.toArray(), []);
  const settingsRow = useLiveQuery(() => db.settings.get('settings'), []);
  const customFields = useLiveQuery(() => db.customFields.orderBy('order').toArray(), []);

  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const tagById = useMemo(() => new Map((tags ?? []).map((t) => [t.id, t])), [tags]);
  const tagNames = useMemo(() => new Map((tags ?? []).map((t) => [t.id, t.name])), [tags]);
  const sortedTags = useMemo(
    () => [...(tags ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es-MX', { sensitivity: 'base' })),
    [tags],
  );
  const settings = useMemo(
    () => (settingsRow ? normalizeSettings(settingsRow.value) : DEFAULT_SETTINGS),
    [settingsRow],
  );

  const value = useMemo<DataState>(
    () => ({
      ready: tasks !== undefined && projects !== undefined && categories !== undefined && tags !== undefined,
      tasks: tasks ?? [],
      projects: projects ?? [],
      categories: categories ?? [],
      tags: sortedTags,
      settings,
      customFields: customFields ?? [],
      projectById,
      categoryById,
      tagById,
      tagNames,
    }),
    [tasks, projects, categories, sortedTags, tags, settings, customFields, projectById, categoryById, tagById, tagNames],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fuera de DataProvider');
  return ctx;
}
