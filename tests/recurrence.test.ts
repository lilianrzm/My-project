import { describe, expect, it } from 'vitest';
import { nextAfter, nextOccurrenceDate } from '../src/domain/recurrence';
import type { Recurrence } from '../src/domain/types';

const r = (p: Partial<Recurrence>): Recurrence => ({ freq: 'daily', interval: 1, weekdays: [], anchor: '2026-01-01', until: null, ...p });

describe('recurrencias', () => {
  it('diaria', () => {
    expect(nextAfter(r({}), '2026-01-01')).toBe('2026-01-02');
    expect(nextAfter(r({ interval: 3 }), '2026-01-01')).toBe('2026-01-04');
  });
  it('semanal con días concretos', () => {
    // 2026-11-02 es lunes
    const rec = r({ freq: 'weekly', weekdays: [1, 3], anchor: '2026-11-02' });
    expect(nextAfter(rec, '2026-11-02')).toBe('2026-11-04');
    expect(nextAfter(rec, '2026-11-04')).toBe('2026-11-09');
  });
  it('semanal cada 2 semanas', () => {
    const rec = r({ freq: 'weekly', interval: 2, anchor: '2026-11-02' });
    expect(nextAfter(rec, '2026-11-02')).toBe('2026-11-16');
  });
  it('mensual conserva el día 31', () => {
    const rec = r({ freq: 'monthly', anchor: '2026-01-31' });
    expect(nextAfter(rec, '2026-01-31')).toBe('2026-02-28');
    expect(nextAfter(rec, '2026-02-28')).toBe('2026-03-31');
  });
  it('anual en 29 de febrero', () => {
    const rec = r({ freq: 'yearly', anchor: '2028-02-29' });
    expect(nextAfter(rec, '2028-02-29')).toBe('2029-02-28');
    expect(nextAfter(rec, '2031-02-28')).toBe('2032-02-29');
  });
  it('no acumula ocurrencias vencidas', () => {
    expect(nextOccurrenceDate(r({}), '2026-10-01', '2026-11-02')).toBe('2026-11-02');
  });
  it('respeta la fecha de fin', () => {
    expect(nextOccurrenceDate(r({ until: '2026-01-01' }), '2026-01-01', '2026-01-01')).toBeNull();
  });
});
