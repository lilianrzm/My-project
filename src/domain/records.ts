/**
 * Definición de columnas de la tabla de registros (una fila = una actividad principal).
 * La misma definición alimenta la tabla de Análisis y la exportación a Excel.
 */
import type { CellValue } from '../export/xlsx';
import { compliesLabel, concludedDate, daysToConclude } from './analytics';
import { localDateOf } from './selectors';
import type { Category, CustomField, Option, Project, Tag, Task } from './types';
import { PRIORITY_LABEL, STATUS_LABEL } from './types';

export interface RecordContext {
  today: string;
  categoryById: Map<string, Category>;
  projectById: Map<string, Project>;
  tagById: Map<string, Tag>;
  results: Option[];
  attentionTypes: Option[];
  customFields: CustomField[];
  attachmentCount: Map<string, number>;
  goalById?: Map<string, { title: string; emoji: string }>;
}

export interface Column {
  id: string;
  label: string;
  /** Valor para Excel/orden (fechas como { date }). */
  get: (t: Task, c: RecordContext) => CellValue;
  width?: number;
  /** Visible por defecto en la tabla. */
  default?: boolean;
  numeric?: boolean;
}

const d = (iso: string | null | undefined): CellValue => (iso ? { date: iso } : null);

export const BASE_COLUMNS: Column[] = [
  { id: 'id', label: 'ID', get: (t) => t.id, width: 38 },
  { id: 'title', label: 'Actividad', get: (t) => t.title, width: 40, default: true },
  { id: 'description', label: 'Descripción', get: (t) => t.description, width: 40 },
  { id: 'goal', label: 'Meta', get: (t, c) => (t.goalId ? c.goalById?.get(t.goalId)?.title ?? '' : ''), width: 24 },
  { id: 'category', label: 'Área', get: (t, c) => (t.categoryId ? c.categoryById.get(t.categoryId)?.name ?? '' : ''), width: 20, default: true },
  { id: 'project', label: 'Proyecto', get: (t, c) => (t.projectId ? c.projectById.get(t.projectId)?.name ?? '' : ''), width: 22, default: true },
  { id: 'priority', label: 'Prioridad', get: (t) => PRIORITY_LABEL[t.priority], width: 14 },
  { id: 'status', label: 'Estado', get: (t) => STATUS_LABEL[t.status], width: 13, default: true },
  { id: 'tags', label: 'Etiquetas', get: (t, c) => t.tagIds.map((id) => c.tagById.get(id)?.name).filter(Boolean).join(', '), width: 20 },
  { id: 'createdAt', label: 'Fecha de creación', get: (t) => d(localDateOf(t.createdAt)), width: 14, default: true },
  { id: 'dueDate', label: 'Fecha de vencimiento', get: (t) => d(t.dueDate), width: 14, default: true },
  { id: 'completedAt', label: 'Fecha de conclusión', get: (t) => d(t.completedAt ? localDateOf(t.completedAt) : null), width: 14, default: true },
  { id: 'days', label: 'Días hasta completarla', get: (t) => daysToConclude(t), width: 12, numeric: true, default: true },
  { id: 'onTime', label: 'Plazo', get: (t, c) => compliesLabel(t, c.today), width: 20, default: true },
  { id: 'subtasks', label: 'Subtareas', get: (t) => t.subtasks.length, width: 10, numeric: true, default: true },
  { id: 'subtasksDone', label: 'Subtareas completadas', get: (t) => t.subtasks.filter((s) => s.done).length, width: 10, numeric: true },
  { id: 'attachments', label: 'Documentos', get: (t, c) => c.attachmentCount.get(t.id) ?? 0, width: 10, numeric: true },
];

export function customColumn(f: CustomField): Column {
  return {
    id: `cf:${f.id}`,
    label: f.archived ? `${f.name} (archivado)` : f.name,
    width: f.type === 'longtext' ? 40 : 18,
    numeric: f.type === 'number' || f.type === 'currency',
    get: (t) => {
      const v = t.customValues?.[f.id];
      if (v === undefined || v === null) return null;
      switch (f.type) {
        case 'select':
          return typeof v === 'string' ? f.options.find((o) => o.id === v)?.label ?? '' : '';
        case 'multiselect':
          return Array.isArray(v) ? v.map((id) => f.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ') : '';
        case 'checkbox':
          return v === true;
        case 'date':
          return typeof v === 'string' ? { date: v } : null;
        case 'number':
        case 'currency':
          return typeof v === 'number' ? v : null;
        default:
          return String(v);
      }
    },
  };
}

export function allColumns(customFields: CustomField[]): Column[] {
  return [...BASE_COLUMNS, ...customFields.map(customColumn)];
}

/** Valor para mostrar en pantalla. */
export function displayCell(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'object') return v.date.split('-').reverse().join('/');
  return String(v);
}

/** Clave comparable para ordenar. */
export function sortKey(v: CellValue): string | number {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return v.date;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return typeof v === 'number' ? v : v.toLocaleLowerCase('es-MX');
}

export { concludedDate };
