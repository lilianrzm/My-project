/**
 * Modelos de datos de The Daily Edit.
 * Fechas de calendario: 'YYYY-MM-DD' (fecha local, sin zona horaria).
 * Marcas de tiempo: ISO 8601 completo (toISOString()).
 */

export type ISODate = string; // 'YYYY-MM-DD'
export type Timestamp = string; // ISO 8601

/** 0 = sin prioridad, 1 = baja, 2 = media, 3 = alta */
export type Priority = 0 | 1 | 2 | 3;

/** open = pendiente, completed = concluida (administrativamente), cancelled = cancelada (no cuenta como concluida). */
export type TaskStatus = 'open' | 'completed' | 'cancelled';

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
  createdAt: Timestamp | null;
  completedAt: Timestamp | null;
}

/** Registro de cierre (opcional) de una actividad principal. */
export interface Closure {
  resultId: string | null;
  attentionTypeId: string | null;
  /** Fecha efectiva de atención: puede diferir de la fecha en que se marcó completada. */
  effectiveDate: ISODate | null;
  responsible: string;
  observations: string;
  folio: string;
  /** Documentos adjuntos de la actividad que sirven como evidencia. */
  evidenceIds: string[];
  recordedAt: Timestamp;
  updatedAt: Timestamp;
}

export type CustomFieldType = 'text' | 'longtext' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'currency';
export type CustomValue = string | number | boolean | string[];

export interface Option {
  id: string;
  label: string;
  archived?: boolean;
}

export type FieldScope = { kind: 'all' } | { kind: 'category'; id: string } | { kind: 'project'; id: string };

export interface CustomField {
  id: string;
  name: string;
  type: CustomFieldType;
  description: string;
  options: Option[];
  scope: FieldScope;
  archived: boolean;
  order: number;
  currency: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ExtractStatus = 'pending' | 'ok' | 'no-text' | 'needs-ocr' | 'unsupported' | 'error';

/** Metadatos de un documento adjunto. El contenido binario vive en la tabla `files`. */
export interface Attachment {
  id: string;
  taskId: string;
  name: string;
  mime: string;
  size: number;
  addedAt: Timestamp;
  description: string;
  descriptionSource: 'auto' | 'manual' | 'none';
  extractStatus: ExtractStatus;
}

export interface FileBlob {
  id: string;
  blob: Blob;
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
  cancelledAt: Timestamp | null;
  /** Fecha de inicio (opcional). */
  startDate: ISODate | null;
  responsible: string;
  /** Folio o referencia opcional. */
  folio: string;
  closure: Closure | null;
  /** Valores de campos personalizados: id del campo → valor. */
  customValues: Record<string, CustomValue>;
  /** Meta a la que contribuye esta tarea (opcional). */
  goalId: string | null;
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
  /** Emoji que identifica el área de vida. */
  emoji: string;
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

/* ------------------------------------------------------------------ */
/* Logro personal: metas, hábitos y diario                              */
/* ------------------------------------------------------------------ */

/** count = número con unidad (12 libros, $20,000); tasks = tareas vinculadas; check = se logra o no. */
export type GoalKind = 'count' | 'tasks' | 'check';
export type GoalStatus = 'active' | 'achieved' | 'archived';

export interface Goal {
  id: string;
  title: string;
  emoji: string;
  color: string;
  categoryId: string | null;
  kind: GoalKind;
  target: number;
  current: number;
  unit: string;
  dueDate: ISODate | null;
  /** ¿Por qué es importante para mí? */
  why: string;
  status: GoalStatus;
  achievedAt: Timestamp | null;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Habit {
  id: string;
  title: string;
  emoji: string;
  color: string;
  categoryId: string | null;
  /** Días en que toca (0 = domingo … 6 = sábado). Vacío = todos los días. */
  weekdays: number[];
  archived: boolean;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Un registro por hábito y día cumplido. id = `${habitId}:${date}` (evita duplicados). */
export interface HabitLog {
  id: string;
  habitId: string;
  date: ISODate;
  at: Timestamp;
}

export type Mood = 1 | 2 | 3 | 4 | 5;

/** Diario: una entrada por día. */
export interface JournalEntry {
  date: ISODate;
  mood: Mood | null;
  gratitude: string;
  proud: string;
  updatedAt: Timestamp;
}

export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 1, emoji: '😔', label: 'Difícil' },
  { value: 2, emoji: '😕', label: 'Regular' },
  { value: 3, emoji: '🙂', label: 'Bien' },
  { value: 4, emoji: '😊', label: 'Muy bien' },
  { value: 5, emoji: '🤩', label: 'Increíble' },
];

export type ActivityType =
  | 'created'
  | 'completed'
  | 'reopened'
  | 'deleted'
  | 'updated'
  | 'cancelled'
  | 'status'
  | 'responsible'
  | 'dueDate'
  | 'closure';

export interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

/** Historial ligero de actividad (sirve para la revisión semanal). */
export interface Activity {
  id: string;
  taskId: string;
  projectId: string | null;
  type: ActivityType;
  at: Timestamp;
  title: string;
  changes?: FieldChange[];
}

export type SortMode = 'manual' | 'due' | 'priority' | 'created' | 'title';

export type FontSet = 'playful' | 'editorial' | 'clean';
export type Palette = 'sorbet' | 'olive' | 'rose' | 'sage' | 'blue';
export type RadiusStyle = 'soft' | 'round';

export interface Appearance {
  font: FontSet;
  palette: Palette;
  radius: RadiusStyle;
}

export type TodayGroupBy = 'none' | 'category' | 'project' | 'priority';

export interface AnalyticsLayout {
  order: string[];
  hidden: string[];
  /** Columnas visibles en la tabla de registros (vacío = predeterminadas). */
  columns: string[];
}

export interface Settings {
  userName: string;
  weekStart: 0 | 1; // 0 domingo, 1 lunes
  timeFormat: '24h' | '12h';
  defaultSort: SortMode;
  showCompleted: boolean;
  density: 'comfortable' | 'compact';
  appearance: Appearance;
  todayGroupBy: TodayGroupBy;
  /** Mostrar el registro de cierre al completar una actividad. */
  closurePrompt: boolean;
  closureResults: Option[];
  attentionTypes: Option[];
  analytics: AnalyticsLayout;
  /** Pequeña celebración (confeti) al completar cosas. */
  celebrations: boolean;
}

export interface SettingRow {
  key: 'settings';
  value: Settings;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export const DEFAULT_APPEARANCE: Appearance = { font: 'playful', palette: 'sorbet', radius: 'round' };

export const DEFAULT_CLOSURE_RESULTS: Option[] = [
  { id: 'res-atendida', label: 'Atendida' },
  { id: 'res-parcial', label: 'Atendida parcialmente' },
  { id: 'res-no-procedente', label: 'No procedente' },
  { id: 'res-canalizada', label: 'Canalizada' },
  { id: 'res-otra', label: 'Otra' },
];

export const DEFAULT_ATTENTION_TYPES: Option[] = [
  { id: 'at-oficio', label: 'Oficio' },
  { id: 'at-llamada', label: 'Llamada' },
  { id: 'at-correo', label: 'Correo electrónico' },
  { id: 'at-reunion', label: 'Reunión' },
  { id: 'at-canalizacion', label: 'Canalización' },
  { id: 'at-seguimiento', label: 'Seguimiento' },
];

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  weekStart: 1,
  timeFormat: '12h',
  defaultSort: 'manual',
  showCompleted: false,
  density: 'comfortable',
  appearance: DEFAULT_APPEARANCE,
  todayGroupBy: 'category',
  closurePrompt: true,
  closureResults: DEFAULT_CLOSURE_RESULTS,
  attentionTypes: DEFAULT_ATTENTION_TYPES,
  analytics: { order: [], hidden: [], columns: [] },
  celebrations: true,
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Pendiente',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: 'Texto corto',
  longtext: 'Texto largo',
  number: 'Número',
  date: 'Fecha',
  select: 'Selección única',
  multiselect: 'Selección múltiple',
  checkbox: 'Casilla',
  currency: 'Importe monetario',
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
  { value: '#F4A6B8', label: 'Rosa' },
  { value: '#F7B58C', label: 'Durazno' },
  { value: '#F5CF6B', label: 'Sol' },
  { value: '#9FD3A8', label: 'Menta' },
  { value: '#8FC9C4', label: 'Aqua' },
  { value: '#9DBBE8', label: 'Cielo' },
  { value: '#B9A3E3', label: 'Lavanda' },
  { value: '#E59AC8', label: 'Orquídea' },
  { value: '#A9B28A', label: 'Olivo' },
  { value: '#C9B8A3', label: 'Arena' },
];

/** Emojis sugeridos para áreas, metas y hábitos. */
export const EMOJI_CHOICES = [
  '🌿', '💪', '🧘', '🏃', '🥗', '💧', '😴', '📚', '✍️', '🎨',
  '🎵', '💼', '💻', '💸', '🏠', '🧺', '🪴', '🐾', '❤️', '👯',
  '✈️', '🎯', '⭐', '✨', '🌸', '☀️', '🌙', '🧠', '📷', '🍳',
];
