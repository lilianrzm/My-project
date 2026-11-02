import { addDays, addMonthsAnchored, diffDays, isValidISODate, parseISODate, startOfWeek, weekday } from './dates';
import type { ISODate, Recurrence, RecurrenceFreq } from './types';

/**
 * REGLA DE GENERACIÓN DE OCURRENCIAS
 * ----------------------------------
 * Las recurrencias se basan en el calendario (no en la fecha de finalización):
 *  1. Al completar una ocurrencia, se calcula la primera fecha de la serie
 *     estrictamente posterior a su fecha de vencimiento.
 *  2. Si esa fecha ya pasó (completaste tarde), se sigue avanzando hasta
 *     llegar a hoy o después: nunca se acumulan copias vencidas.
 *  3. Se crea UNA tarea nueva con el mismo seriesId. La tarea completada
 *     se conserva tal cual en el historial.
 *  4. La creación ocurre dentro de una transacción y comprueba que no exista
 *     ya una ocurrencia de esa serie en esa fecha, por lo que reiniciar la app
 *     o completar dos veces no duplica tareas.
 *  5. Si la serie tiene fecha de fin (until) y la siguiente fecha la supera,
 *     no se genera nada.
 */

const MAX_ITER = 5000;

function monthsBetween(anchor: ISODate, d: ISODate): number {
  const a = parseISODate(anchor);
  const b = parseISODate(d);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/** Primera fecha de la serie estrictamente posterior a `after`. */
export function nextAfter(rec: Recurrence, after: ISODate): ISODate | null {
  const interval = Math.max(1, Math.floor(rec.interval || 1));
  const anchor = isValidISODate(rec.anchor) ? rec.anchor : after;

  switch (rec.freq) {
    case 'daily': {
      // Alineado con el ancla: anchor + k*interval
      const diff = diffDays(after, anchor);
      const k = diff < 0 ? 0 : Math.floor(diff / interval) + 1;
      let next = addDays(anchor, k * interval);
      if (next <= after) next = addDays(after, interval);
      return next;
    }
    case 'weekly': {
      const days = rec.weekdays && rec.weekdays.length ? rec.weekdays : [weekday(anchor)];
      const anchorWeek = startOfWeek(anchor, 0);
      let cand = addDays(after, 1);
      for (let i = 0; i < MAX_ITER; i++) {
        const weeks = Math.round(diffDays(startOfWeek(cand, 0), anchorWeek) / 7);
        if (weeks >= 0 && weeks % interval === 0 && days.includes(weekday(cand))) return cand;
        cand = addDays(cand, 1);
      }
      return null;
    }
    case 'monthly':
    case 'yearly': {
      const step = rec.freq === 'monthly' ? interval : interval * 12;
      const anchorDay = parseISODate(anchor).getDate();
      let k = Math.max(0, Math.floor(monthsBetween(anchor, after) / step));
      for (let i = 0; i < MAX_ITER; i++) {
        const cand = addMonthsAnchored(anchor, k * step, anchorDay);
        if (cand > after) return cand;
        k++;
      }
      return null;
    }
    default:
      return null;
  }
}

/** Siguiente fecha a generar al completar una ocurrencia con vencimiento `due`. */
export function nextOccurrenceDate(rec: Recurrence, due: ISODate, today: ISODate): ISODate | null {
  let next = nextAfter(rec, due);
  let guard = 0;
  while (next && next < today && guard++ < MAX_ITER) {
    next = nextAfter(rec, next);
  }
  if (!next) return null;
  if (rec.until && next > rec.until) return null;
  return next;
}

const FREQ_LABEL: Record<RecurrenceFreq, [string, string]> = {
  daily: ['Cada día', 'días'],
  weekly: ['Cada semana', 'semanas'],
  monthly: ['Cada mes', 'meses'],
  yearly: ['Cada año', 'años'],
};

const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function describeRecurrence(rec: Recurrence | null): string {
  if (!rec) return 'No se repite';
  const [single, plural] = FREQ_LABEL[rec.freq];
  let s = rec.interval > 1 ? `Cada ${rec.interval} ${plural}` : single;
  if (rec.freq === 'weekly' && rec.weekdays && rec.weekdays.length) {
    s += ` (${[...rec.weekdays].sort().map((d) => WD[d]).join(', ')})`;
  }
  if (rec.until) s += ` hasta ${rec.until.split('-').reverse().join('/')}`;
  return s;
}
