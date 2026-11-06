/**
 * Indicadores de The Daily Edit.
 *
 * UNIDAD DE ANÁLISIS: la actividad principal (Task). Las subtareas nunca se cuentan como
 * actividades; tienen sus propios indicadores operativos.
 *
 * FECHAS QUE USA CADA INDICADOR (siempre fecha local del dispositivo):
 *  - "Creadas"                  → fecha de creación (createdAt).
 *  - "Completadas", resultados,
 *    por categoría/proyecto/periodo,
 *    cumplimiento y tiempo      → fecha de conclusión = fecha efectiva de atención del registro
 *                                 de cierre si existe; si no, la fecha en que se marcó completada.
 *  - "Pendientes" y "Vencidas"  → estado actual (hoy), sin importar el periodo.
 *  - "Subtareas ejecutadas"     → fecha en que se completó cada subtarea (o, para subtareas
 *                                 antiguas sin esa fecha, la conclusión de su actividad).
 *  - Tabla de registros y
 *    "Promedio de subtareas"    → el conjunto filtrado por la "fecha de referencia" elegida
 *                                 (creación, conclusión o vencimiento).
 *
 * FÓRMULAS
 *  - Cumplimiento de plazos (%) = concluidas con fecha de conclusión ≤ vencimiento
 *      / concluidas con vencimiento y fecha de conclusión válidos × 100.
 *  - Tiempo promedio de atención (días) = Σ días calendario (creación → conclusión)
 *      / nº de concluidas con fechas válidas.
 *  - Promedio de subtareas = nº de subtareas del conjunto / nº de actividades del conjunto.
 *  Sin datos suficientes (denominador 0) → null; nunca se inventan valores.
 *  Las canceladas no cuentan como concluidas.
 */
import { addDays, diffDays, startOfMonth, startOfWeek } from './dates';
import { localDateOf } from './selectors';
import type { CustomField, ISODate, Priority, Task, TaskStatus } from './types';

export interface Period {
  from: ISODate | null; // inclusive
  to: ISODate | null; // inclusive
}

export type DateBasis = 'created' | 'concluded' | 'due';

export interface AnalyticsFilter {
  period: Period;
  basis: DateBasis;
  categoryId: string | 'any' | 'none';
  projectId: string | 'any' | 'none';
  status: TaskStatus | 'any';
  priority: Priority | 'any';
  responsible: string | 'any';
  resultId: string | 'any' | 'none';
  custom: { fieldId: string; value: string } | null;
}

export const EMPTY_ANALYTICS_FILTER: AnalyticsFilter = {
  period: { from: null, to: null },
  basis: 'created',
  categoryId: 'any',
  projectId: 'any',
  status: 'any',
  priority: 'any',
  responsible: 'any',
  resultId: 'any',
  custom: null,
};

export const inPeriod = (d: ISODate | null, p: Period): boolean =>
  !!d && (!p.from || d >= p.from) && (!p.to || d <= p.to);

export function createdDate(t: Task): ISODate {
  return localDateOf(t.createdAt);
}

/** Fecha de conclusión usada en métricas (null si no está completada). */
export function concludedDate(t: Task): ISODate | null {
  if (t.status !== 'completed') return null;
  return t.closure?.effectiveDate ?? (t.completedAt ? localDateOf(t.completedAt) : null);
}

export function basisDate(t: Task, basis: DateBasis): ISODate | null {
  if (basis === 'created') return createdDate(t);
  if (basis === 'concluded') return concludedDate(t);
  return t.dueDate;
}

/** Días calendario desde la creación hasta la conclusión. */
export function daysToConclude(t: Task): number | null {
  const c = concludedDate(t);
  if (!c) return null;
  const d = diffDays(c, createdDate(t));
  return d >= 0 ? d : null;
}

/** Días calendario desde la fecha de inicio hasta la conclusión. */
export function daysFromStart(t: Task): number | null {
  const c = concludedDate(t);
  if (!c || !t.startDate) return null;
  const d = diffDays(c, t.startDate);
  return d >= 0 ? d : null;
}

/** Días de retraso respecto al vencimiento (0 si a tiempo). Para pendientes se mide contra hoy. */
export function delayDays(t: Task, today: ISODate): number | null {
  if (!t.dueDate || t.status === 'cancelled') return null;
  const ref = t.status === 'completed' ? concludedDate(t) : today;
  if (!ref) return null;
  return Math.max(0, diffDays(ref, t.dueDate));
}

/** true = a tiempo, false = fuera de plazo, null = sin datos suficientes / no aplica. */
export function onTime(t: Task): boolean | null {
  const c = concludedDate(t);
  if (!c || !t.dueDate) return null;
  return c <= t.dueDate;
}

export function compliesLabel(t: Task, today: ISODate): string {
  if (t.status === 'cancelled') return 'No aplica (cancelada)';
  if (!t.dueDate) return 'Sin vencimiento';
  if (t.status === 'open') return t.dueDate < today ? 'Vencida' : 'En plazo';
  const ok = onTime(t);
  return ok === null ? 'Sin datos suficientes' : ok ? 'Dentro del plazo' : 'Fuera de plazo';
}

/** ¿El campo personalizado aplica a esta actividad? */
export function fieldApplies(f: CustomField, t: Pick<Task, 'categoryId' | 'projectId'>): boolean {
  if (f.scope.kind === 'all') return true;
  if (f.scope.kind === 'category') return t.categoryId === f.scope.id;
  return t.projectId === f.scope.id;
}

/** Filtros no temporales. */
export function applyAnalyticsFilter(tasks: Task[], f: AnalyticsFilter): Task[] {
  return tasks.filter((t) => {
    if (f.categoryId === 'none' ? t.categoryId : f.categoryId !== 'any' && t.categoryId !== f.categoryId) return false;
    if (f.projectId === 'none' ? t.projectId : f.projectId !== 'any' && t.projectId !== f.projectId) return false;
    if (f.status !== 'any' && t.status !== f.status) return false;
    if (f.priority !== 'any' && t.priority !== f.priority) return false;
    if (f.responsible !== 'any') {
      const r = (t.closure?.responsible || t.responsible || '').trim();
      if (f.responsible === '' ? r : r !== f.responsible) return false;
    }
    if (f.resultId !== 'any') {
      const r = t.closure?.resultId ?? null;
      if (f.resultId === 'none' ? r : r !== f.resultId) return false;
    }
    if (f.custom) {
      const v = t.customValues?.[f.custom.fieldId];
      const want = f.custom.value;
      if (want === '__empty') {
        if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) return false;
      } else if (want === 'true' || want === 'false') {
        if ((v === true) !== (want === 'true')) return false;
      } else if (Array.isArray(v)) {
        if (!v.includes(want)) return false;
      } else if (v !== want) return false;
    }
    return true;
  });
}

/** Conjunto de registros: filtros + periodo según la fecha de referencia. */
export function recordSet(tasks: Task[], f: AnalyticsFilter): Task[] {
  const base = applyAnalyticsFilter(tasks, f);
  if (!f.period.from && !f.period.to) return base;
  return base.filter((t) => inPeriod(basisDate(t, f.basis), f.period));
}

export interface Breakdown {
  key: string;
  label: string;
  value: number;
}

export interface Metrics {
  created: number;
  completed: number;
  pending: number;
  overdue: number;
  cancelled: number;
  onTimePct: number | null;
  onTimeBase: number;
  avgDays: number | null;
  avgDaysBase: number;
  avgDaysFromStart: number | null;
  subtasksDone: number;
  avgSubtasks: number | null;
  recordCount: number;
  byCategory: Breakdown[];
  byProject: Breakdown[];
  byResult: Breakdown[];
  series: { key: string; label: string; created: number; completed: number }[];
}

interface Lookups {
  categoryName: (id: string) => string | undefined;
  projectName: (id: string) => string | undefined;
  resultName: (id: string) => string | undefined;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function groupCount(list: Task[], keyOf: (t: Task) => string | null, labelOf: (k: string) => string): Breakdown[] {
  const m = new Map<string, number>();
  for (const t of list) {
    const k = keyOf(t) ?? '__none';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, value]) => ({ key, label: labelOf(key), value })).sort((a, b) => b.value - a.value);
}

/** Cubetas temporales: por semana si el rango es ≤ 120 días, si no por mes. */
export function buckets(period: Period, today: ISODate, weekStart: 0 | 1, tasks: Task[]): { key: string; from: ISODate; to: ISODate; label: string }[] {
  let from = period.from;
  const to = period.to ?? today;
  if (!from) {
    const dates = tasks.map(createdDate).sort();
    from = dates[0] ?? addDays(to, -180);
  }
  if (from > to) return [];
  const span = diffDays(to, from);
  const out: { key: string; from: ISODate; to: ISODate; label: string }[] = [];
  const fmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
  const fmtM = new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' });
  const lbl = (d: ISODate, f: Intl.DateTimeFormat) => f.format(new Date(`${d}T12:00:00`)).replace(/\./g, '');
  if (span <= 120) {
    let s = startOfWeek(from, weekStart);
    while (s <= to && out.length < 60) {
      const e = addDays(s, 6);
      out.push({ key: s, from: s, to: e, label: lbl(s, fmt) });
      s = addDays(s, 7);
    }
  } else {
    let s = startOfMonth(from);
    while (s <= to && out.length < 120) {
      const [y, m] = s.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      out.push({ key: s, from: s, to: addDays(next, -1), label: lbl(s, fmtM) });
      s = next;
    }
  }
  return out;
}

export function computeMetrics(all: Task[], f: AnalyticsFilter, today: ISODate, weekStart: 0 | 1, lk: Lookups): Metrics {
  const base = applyAnalyticsFilter(all, f);
  const p = f.period;
  const created = base.filter((t) => inPeriod(createdDate(t), p));
  const completed = base.filter((t) => t.status === 'completed' && inPeriod(concludedDate(t), p));
  const allTime = !p.from && !p.to;
  const createdN = allTime ? base.length : created.length;
  const completedList = allTime ? base.filter((t) => t.status === 'completed') : completed;

  const withDue = completedList.filter((t) => onTime(t) !== null);
  const okCount = withDue.filter((t) => onTime(t) === true).length;

  const durations = completedList.map(daysToConclude).filter((d): d is number => d !== null);
  const fromStart = completedList.map(daysFromStart).filter((d): d is number => d !== null);

  let subtasksDone = 0;
  for (const t of base) {
    for (const s of t.subtasks) {
      if (!s.done) continue;
      const d = s.completedAt ? localDateOf(s.completedAt) : concludedDate(t);
      if (allTime || inPeriod(d, p)) subtasksDone++;
    }
  }

  const records = recordSet(all, f);
  const subCount = records.reduce((n, t) => n + t.subtasks.length, 0);

  const bks = buckets(p, today, weekStart, base);
  const series = bks.map((b) => ({
    key: b.key,
    label: b.label,
    created: base.filter((t) => inPeriod(createdDate(t), b)).length,
    completed: base.filter((t) => t.status === 'completed' && inPeriod(concludedDate(t), b)).length,
  }));

  return {
    created: createdN,
    completed: completedList.length,
    pending: base.filter((t) => t.status === 'open').length,
    overdue: base.filter((t) => t.status === 'open' && !!t.dueDate && t.dueDate < today).length,
    cancelled: base.filter((t) => t.status === 'cancelled').length,
    onTimePct: withDue.length ? round1((okCount / withDue.length) * 100) : null,
    onTimeBase: withDue.length,
    avgDays: durations.length ? round1(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    avgDaysBase: durations.length,
    avgDaysFromStart: fromStart.length ? round1(fromStart.reduce((a, b) => a + b, 0) / fromStart.length) : null,
    subtasksDone,
    avgSubtasks: records.length ? round1(subCount / records.length) : null,
    recordCount: records.length,
    byCategory: groupCount(completedList, (t) => t.categoryId, (k) => (k === '__none' ? 'Sin categoría' : lk.categoryName(k) ?? 'Categoría eliminada')),
    byProject: groupCount(completedList, (t) => t.projectId, (k) => (k === '__none' ? 'Sin proyecto' : lk.projectName(k) ?? 'Proyecto eliminado')),
    byResult: groupCount(completedList, (t) => t.closure?.resultId ?? null, (k) => (k === '__none' ? 'Sin resultado registrado' : lk.resultName(k) ?? 'Resultado eliminado')),
    series,
  };
}

/** Periodos rápidos. */
export type PeriodPreset = 'all' | 'thisWeek' | 'thisMonth' | 'last30' | 'last90' | 'thisYear' | 'custom';

export function presetPeriod(preset: PeriodPreset, today: ISODate, weekStart: 0 | 1): Period {
  switch (preset) {
    case 'thisWeek':
      return { from: startOfWeek(today, weekStart), to: addDays(startOfWeek(today, weekStart), 6) };
    case 'thisMonth': {
      const s = startOfMonth(today);
      const [y, m] = s.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      return { from: s, to: addDays(next, -1) };
    }
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    default:
      return { from: null, to: null };
  }
}
