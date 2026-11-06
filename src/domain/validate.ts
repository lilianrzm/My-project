import { isValidISODate, isValidTime } from './dates';
import type {
  Activity,
  Appearance,
  Attachment,
  Category,
  Closure,
  CustomField,
  CustomFieldType,
  CustomValue,
  FieldChange,
  FieldScope,
  Option,
  Priority,
  Project,
  ProjectStatus,
  Recurrence,
  Settings,
  SortMode,
  Subtask,
  Tag,
  Task,
} from './types';
import { DEFAULT_APPEARANCE, DEFAULT_ATTENTION_TYPES, DEFAULT_CLOSURE_RESULTS, DEFAULT_SETTINGS } from './types';

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const LIMITS = {
  title: 500,
  description: 2000,
  notes: 20000,
  name: 120,
  subtasks: 200,
  tags: 50,
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const idOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 100 ? v : null);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100;
const ts = (v: unknown, fallback: string): string =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback;
const tsOrNull = (v: unknown): string | null =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const color = (v: unknown, fallback: string): string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;

export class ValidationError extends Error {}

export function normalizePriority(v: unknown): Priority {
  return v === 1 || v === 2 || v === 3 ? v : 0;
}

export function normalizeRecurrence(v: unknown, fallbackAnchor: string | null): Recurrence | null {
  if (!isObj(v)) return null;
  const freq = v.freq;
  if (freq !== 'daily' && freq !== 'weekly' && freq !== 'monthly' && freq !== 'yearly') return null;
  const anchor = isValidISODate(v.anchor) ? v.anchor : fallbackAnchor;
  if (!anchor) return null;
  const interval = Math.min(365, Math.max(1, Math.floor(num(v.interval, 1))));
  const weekdays = Array.isArray(v.weekdays)
    ? [...new Set(v.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  return {
    freq,
    interval,
    weekdays: freq === 'weekly' ? weekdays : [],
    anchor,
    until: isValidISODate(v.until) ? v.until : null,
  };
}

function normalizeSubtasks(v: unknown): Subtask[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Subtask[] = [];
  for (const s of v.slice(0, LIMITS.subtasks)) {
    if (!isObj(s)) continue;
    const title = str(s.title, LIMITS.title).trim();
    if (!title) continue;
    let id = isId(s.id) ? s.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const done = s.done === true;
    out.push({ id, title, done, createdAt: tsOrNull(s.createdAt), completedAt: done ? tsOrNull(s.completedAt) : null });
  }
  return out;
}

/** Valida y normaliza una tarea. Lanza ValidationError si no es recuperable. */
export function normalizeTask(v: unknown, now = new Date().toISOString()): Task {
  if (!isObj(v)) throw new ValidationError('La tarea no es un objeto válido.');
  if (!isId(v.id)) throw new ValidationError('Una tarea no tiene identificador.');
  const title = str(v.title, LIMITS.title).trim();
  if (!title) throw new ValidationError(`La tarea ${v.id} no tiene título.`);
  const dueDate = isValidISODate(v.dueDate) ? v.dueDate : null;
  const status = v.status === 'completed' ? 'completed' : v.status === 'cancelled' ? 'cancelled' : 'open';
  const createdAt = ts(v.createdAt, now);
  return {
    id: v.id,
    title,
    description: str(v.description, LIMITS.description),
    notes: str(v.notes, LIMITS.notes),
    createdAt,
    updatedAt: ts(v.updatedAt, createdAt),
    dueDate,
    dueTime: dueDate && isValidTime(v.dueTime) ? v.dueTime : null,
    priority: normalizePriority(v.priority),
    categoryId: idOrNull(v.categoryId),
    projectId: idOrNull(v.projectId),
    tagIds: Array.isArray(v.tagIds) ? [...new Set(v.tagIds.filter(isId))].slice(0, LIMITS.tags) : [],
    subtasks: normalizeSubtasks(v.subtasks),
    status,
    completedAt: status === 'completed' ? tsOrNull(v.completedAt) ?? ts(v.updatedAt, now) : null,
    cancelledAt: status === 'cancelled' ? tsOrNull(v.cancelledAt) ?? ts(v.updatedAt, now) : null,
    startDate: isValidISODate(v.startDate) ? v.startDate : null,
    responsible: str(v.responsible, LIMITS.name).trim(),
    folio: str(v.folio, LIMITS.name).trim(),
    closure: normalizeClosure(v.closure),
    customValues: normalizeCustomValues(v.customValues),
    todayDate: isValidISODate(v.todayDate) ? v.todayDate : null,
    recurrence: normalizeRecurrence(v.recurrence, dueDate),
    seriesId: idOrNull(v.seriesId),
    nextOccurrenceId: idOrNull(v.nextOccurrenceId),
    order: num(v.order, 0),
  };
}

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'completed', 'archived'];

export function normalizeProject(v: unknown, now = new Date().toISOString()): Project {
  if (!isObj(v) || !isId(v.id)) throw new ValidationError('Un proyecto no tiene identificador.');
  const name = str(v.name, LIMITS.name).trim();
  if (!name) throw new ValidationError(`El proyecto ${v.id} no tiene nombre.`);
  const createdAt = ts(v.createdAt, now);
  return {
    id: v.id,
    name,
    description: str(v.description, LIMITS.description),
    color: color(v.color, '#81866A'),
    targetDate: isValidISODate(v.targetDate) ? v.targetDate : null,
    status: PROJECT_STATUSES.includes(v.status as ProjectStatus) ? (v.status as ProjectStatus) : 'active',
    order: num(v.order, 0),
    createdAt,
    updatedAt: ts(v.updatedAt, createdAt),
  };
}

export function normalizeCategory(v: unknown, now = new Date().toISOString()): Category {
  if (!isObj(v) || !isId(v.id)) throw new ValidationError('Una categoría no tiene identificador.');
  const name = str(v.name, LIMITS.name).trim();
  if (!name) throw new ValidationError(`La categoría ${v.id} no tiene nombre.`);
  const createdAt = ts(v.createdAt, now);
  return {
    id: v.id,
    name,
    color: color(v.color, '#A7B09A'),
    order: num(v.order, 0),
    createdAt,
    updatedAt: ts(v.updatedAt, createdAt),
  };
}

export function normalizeTag(v: unknown, now = new Date().toISOString()): Tag {
  if (!isObj(v) || !isId(v.id)) throw new ValidationError('Una etiqueta no tiene identificador.');
  const name = str(v.name, 60).trim();
  if (!name) throw new ValidationError(`La etiqueta ${v.id} no tiene nombre.`);
  return { id: v.id, name, createdAt: ts(v.createdAt, now) };
}

export function normalizeActivity(v: unknown): Activity | null {
  if (!isObj(v) || !isId(v.id) || !isId(v.taskId)) return null;
  const types = ['created', 'completed', 'reopened', 'deleted', 'updated', 'cancelled', 'status', 'responsible', 'dueDate', 'closure'];
  if (!types.includes(v.type as string)) return null;
  const at = tsOrNull(v.at);
  if (!at) return null;
  return {
    id: v.id,
    taskId: v.taskId,
    projectId: idOrNull(v.projectId),
    type: v.type as Activity['type'],
    at,
    title: str(v.title, LIMITS.title),
    ...(Array.isArray(v.changes) ? { changes: normalizeChanges(v.changes) } : {}),
  };
}

function normalizeChanges(arr: unknown[]): FieldChange[] {
  const cell = (x: unknown) => (x === null || x === undefined ? null : String(x).slice(0, 500));
  return arr
    .filter(isObj)
    .slice(0, 50)
    .map((c) => ({ field: str(c.field, 60), from: cell(c.from), to: cell(c.to) }));
}

export function normalizeClosure(v: unknown): Closure | null {
  if (!isObj(v)) return null;
  const now = new Date().toISOString();
  const recordedAt = ts(v.recordedAt, now);
  return {
    resultId: idOrNull(v.resultId),
    attentionTypeId: idOrNull(v.attentionTypeId),
    effectiveDate: isValidISODate(v.effectiveDate) ? v.effectiveDate : null,
    responsible: str(v.responsible, LIMITS.name).trim(),
    observations: str(v.observations, LIMITS.notes),
    folio: str(v.folio, LIMITS.name).trim(),
    evidenceIds: Array.isArray(v.evidenceIds) ? [...new Set(v.evidenceIds.filter(isId))].slice(0, 100) : [],
    recordedAt,
    updatedAt: ts(v.updatedAt, recordedAt),
  };
}

export function normalizeCustomValues(v: unknown): Record<string, CustomValue> {
  if (!isObj(v)) return {};
  const out: Record<string, CustomValue> = {};
  for (const [k, val] of Object.entries(v).slice(0, 200)) {
    if (!isId(k)) continue;
    if (typeof val === 'string') out[k] = val.slice(0, LIMITS.notes);
    else if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
    else if (typeof val === 'boolean') out[k] = val;
    else if (Array.isArray(val)) out[k] = val.filter(isId).slice(0, 100);
  }
  return out;
}

export function normalizeOptions(v: unknown, fallback: Option[] = []): Option[] {
  if (!Array.isArray(v)) return fallback;
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const o of v.slice(0, 200)) {
    if (!isObj(o) || !isId(o.id) || seen.has(o.id)) continue;
    const label = str(o.label, LIMITS.name).trim();
    if (!label) continue;
    seen.add(o.id);
    out.push(o.archived === true ? { id: o.id, label, archived: true } : { id: o.id, label });
  }
  return out;
}

const FIELD_TYPES: CustomFieldType[] = ['text', 'longtext', 'number', 'date', 'select', 'multiselect', 'checkbox', 'currency'];

function normalizeScope(v: unknown): FieldScope {
  if (isObj(v) && (v.kind === 'category' || v.kind === 'project') && isId(v.id)) return { kind: v.kind, id: v.id };
  return { kind: 'all' };
}

export function normalizeCustomField(v: unknown, now = new Date().toISOString()): CustomField {
  if (!isObj(v) || !isId(v.id)) throw new ValidationError('Un campo personalizado no tiene identificador.');
  const name = str(v.name, LIMITS.name).trim();
  if (!name) throw new ValidationError(`El campo ${v.id} no tiene nombre.`);
  if (!FIELD_TYPES.includes(v.type as CustomFieldType)) throw new ValidationError(`El campo "${name}" tiene un tipo desconocido.`);
  const createdAt = ts(v.createdAt, now);
  return {
    id: v.id,
    name,
    type: v.type as CustomFieldType,
    description: str(v.description, LIMITS.description),
    options: normalizeOptions(v.options),
    scope: normalizeScope(v.scope),
    archived: v.archived === true,
    order: num(v.order, 0),
    currency: /^[A-Z]{3}$/.test(String(v.currency)) ? String(v.currency) : 'MXN',
    createdAt,
    updatedAt: ts(v.updatedAt, createdAt),
  };
}

const EXTRACT: Attachment['extractStatus'][] = ['pending', 'ok', 'no-text', 'needs-ocr', 'unsupported', 'error'];

export function normalizeAttachment(v: unknown, now = new Date().toISOString()): Attachment {
  if (!isObj(v) || !isId(v.id) || !isId(v.taskId)) throw new ValidationError('Un documento adjunto no es válido.');
  const name = str(v.name, 255).trim() || 'documento';
  return {
    id: v.id,
    taskId: v.taskId,
    name,
    mime: str(v.mime, 120) || 'application/octet-stream',
    size: Math.max(0, Math.floor(num(v.size, 0))),
    addedAt: ts(v.addedAt, now),
    description: str(v.description, LIMITS.description),
    descriptionSource: v.descriptionSource === 'auto' || v.descriptionSource === 'manual' ? v.descriptionSource : 'none',
    extractStatus: EXTRACT.includes(v.extractStatus as Attachment['extractStatus']) ? (v.extractStatus as Attachment['extractStatus']) : 'unsupported',
  };
}

function normalizeAppearance(v: unknown): Appearance {
  const a = isObj(v) ? v : {};
  return {
    font: a.font === 'editorial' || a.font === 'clean' ? a.font : DEFAULT_APPEARANCE.font,
    palette: a.palette === 'rose' || a.palette === 'sage' || a.palette === 'blue' ? a.palette : DEFAULT_APPEARANCE.palette,
    radius: a.radius === 'round' ? 'round' : 'soft',
  };
}

const SORTS: SortMode[] = ['manual', 'due', 'priority', 'created', 'title'];

export function normalizeSettings(v: unknown): Settings {
  const s = isObj(v) ? v : {};
  return {
    userName: str(s.userName, 60, DEFAULT_SETTINGS.userName),
    weekStart: s.weekStart === 0 ? 0 : 1,
    timeFormat: s.timeFormat === '24h' ? '24h' : '12h',
    defaultSort: SORTS.includes(s.defaultSort as SortMode) ? (s.defaultSort as SortMode) : DEFAULT_SETTINGS.defaultSort,
    showCompleted: s.showCompleted === true,
    density: s.density === 'compact' ? 'compact' : 'comfortable',
    appearance: normalizeAppearance(s.appearance),
    todayGroupBy:
      s.todayGroupBy === 'none' || s.todayGroupBy === 'project' || s.todayGroupBy === 'priority' ? s.todayGroupBy : 'category',
    closurePrompt: s.closurePrompt !== false,
    closureResults: normalizeOptions(s.closureResults, DEFAULT_CLOSURE_RESULTS),
    attentionTypes: normalizeOptions(s.attentionTypes, DEFAULT_ATTENTION_TYPES),
    analytics: {
      order: Array.isArray((s.analytics as Obj | undefined)?.order) ? ((s.analytics as Obj).order as unknown[]).filter(isId).slice(0, 50) : [],
      hidden: Array.isArray((s.analytics as Obj | undefined)?.hidden) ? ((s.analytics as Obj).hidden as unknown[]).filter(isId).slice(0, 50) : [],
      columns: Array.isArray((s.analytics as Obj | undefined)?.columns) ? ((s.analytics as Obj).columns as unknown[]).filter(isId).slice(0, 200) : [],
    },
  };
}
