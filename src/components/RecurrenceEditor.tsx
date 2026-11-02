import { useId } from 'react';
import type { ISODate, Recurrence, RecurrenceFreq } from '../domain/types';
import { describeRecurrence } from '../domain/recurrence';
import { weekday } from '../domain/dates';

const FREQS: { value: RecurrenceFreq | 'none'; label: string }[] = [
  { value: 'none', label: 'No se repite' },
  { value: 'daily', label: 'Diaria' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'yearly', label: 'Anual' },
];

const UNIT: Record<RecurrenceFreq, string> = { daily: 'día(s)', weekly: 'semana(s)', monthly: 'mes(es)', yearly: 'año(s)' };
const DAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function RecurrenceEditor({
  value,
  dueDate,
  today,
  weekStart,
  onChange,
}: {
  value: Recurrence | null;
  dueDate: ISODate | null;
  today: ISODate;
  weekStart: 0 | 1;
  onChange: (rec: Recurrence | null, dueDate?: ISODate) => void;
}) {
  const id = useId();
  const anchor = dueDate ?? today;
  const order = weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  const setFreq = (f: RecurrenceFreq | 'none') => {
    if (f === 'none') return onChange(null);
    const rec: Recurrence = {
      freq: f,
      interval: value?.interval ?? 1,
      weekdays: f === 'weekly' ? (value?.weekdays?.length ? value.weekdays : [weekday(anchor)]) : [],
      anchor,
      until: value?.until ?? null,
    };
    // Una tarea recurrente necesita fecha: si no tiene, empieza hoy.
    onChange(rec, dueDate ? undefined : today);
  };

  return (
    <div className="recurrence">
      <div className="field-row">
        <label className="field-label" htmlFor={`${id}-freq`}>
          Repetir
        </label>
        <select id={`${id}-freq`} value={value?.freq ?? 'none'} onChange={(e) => setFreq(e.target.value as RecurrenceFreq | 'none')}>
          {FREQS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {value && (
        <>
          <div className="field-row">
            <label className="field-label" htmlFor={`${id}-int`}>
              Cada
            </label>
            <div className="inline-gap">
              <input
                id={`${id}-int`}
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                className="input-num"
                value={value.interval}
                onChange={(e) => {
                  const n = Math.min(365, Math.max(1, Number(e.target.value) || 1));
                  onChange({ ...value, interval: n });
                }}
              />
              <span className="muted">{UNIT[value.freq]}</span>
            </div>
          </div>
          {value.freq === 'weekly' && (
            <div className="field-row">
              <span className="field-label" id={`${id}-wd`}>
                Días
              </span>
              <div className="weekday-picker" role="group" aria-labelledby={`${id}-wd`}>
                {order.map((d) => {
                  const on = value.weekdays?.includes(d) ?? false;
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={DAY_NAMES[d]}
                      className={`wd${on ? ' is-on' : ''}`}
                      onClick={() => {
                        const set = new Set(value.weekdays ?? []);
                        if (on) set.delete(d);
                        else set.add(d);
                        if (set.size === 0) return; // al menos un día
                        onChange({ ...value, weekdays: [...set].sort() });
                      }}
                    >
                      {DAYS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="field-row">
            <label className="field-label" htmlFor={`${id}-until`}>
              Hasta
            </label>
            <div className="inline-gap">
              <input
                id={`${id}-until`}
                type="date"
                value={value.until ?? ''}
                min={anchor}
                onChange={(e) => onChange({ ...value, until: e.target.value || null })}
              />
              {value.until && (
                <button type="button" className="btn btn-link btn-sm" onClick={() => onChange({ ...value, until: null })}>
                  Sin fin
                </button>
              )}
            </div>
          </div>
          <p className="hint">
            {describeRecurrence(value)}. Al completarla se crea la siguiente ocurrencia; la completada queda en tu historial.
          </p>
        </>
      )}
    </div>
  );
}
