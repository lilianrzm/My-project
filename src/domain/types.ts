/**
 * Modelos de datos de The Daily Edit.
 * Fechas de calendario: 'YYYY-MM-DD' (fecha local, sin zona horaria).
 * Marcas de tiempo: ISO 8601 completo (toISOString()).
 */

export type ISODate = string; // 'YYYY-MM-DD'
export type Timestamp = string; // ISO 8601

/** 0 = sin prioridad, 1 = baja, 2 = media, 3 = alta */
export type Priority = 0 | 1 | 2 | 3;

export type TaskStatus = 'open' | 'completed';

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  freq: RecurrenceFreq;
  /** Cada cuántas unidades (1 = cada día/semana/mes/año). */
  interval: number;
  /** Solo semanal: días de la semana (0 = domingo … 6 = sábado). Vacío = mismo día que la fecha base. */
  weekdays?: number[];
  /** Fecha base de la serie; mantiene el día del mes en recurrencias mensuales/anuales (p. ej. día 31). */
  anchor: ISODate;
  /** Fecha opcional en la que termina la serie (inclusive). */
  until?: ISODate | null;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  dueDate: ISODate | null;
  dueTime: string | null; // 'HH:mm'
  priority: Priority;
  categoryId: string | null;
  projectId: string | null;
  tagIds: string[];
  subtasks: Subtask[];
  status: TaskStatus;
  completedAt: Timestamp | null;
  /** Marcada manualmente para atender "Hoy" (fecha en la que se marcó). */
  todayDate: ISODate | null;
  recurrence: Recurrence | null;
  /** Identificador estable de la serie recurrente (todas las ocurrencias lo comparten). */
  seriesId: string | null;
  /** Id de la siguiente ocurrencia generada al completar esta (evita duplicados). */
  nextOccurrenceId: string | null;
  /** Posición para ordenamiento manual. */
  order: number;
}

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  targetDate: ISODate | null;
  status: ProjectStatus;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: Timestamp;
}

export type ActivityType = 'created' | 'completed' | 'reopened' | 'deleted' | 'updated';

/** Historial ligero de actividad (sirve para la revisión semanal). */
export interface Activity {
  id: string;
  taskId: string;
  projectId: string | null;
  type: ActivityType;
  at: Timestamp;
  title: string;
}

export type SortMode = 'manual' | 'due' | 'priority' | 'created' | 'title';

export interface Settings {
  userName: string;
  weekStart: 0 | 1; // 0 domingo, 1 lunes
  timeFormat: '24h' | '12h';
  defaultSort: SortMode;
  showCompleted: boolean;
  density: 'comfortable' | 'compact';
}

export interface SettingRow {
  key: 'settings';
  value: Settings;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  weekStart: 1,
  timeFormat: '12h',
  defaultSort: 'manual',
  showCompleted: false,
  density: 'comfortable',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  0: 'Sin prioridad',
  1: 'Baja',
  2: 'Media',
  3: 'Alta',
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Activo',
  paused: 'En pausa',
  completed: 'Completado',
  archived: 'Archivado',
};

/** Paleta discreta para categorías y proyectos (tonos apagados, coherentes con la marca). */
export const SWATCHES: { value: string; label: string }[] = [
  { value: '#81866A', label: 'Olivo' },
  { value: '#A7B09A', label: 'Salvia' },
  { value: '#D9A9B4', label: 'Rosa empolvado' },
  { value: '#C9B8A3', label: 'Arena' },
  { value: '#9DB0BF', label: 'Niebla azul' },
  { value: '#B7A6C4', label: 'Lavanda' },
  { value: '#D4B483', label: 'Miel' },
  { value: '#A39E93', label: 'Piedra' },
];
