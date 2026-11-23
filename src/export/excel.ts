import { buildXlsx, type CellValue, type Sheet } from './xlsx';
import { allColumns, type RecordContext } from '../domain/records';
import type { Metrics } from '../domain/analytics';
import { localDateOf } from '../domain/selectors';
import { bestHabitStreak, goalProgress, habitRate, habitStreak, logSet } from '../domain/personal';
import type { Goal, Habit, HabitLog, Task } from '../domain/types';

export interface ExcelSummary {
  metrics: Metrics;
  filters: [string, string][];
  scope: 'filtered' | 'all';
}

export interface PersonalData {
  goals: Goal[];
  habits: Habit[];
  habitLogs: HabitLog[];
  today: string;
}

const GOAL_STATUS: Record<Goal['status'], string> = { active: 'En camino', achieved: 'Lograda', archived: 'Archivada' };
const GOAL_KIND: Record<Goal['kind'], string> = { count: 'Número', tasks: 'Con pasos', check: 'Sí / no' };

/**
 * Libro de Excel: Tareas (una fila por tarea principal), Subtareas (vinculadas por ID),
 * Metas, Hábitos y Resumen. No incluye documentos adjuntos.
 */
export function buildActivitiesWorkbook(tasks: Task[], ctx: RecordContext, summary: ExcelSummary, personal?: PersonalData): Uint8Array {
  const cols = allColumns(ctx.customFields);
  const activities: Sheet = {
    name: 'Tareas',
    header: true,
    widths: cols.map((c) => c.width ?? 16),
    rows: [cols.map((c) => c.label), ...tasks.map((t) => cols.map((c) => c.get(t, ctx)))],
  };

  const subRows: CellValue[][] = [['ID tarea', 'Tarea', 'Orden', 'ID subtarea', 'Subtarea', 'Estado', 'Fecha de creación', 'Fecha en que se completó']];
  for (const t of tasks) {
    t.subtasks.forEach((s, i) => {
      subRows.push([
        t.id,
        t.title,
        i + 1,
        s.id,
        s.title,
        s.done ? 'Hecha' : 'Pendiente',
        s.createdAt ? { date: localDateOf(s.createdAt) } : null,
        s.completedAt ? { date: localDateOf(s.completedAt) } : null,
      ]);
    });
  }
  const sheets: Sheet[] = [activities, { name: 'Subtareas', header: true, widths: [38, 40, 8, 38, 40, 12, 14, 14], rows: subRows }];

  if (personal) {
    const catName = (id: string | null) => (id ? ctx.categoryById.get(id)?.name ?? '' : '');
    sheets.push({
      name: 'Metas',
      header: true,
      widths: [36, 8, 16, 14, 12, 12, 12, 10, 12, 14, 14, 40],
      rows: [
        ['Meta', 'Emoji', 'Área', 'Tipo', 'Avance', 'Objetivo', 'Unidad', '%', 'Estado', 'Fecha límite', 'Lograda el', '¿Por qué?'],
        ...personal.goals.map((g) => {
          const p = goalProgress(g, tasks);
          return [
            g.title,
            g.emoji,
            catName(g.categoryId),
            GOAL_KIND[g.kind],
            p.value,
            p.total,
            g.unit,
            p.pct,
            GOAL_STATUS[g.status],
            g.dueDate ? { date: g.dueDate } : null,
            g.achievedAt ? { date: localDateOf(g.achievedAt) } : null,
            g.why,
          ] as CellValue[];
        }),
      ],
    });
    const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    sheets.push({
      name: 'Hábitos',
      header: true,
      widths: [32, 8, 16, 24, 12, 12, 16, 14, 12],
      rows: [
        ['Hábito', 'Emoji', 'Área', 'Días', 'Racha actual', 'Mejor racha', '% últimos 30 días', 'Veces cumplido', 'Estado'],
        ...personal.habits.map((h) => {
          const done = logSet(personal.habitLogs, h.id);
          const rate = habitRate(h, done, personal.today, 30);
          return [
            h.title,
            h.emoji,
            catName(h.categoryId),
            h.weekdays.length ? h.weekdays.map((d) => DAYS[d]).join(', ') : 'Todos los días',
            habitStreak(h, done, personal.today),
            bestHabitStreak(h, done, personal.today),
            rate,
            done.size,
            h.archived ? 'Pausado' : 'Activo',
          ] as CellValue[];
        }),
      ],
    });
  }

  const m = summary.metrics;
  const n = (v: number | null) => (v === null ? 'Sin datos suficientes' : v);
  const res: CellValue[][] = [
    ['The Daily Edit — Resumen', ''],
    ['Fecha de exportación', { date: localDateOf(new Date().toISOString()) }],
    ['Tareas exportadas', tasks.length],
    ...summary.filters.map(([k, v]) => [k, v] as CellValue[]),
    [],
    ['Indicador', 'Valor'],
    ['Tareas creadas', m.created],
    ['Tareas completadas', m.completed],
    ['Tareas pendientes (hoy)', m.pending],
    ['Tareas con fecha pasada (hoy)', m.overdue],
    ['Tareas canceladas', m.cancelled],
    ['Completadas a tiempo (%)', n(m.onTimePct)],
    ['Días promedio hasta completar', n(m.avgDays)],
    ['Subtareas hechas', m.subtasksDone],
    ['Subtareas por tarea (promedio)', n(m.avgSubtasks)],
    [],
    ['Cómo se cuenta', ''],
    ['Unidad', 'Cada tarea principal cuenta una vez; sus subtareas se cuentan aparte.'],
    ['Completadas a tiempo', 'Completadas en o antes de su fecha ÷ completadas que tenían fecha × 100'],
    ['Días promedio', 'Días calendario de la creación a la finalización, en promedio'],
  ];
  sheets.push({ name: 'Resumen', widths: [40, 70], rows: res });

  return buildXlsx(sheets);
}
