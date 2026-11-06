import { useEffect, useState } from 'react';
import type { CustomField, CustomValue, Task } from '../domain/types';
import { fieldApplies } from '../domain/analytics';

/** Campos personalizados que aplican a la actividad (por ámbito). */
export function applicableFields(fields: CustomField[], task: Task): CustomField[] {
  return fields.filter((f) => (!f.archived && fieldApplies(f, task)) || (f.archived && task.customValues?.[f.id] !== undefined));
}

export function CustomFieldsEditor({
  fields,
  task,
  onChange,
}: {
  fields: CustomField[];
  task: Task;
  onChange: (values: Record<string, CustomValue>) => void;
}) {
  const list = applicableFields(fields, task);
  if (!list.length) return null;
  const set = (id: string, v: CustomValue | undefined) => {
    const next = { ...task.customValues };
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete next[id];
    else next[id] = v;
    onChange(next);
  };
  return (
    <div className="cf-list">
      {list.map((f) => (
        <FieldInput key={f.id} field={f} value={task.customValues?.[f.id]} onChange={(v) => set(f.id, v)} />
      ))}
    </div>
  );
}

function FieldInput({ field: f, value, onChange }: { field: CustomField; value: CustomValue | undefined; onChange: (v: CustomValue | undefined) => void }) {
  const id = `cf-${f.id}`;
  const disabled = f.archived;
  const label = (
    <label className="field-label" htmlFor={id} title={f.description || undefined}>
      {f.name}
      {f.archived && ' (archivado)'}
    </label>
  );
  const options = f.options.filter((o) => !o.archived || (Array.isArray(value) ? value.includes(o.id) : value === o.id));

  switch (f.type) {
    case 'checkbox':
      return (
        <div className="field-row">
          {label}
          <label className="switch">
            <input id={id} type="checkbox" disabled={disabled} checked={value === true} onChange={(e) => onChange(e.target.checked ? true : undefined)} />
            <span className="switch-track" aria-hidden="true" />
            {value === true ? 'Sí' : 'No'}
          </label>
        </div>
      );
    case 'select':
      return (
        <div className="field-row">
          {label}
          <select id={id} disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'multiselect': {
      const sel = Array.isArray(value) ? value : [];
      return (
        <div className="field-row field-row-top">
          <span className="field-label" id={id}>
            {f.name}
            {f.archived && ' (archivado)'}
          </span>
          <div className="chip-picker" role="group" aria-labelledby={id}>
            {options.map((o) => {
              const on = sel.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  className={`toggle-chip toggle-chip-sm${on ? ' is-on' : ''}`}
                  onClick={() => onChange(on ? sel.filter((x) => x !== o.id) : [...sel, o.id])}
                >
                  {o.label}
                </button>
              );
            })}
            {!options.length && <span className="small muted">Sin opciones configuradas</span>}
          </div>
        </div>
      );
    }
    case 'date':
      return (
        <div className="field-row">
          {label}
          <input id={id} type="date" disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)} />
        </div>
      );
    case 'number':
    case 'currency':
      return (
        <div className="field-row">
          {label}
          <NumberInput id={id} disabled={disabled} value={typeof value === 'number' ? value : undefined} currency={f.type === 'currency' ? f.currency : null} onChange={onChange} />
        </div>
      );
    default:
      return (
        <div className={`field-row${f.type === 'longtext' ? ' field-row-top' : ''}`}>
          {label}
          <TextInput id={id} disabled={disabled} long={f.type === 'longtext'} value={typeof value === 'string' ? value : ''} onChange={onChange} />
        </div>
      );
  }
}

function TextInput({ id, value, long, disabled, onChange }: { id: string; value: string; long: boolean; disabled: boolean; onChange: (v: string | undefined) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onChange(v.trim() || undefined);
  return long ? (
    <textarea id={id} rows={3} disabled={disabled} maxLength={20000} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} />
  ) : (
    <input id={id} disabled={disabled} maxLength={500} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

function NumberInput({ id, value, currency, disabled, onChange }: { id: string; value: number | undefined; currency: string | null; disabled: boolean; onChange: (v: number | undefined) => void }) {
  const [v, setV] = useState(value === undefined ? '' : String(value));
  useEffect(() => setV(value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    const raw = v.replace(/[^\d.,-]/g, '').replace(/,/g, '');
    if (!raw) return value !== undefined && onChange(undefined);
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(currency ? Math.round(n * 100) / 100 : n);
    else setV(value === undefined ? '' : String(value));
  };
  return (
    <div className="inline-gap">
      {currency && <span className="muted small">{currency}</span>}
      <input id={id} disabled={disabled} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </div>
  );
}
