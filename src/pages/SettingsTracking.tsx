import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useData } from '../state/data';
import { useFeedback } from '../state/ui';
import type { CustomField, CustomFieldType, FieldScope, Option } from '../domain/types';
import { FIELD_TYPE_LABEL } from '../domain/types';
import { newId } from '../domain/validate';
import * as repo from '../db/repo';
import { errorMessage } from '../hooks/useTaskActions';
import { Modal } from '../components/ui';

/* ------------------------------------------------------------------ */
/* Seguimiento: registro de cierre y sus opciones                        */
/* ------------------------------------------------------------------ */

export function TrackingCard() {
  const { settings } = useData();
  const { toast } = useFeedback();
  const save = (patch: Parameters<typeof repo.saveSettings>[0]) => repo.saveSettings(patch).catch((e) => toast({ message: errorMessage(e), tone: 'error' }));
  return (
    <section className="card settings-card" aria-labelledby="tr-title">
      <h2 id="tr-title" className="card-title">
        Seguimiento y cierre
      </h2>
      <label className="switch">
        <input type="checkbox" checked={settings.closurePrompt} onChange={(e) => void save({ closurePrompt: e.target.checked })} />
        <span className="switch-track" aria-hidden="true" />
        Mostrar el registro de cierre al completar una actividad
      </label>
      <p className="muted small">
        El estado <strong>Completada</strong> es distinto del <strong>resultado de atención</strong>: una actividad puede concluirse aunque su
        resultado no haya sido favorable. Las actividades <strong>canceladas</strong> no cuentan como concluidas.
      </p>
      <div className="options-grid">
        <OptionsEditor title="Resultados de atención" options={settings.closureResults} onChange={(closureResults) => void save({ closureResults })} />
        <OptionsEditor title="Tipos de atención" options={settings.attentionTypes} onChange={(attentionTypes) => void save({ attentionTypes })} />
      </div>
    </section>
  );
}

/**
 * Editor de opciones. Renombrar conserva el id (los registros históricos siguen enlazados).
 * Las opciones no se borran: se archivan, para no romper registros que ya las usan.
 */
export function OptionsEditor({ title, options, onChange }: { title: string; options: Option[]; onChange: (o: Option[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...options, { id: newId(), label: t }]);
    setText('');
  };
  return (
    <fieldset className="options-editor">
      <legend className="field-label">{title}</legend>
      <ul className="opt-list">
        {options.map((o, i) => (
          <li key={o.id} className={o.archived ? 'is-archived' : ''}>
            <OptionLabel value={o.label} onSave={(label) => onChange(options.map((x) => (x.id === o.id ? { ...x, label } : x)))} label={`Opción ${i + 1} de ${title}`} />
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              aria-label={`Subir ${o.label}`}
              disabled={i === 0}
              onClick={() => {
                const a = [...options];
                [a[i - 1], a[i]] = [a[i], a[i - 1]];
                onChange(a);
              }}
            >
              <ArrowUp size={15} />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              aria-label={o.archived ? `Restaurar ${o.label}` : `Archivar ${o.label}`}
              title={o.archived ? 'Restaurar' : 'Archivar (no se ofrecerá en nuevos registros)'}
              onClick={() => onChange(options.map((x) => (x.id === o.id ? { ...x, archived: !x.archived || undefined } : x)))}
            >
              {o.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            </button>
          </li>
        ))}
      </ul>
      <div className="add-sub">
        <Plus size={16} aria-hidden="true" />
        <input
          aria-label={`Nueva opción para ${title}`}
          placeholder="Añadir opción"
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        {text.trim() && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={add}>
            Añadir
          </button>
        )}
      </div>
    </fieldset>
  );
}

function OptionLabel({ value, onSave, label }: { value: string; onSave: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="subtask-input"
      aria-label={label}
      value={v}
      maxLength={120}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const t = v.trim();
        if (!t) setV(value);
        else if (t !== value) onSave(t);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Campos personalizados                                                */
/* ------------------------------------------------------------------ */

export function CustomFieldsCard() {
  const { customFields, categories, projects } = useData();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<CustomField | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const list = customFields.filter((f) => showArchived || !f.archived);
  const archivedCount = customFields.filter((f) => f.archived).length;

  const scopeLabel = (s: FieldScope) =>
    s.kind === 'all'
      ? 'Todas las actividades'
      : s.kind === 'category'
        ? `Categoría: ${categories.find((c) => c.id === s.id)?.name ?? '(eliminada)'}`
        : `Proyecto: ${projects.find((p) => p.id === s.id)?.name ?? '(eliminado)'}`;

  const move = async (i: number, dir: -1 | 1) => {
    const ids = customFields.map((f) => f.id);
    const a = ids.indexOf(list[i].id);
    const b = ids.indexOf(list[i + dir]?.id);
    if (a < 0 || b < 0) return;
    [ids[a], ids[b]] = [ids[b], ids[a]];
    await repo.reorderCustomFields(ids);
  };

  const remove = async (f: CustomField) => {
    const n = await repo.countFieldValues(f.id);
    const ok = await confirm({
      title: `Eliminar “${f.name}”`,
      message: n
        ? `Se borrarán sus valores en ${n} actividad(es). Si quieres conservar la información, archívalo en lugar de eliminarlo.`
        : 'El campo no tiene valores registrados.',
      confirmLabel: 'Eliminar definitivamente',
      tone: 'danger',
    });
    if (ok) await repo.deleteCustomField(f.id).catch((e) => toast({ message: errorMessage(e), tone: 'error' }));
  };

  return (
    <section className="card settings-card" aria-labelledby="cf-title">
      <h2 id="cf-title" className="card-title">
        Campos personalizados
      </h2>
      <p className="muted small">
        Registra información adicional en tus actividades (por ejemplo, “Tipo de atención” o “Importe”). Aparecen en el panel de detalles y se
        pueden usar en Análisis, filtros y la exportación a Excel.
      </p>
      {list.length === 0 ? (
        <p className="muted small">Aún no hay campos personalizados.</p>
      ) : (
        <ul className="manage-list">
          {list.map((f, i) => (
            <li key={f.id} className={`manage-item${f.archived ? ' is-archived' : ''}`}>
              <span className="manage-name">
                {f.name}
                <span className="muted small"> · {FIELD_TYPE_LABEL[f.type]}</span>
              </span>
              <span className="muted small">{f.archived ? 'Archivado' : scopeLabel(f.scope)}</span>
              <div className="manage-actions">
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Subir ${f.name}`} disabled={i === 0} onClick={() => void move(i, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Bajar ${f.name}`} disabled={i === list.length - 1} onClick={() => void move(i, 1)}>
                  <ArrowDown size={16} />
                </button>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Editar ${f.name}`} onClick={() => setEditing(f)}>
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={f.archived ? `Restaurar ${f.name}` : `Archivar ${f.name}`}
                  title={f.archived ? 'Restaurar' : 'Archivar (conserva los datos)'}
                  onClick={() => void repo.updateCustomField(f.id, { archived: !f.archived })}
                >
                  {f.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Eliminar ${f.name}`} onClick={() => void remove(f)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="row-wrap">
        <button type="button" className="btn btn-quiet" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden="true" /> Nuevo campo
        </button>
        {archivedCount > 0 && (
          <button type="button" className="btn btn-link" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Ocultar archivados' : `Mostrar archivados (${archivedCount})`}
          </button>
        )}
      </div>
      <FieldForm field={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

const TYPES = Object.keys(FIELD_TYPE_LABEL) as CustomFieldType[];

function FieldForm({ field, onClose }: { field: CustomField | 'new' | null; onClose: () => void }) {
  const { categories, projects } = useData();
  const { toast, confirm } = useFeedback();
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [scopeKind, setScopeKind] = useState<FieldScope['kind']>('all');
  const [scopeId, setScopeId] = useState('');
  const [currency, setCurrency] = useState('MXN');
  const [optText, setOptText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!field) return;
    const f = field === 'new' ? null : field;
    setName(f?.name ?? '');
    setType(f?.type ?? 'text');
    setDescription(f?.description ?? '');
    setOptions(f?.options ?? []);
    setScopeKind(f?.scope.kind ?? 'all');
    setScopeId(f && f.scope.kind !== 'all' ? f.scope.id : '');
    setCurrency(f?.currency ?? 'MXN');
    setOptText('');
    setError('');
  }, [field]);

  const needsOptions = type === 'select' || type === 'multiselect';

  const submit = async () => {
    if (!name.trim()) return setError('El campo necesita un nombre.');
    if (needsOptions && !options.length) return setError('Añade al menos una opción.');
    if (scopeKind !== 'all' && !scopeId) return setError(scopeKind === 'category' ? 'Elige una categoría.' : 'Elige un proyecto.');
    const scope: FieldScope = scopeKind === 'all' ? { kind: 'all' } : { kind: scopeKind, id: scopeId };
    const data = { name: name.trim(), type, description: description.trim(), options, scope, currency };
    try {
      if (field === 'new') await repo.createCustomField(data);
      else if (field) {
        let discard = false;
        if (type !== field.type && !repo.isSafeConversion(field.type, type)) {
          const n = await repo.countFieldValues(field.id);
          if (n) {
            const ok = await confirm({
              title: 'Cambiar el tipo del campo',
              message: `Pasar de “${FIELD_TYPE_LABEL[field.type]}” a “${FIELD_TYPE_LABEL[type]}” no conserva los valores: se borrarán en ${n} actividad(es). Considera crear un campo nuevo y archivar este.`,
              confirmLabel: 'Cambiar y borrar valores',
              tone: 'danger',
            });
            if (!ok) return;
          }
          discard = true;
        }
        await repo.updateCustomField(field.id, data, discard);
      }
      toast({ message: 'Campo guardado', tone: 'success' });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const addOpt = () => {
    const t = optText.trim();
    if (!t) return;
    setOptions([...options, { id: newId(), label: t }]);
    setOptText('');
  };

  return (
    <Modal open={!!field} onClose={onClose} title={field === 'new' ? 'Nuevo campo personalizado' : 'Editar campo'}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Nombre</span>
            <input autoFocus value={name} maxLength={120} placeholder="Ej. Tipo de atención" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Tipo</span>
            <select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {field && field !== 'new' && type !== field.type && (
          <p className={`small ${repo.isSafeConversion(field.type, type) ? 'muted' : 'text-danger'}`}>
            {repo.isSafeConversion(field.type, type) ? 'Este cambio conserva los valores existentes.' : 'Este cambio no puede conservar los valores existentes.'}
          </p>
        )}
        <label className="field">
          <span className="field-label">Descripción (opcional)</span>
          <input value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {type === 'currency' && (
          <label className="field">
            <span className="field-label">Moneda</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {['MXN', 'USD', 'EUR'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        {needsOptions && (
          <fieldset className="field">
            <legend className="field-label">Opciones</legend>
            <ul className="opt-list">
              {options.map((o) => (
                <li key={o.id}>
                  <OptionLabel value={o.label} label={`Opción ${o.label}`} onSave={(label) => setOptions(options.map((x) => (x.id === o.id ? { ...x, label } : x)))} />
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Quitar ${o.label}`} onClick={() => setOptions(options.filter((x) => x.id !== o.id))}>
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="add-sub">
              <Plus size={16} aria-hidden="true" />
              <input
                aria-label="Nueva opción"
                placeholder="Añadir opción y pulsar Enter"
                value={optText}
                maxLength={120}
                onChange={(e) => setOptText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOpt();
                  }
                }}
              />
            </div>
          </fieldset>
        )}
        <div className="field-grid">
          <label className="field">
            <span className="field-label">Se aplica a</span>
            <select
              value={scopeKind}
              onChange={(e) => {
                setScopeKind(e.target.value as FieldScope['kind']);
                setScopeId('');
              }}
            >
              <option value="all">Todas las actividades</option>
              <option value="category">Una categoría</option>
              <option value="project">Un proyecto</option>
            </select>
          </label>
          {scopeKind !== 'all' && (
            <label className="field">
              <span className="field-label">{scopeKind === 'category' ? 'Categoría' : 'Proyecto'}</span>
              <select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                <option value="">Elegir…</option>
                {(scopeKind === 'category' ? categories : projects).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Guardar campo
          </button>
        </div>
      </form>
    </Modal>
  );
}
