import { buildXlsx, type CellValue, type Sheet } from './xlsx';
import { allColumns, type RecordContext } from '../domain/records';
import type { Metrics } from '../domain/analytics';
import { localDateOf } from '../domain/selectors';
import type { Task } from '../domain/types';

export interface ExcelSummary {
  metrics: Metrics;
  filters: [string, string][];
  scope: 'filtered' | 'all';
}

/** Libro con 3 hojas: Actividades (1 fila por actividad principal), Subtareas y Resumen. */
export function buildActivitiesWorkbook(tasks: Task[], ctx: RecordContext, summary: ExcelSummary): Uint8Array {
  const cols = allColumns(ctx.customFields);
  const activities: Sheet = {
    name: 'Actividades',
    header: true,
    widths: cols.map((c) => c.width ?? 16),
    rows: [cols.map((c) => c.label), ...tasks.map((t) => cols.map((c) => c.get(t, ctx)))],
  };

  const subRows: CellValue[][] = [['ID actividad', 'Actividad', 'Orden', 'ID subtarea', 'Subtarea', 'Estado', 'Fecha de creación', 'Fecha de ejecución']];
  for (const t of tasks) {
    t.subtasks.forEach((s, i) => {
      subRows.push([
        t.id,
        t.title,
        i + 1,
        s.id,
        s.title,
        s.done ? 'Completada' : 'Pendiente',
        s.createdAt ? { date: localDateOf(s.createdAt) } : null,
        s.completedAt ? { date: localDateOf(s.completedAt) } : null,
      ]);
    });
  }
  const subtasks: Sheet = { name: 'Subtareas', header: true, widths: [38, 40, 8, 38, 40, 13, 14, 14], rows: subRows };

  const m = summary.metrics;
  const n = (v: number | null, suffix = '') => (v === null ? 'Sin datos suficientes' : suffix ? `${v}${suffix}` : v);
  const res: CellValue[][] = [
    ['The Daily Edit — Resumen de exportación', ''],
    ['Fecha de exportación', { date: localDateOf(new Date().toISOString()) }],
    ['Alcance', summary.scope === 'filtered' ? 'Registros filtrados' : 'Todos los registros'],
    ['Actividades exportadas', tasks.length],
    [],
    ['Filtros aplicados', ''],
    ...summary.filters.map(([k, v]) => [k, v] as CellValue[]),
    [],
    ['Indicador', 'Valor'],
    ['Actividades principales creadas', m.created],
    ['Actividades principales completadas', m.completed],
    ['Actividades pendientes (hoy)', m.pending],
    ['Actividades vencidas (hoy)', m.overdue],
    ['Actividades canceladas', m.cancelled],
    ['Cumplimiento de plazos (%)', n(m.onTimePct)],
    ['  Base: concluidas con vencimiento', m.onTimeBase],
    ['Tiempo promedio de atención (días)', n(m.avgDays)],
    ['  Base: concluidas con fechas válidas', m.avgDaysBase],
    ['Subtareas ejecutadas', m.subtasksDone],
    ['Promedio de subtareas por actividad', n(m.avgSubtasks)],
    [],
    ['Completadas por resultado', ''],
    ...m.byResult.map((b) => [b.label, b.value] as CellValue[]),
    [],
    ['Fórmulas', ''],
    ['Cumplimiento de plazos', 'Concluidas con fecha de conclusión ≤ vencimiento / concluidas con vencimiento y conclusión válidos × 100'],
    ['Tiempo promedio de atención', 'Σ días calendario de creación a conclusión / nº de concluidas con fechas válidas'],
    ['Promedio de subtareas', 'Nº de subtareas del conjunto / nº de actividades principales del conjunto'],
    ['Fecha de conclusión', 'Fecha efectiva de atención si se registró; si no, fecha en que se marcó completada'],
    ['Unidad de análisis', 'La actividad principal. Las subtareas no se cuentan como actividades.'],
  ];
  const resumen: Sheet = { name: 'Resumen', widths: [42, 70], rows: res };

  return buildXlsx([activities, subtasks, resumen]);
}
