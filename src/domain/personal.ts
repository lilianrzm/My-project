/**
 * Lógica de logro personal: hábitos, rachas y progreso de metas.
 *
 * RACHAS (reglas):
 *  - Racha de un hábito: días programados consecutivos cumplidos hasta hoy. Si hoy toca y
 *    aún no lo marcas, la racha NO se rompe (todavía tienes el día); los días en que no toca
 *    no cuentan ni rompen.
 *  - Racha general: días seguidos en los que completaste al menos una tarea o un hábito.
 *    Hoy sin actividad todavía no la rompe.
 */
import { addDays, weekday } from './dates';
import { localDateOf } from './selectors';
import type { Goal, Habit, HabitLog, ISODate, Task } from './types';

const MAX_DAYS = 3650;

export function habitStart(h: Habit): ISODate {
  return localDateOf(h.createdAt);
}

export function isScheduled(h: Habit, date: ISODate): boolean {
  if (date < habitStart(h)) return false;
  return !h.weekdays.length || h.weekdays.includes(weekday(date));
}

export function logSet(logs: HabitLog[], habitId?: string): Set<string> {
  return new Set(logs.filter((l) => !habitId || l.habitId === habitId).map((l) => l.date));
}

export function habitStreak(h: Habit, done: Set<string>, today: ISODate): number {
  let n = 0;
  let d = today;
  if (isScheduled(h, d) && !done.has(d)) d = addDays(d, -1); // hoy aún no rompe
  for (let i = 0; i < MAX_DAYS && d >= habitStart(h); i++, d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    if (done.has(d)) n++;
    else break;
  }
  return n;
}

export function bestHabitStreak(h: Habit, done: Set<string>, today: ISODate): number {
  let best = 0;
  let cur = 0;
  let d = habitStart(h);
  for (let i = 0; i < MAX_DAYS && d <= today; i++, d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    if (done.has(d)) {
      cur++;
      best = Math.max(best, cur);
    } else if (d !== today) cur = 0;
  }
  return best;
}

/** % de días programados cumplidos en los últimos `days` días (null si no tocaba ninguno). */
export function habitRate(h: Habit, done: Set<string>, today: ISODate, days = 30): number | null {
  let due = 0;
  let ok = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    if (!isScheduled(h, d)) continue;
    if (d === today && !done.has(d)) continue;
    due++;
    if (done.has(d)) ok++;
  }
  return due ? Math.round((ok / due) * 100) : null;
}

/** Días con actividad: tareas completadas o hábitos cumplidos. */
export function activeDays(tasks: Task[], logs: HabitLog[]): Set<string> {
  const s = new Set<string>();
  for (const t of tasks) if (t.status === 'completed' && t.completedAt) s.add(localDateOf(t.completedAt));
  for (const l of logs) s.add(l.date);
  return s;
}

export function dayStreak(active: Set<string>, today: ISODate): number {
  let d = active.has(today) ? today : addDays(today, -1);
  let n = 0;
  for (let i = 0; i < MAX_DAYS && active.has(d); i++, d = addDays(d, -1)) n++;
  return n;
}

export interface GoalProgress {
  value: number;
  total: number;
  pct: number;
  label: string;
  /** Todas las piezas listas pero aún sin marcar como lograda. */
  ready: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(n);

export function goalProgress(g: Goal, tasks: Task[]): GoalProgress {
  if (g.kind === 'count') {
    const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
    const unit = g.unit ? ` ${g.unit}` : '';
    return { value: g.current, total: g.target, pct, label: `${fmt(g.current)} de ${fmt(g.target)}${unit}`, ready: false };
  }
  if (g.kind === 'tasks') {
    const linked = tasks.filter((t) => t.goalId === g.id && t.status !== 'cancelled');
    const done = linked.filter((t) => t.status === 'completed').length;
    const pct = linked.length ? Math.round((done / linked.length) * 100) : 0;
    return {
      value: done,
      total: linked.length,
      pct: g.status === 'achieved' ? 100 : pct,
      label: linked.length ? `${done} de ${linked.length} pasos` : 'Aún sin pasos',
      ready: g.status === 'active' && linked.length > 0 && done === linked.length,
    };
  }
  const achieved = g.status === 'achieved';
  return { value: achieved ? 1 : 0, total: 1, pct: achieved ? 100 : 0, label: achieved ? '¡Lograda!' : 'En camino', ready: false };
}

/** Mensajes de ánimo cortos (sin presión). */
export const CHEERS = ['¡Bien hecho! 🎉', '¡Lo lograste! ✨', '¡Un paso más! 🌱', '¡Así se hace! 💪', '¡Qué orgullo! 🌸', '¡Sigue así! ☀️'];

export function cheer(seed = Date.now()): string {
  return CHEERS[Math.abs(seed) % CHEERS.length];
}
