import type { ISODate } from './types';

const LOCALE = 'es-MX';

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local -> 'YYYY-MM-DD' */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' -> Date local a mediodía (evita problemas de horario de verano). */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
}

export function isValidTime(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Suma meses conservando el día "ancla" (31 -> último día del mes si no existe). */
export function addMonthsAnchored(s: ISODate, n: number, anchorDay: number): ISODate {
  const d = parseISODate(s);
  const total = d.getFullYear() * 12 + d.getMonth() + n;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const day = Math.min(anchorDay, daysInMonth(y, m));
  return toISODate(new Date(y, m, day, 12));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86400000);
}

export function weekday(s: ISODate): number {
  return parseISODate(s).getDay();
}

/** Inicio de la semana que contiene s. weekStart: 0 domingo, 1 lunes. */
export function startOfWeek(s: ISODate, weekStart: 0 | 1): ISODate {
  const wd = weekday(s);
  const back = (wd - weekStart + 7) % 7;
  return addDays(s, -back);
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 8) + '01';
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const longFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const mediumFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const dayMonthFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const monthYearFmt = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
const weekdayShortFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const weekdayLongFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' });

/** "Lunes, 2 de noviembre de 2026" */
export function formatLong(s: ISODate): string {
  return capitalize(longFmt.format(parseISODate(s)));
}

export function formatMonthYear(s: ISODate): string {
  return capitalize(monthYearFmt.format(parseISODate(s)));
}

export function formatWeekdayShort(s: ISODate): string {
  return weekdayShortFmt.format(parseISODate(s)).replace('.', '');
}

export function formatWeekdayLong(s: ISODate): string {
  return capitalize(weekdayLongFmt.format(parseISODate(s)));
}

/** Etiqueta relativa corta: Hoy, Mañana, Ayer, "jue 5 nov". */
export function formatRelative(s: ISODate, today: ISODate = todayISO()): string {
  const diff = diffDays(s, today);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff > 1 && diff < 7) return formatWeekdayLong(s);
  const sameYear = s.slice(0, 4) === today.slice(0, 4);
  return sameYear ? mediumFmt.format(parseISODate(s)).replace(/\./g, '') : formatDayMonthYear(s);
}

export function formatDayMonth(s: ISODate): string {
  return dayMonthFmt.format(parseISODate(s)).replace(/\./g, '');
}

export function formatDayMonthYear(s: ISODate): string {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
    .format(parseISODate(s))
    .replace(/\./g, '');
}

export function formatTime(hhmm: string, format: '24h' | '12h'): string {
  if (format === '24h') return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

/** Nombres cortos de los días de la semana empezando por weekStart. */
export function weekdayHeaders(weekStart: 0 | 1): string[] {
  // 2023-01-01 fue domingo
  const base = '2023-01-01';
  return Array.from({ length: 7 }, (_, i) => capitalize(formatWeekdayShort(addDays(base, i + weekStart))));
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 19) return 'Good afternoon';
  return 'Good evening';
}
