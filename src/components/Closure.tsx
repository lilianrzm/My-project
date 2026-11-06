import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Paperclip } from 'lucide-react';
import { db } from '../db/db';
import * as repo from '../db/repo';
import { useData } from '../state/data';
import { useFeedback, useUI } from '../state/ui';
import type { Activity, Task } from '../domain/types';
import { compliesLabel, daysFromStart, daysToConclude, delayDays } from '../domain/analytics';
import { formatDayMonthYear, formatTimestamp } from '../domain/dates';
import { localDateOf } from '../domain/selectors';
import { errorMessage } from '../hooks/useTaskActions';
import { Modal } from './ui';
import { describeAttachment } from './Attachments';

const plural = (n: number | null, one: string, many: string) => (n === null ? 'Sin datos suficientes' : `${n} ${n === 1 ? one : many}`);

/** Tiempos de atención calculados (días calendario, no horas trabajadas). */
export function TimeFacts({ task }: { task: Task }) {
  const { today } = useUI();
  return (
    <dl className="facts">
      <div>
        <dt>Desde la creación</dt>
        <dd>{plural(daysToConclude(task), 'día', 'días')}</dd>
      </div>
      <div>
        <dt>Desde el inicio</dt>
        <dd>{task.startDate ? plural(daysFromStart(task), 'día', 'días') : 'Sin fecha de inicio'}</dd>
      </div>
      <div>
        <dt>Retraso</dt>
        <dd>{task.dueDate ? plural(delayDays(task, today), 'día', 'días') : 'Sin vencimiento'}</dd>
      </div>
      <div>
        <dt>Plazo</dt>
        <dd>{compliesLabel(task, today)}</dd>
      </div>
    </dl>
  );
}

/** Resumen del cierre dentro del panel de detalles. */
export function ClosureSummary({ task }: { task: Task }) {
  const { settings } = useData();
  const { openClosure } = useUI();
  if (task.status === 'cancelled') return <p className="muted small">Actividad cancelada{task.cancelledAt ? ` el ${formatTimestamp(task.cancelledAt)}` : ''}. No cuenta como concluida.</p>;
  if (task.status !== 'completed') {
    return <p className="muted small">Al completar la actividad podrás registrar el resultado, tipo de atención, observaciones y evidencia.</p>;
  }
  const c = task.closure;
  const result = c?.resultId ? settings.closureResults.find((o) => o.id === c.resultId)?.label : null;
  const type = c?.attentionTypeId ? settings.attentionTypes.find((o) => o.id === c.attentionTypeId)?.label : null;
  return (
    <div className="closure-summary">
      <dl className="facts">
        <div>
          <dt>Marcada completada</dt>
          <dd>{task.completedAt ? formatTimestamp(task.completedAt) : '—'}</dd>
        </div>
        <div>
          <dt>Fecha efectiva</dt>
          <dd>{c?.effectiveDate ? formatDayMonthYear(c.effectiveDate) : 'No registrada'}</dd>
        </div>
        <div>
          <dt>Resultado</dt>
          <dd>{result ?? 'No registrado'}</dd>
        </div>
        <div>
          <dt>Tipo de atención</dt>
          <dd>{type ?? 'No registrado'}</dd>
        </div>
        {c?.responsible && (
          <div>
            <dt>Responsable</dt>
            <dd>{c.responsible}</dd>
          </div>
        )}
        {c?.folio && (
          <div>
            <dt>Folio</dt>
            <dd>{c.folio}</dd>
          </div>
        )}
      </dl>
      {c?.observations && <p className="closure-obs">{c.observations}</p>}
      <TimeFacts task={task} />
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => openClosure(task.id)}>
        {c ? 'Editar registro de cierre' : 'Registrar cierre'}
      </button>
    </div>
  );
}

/** Panel breve de cierre: todos los campos son opcionales. */
export function ClosureDialog() {
  const { closureTaskId, openClosure } = useUI();
  const { tasks, settings } = useData();
  const { toast } = useFeedback();
  const task = closureTaskId ? tasks.find((t) => t.id === closureTaskId) : undefined;
  const attachments = useLiveQuery(() => (closureTaskId ? db.attachments.where('taskId').equals(closureTaskId).toArray() : []), [closureTaskId]) ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const open = !!task && task.status === 'completed';

  const [resultId, setResultId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [responsible, setResponsible] = useState('');
  const [folio, setFolio] = useState('');
  const [observations, setObservations] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const taskId = task?.id;
  const completedAt = task?.completedAt;
  useEffect(() => {
    if (!task || !open) return;
    const c = task.closure;
    setResultId(c?.resultId ?? '');
    setTypeId(c?.attentionTypeId ?? '');
    // Fecha efectiva: la registrada; si es el primer registro, se propone la de finalización
    setEffectiveDate(c?.effectiveDate ?? (task.completedAt ? localDateOf(task.completedAt) : ''));
    setResponsible(c?.responsible ?? task.responsible);
    setFolio(c?.folio ?? task.folio);
    setObservations(c?.observations ?? '');
    setEvidence(c?.evidenceIds ?? []);
    // Solo al abrir (o cuando llega la fecha de finalización de esa actividad)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, completedAt, open]);
  const close = () => openClosure(null);
  const first = !task?.closure;

  const save = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await repo.saveClosure(task.id, {
        resultId: resultId || null,
        attentionTypeId: typeId || null,
        effectiveDate: effectiveDate || null,
        responsible: responsible.trim(),
        folio: folio.trim(),
        observations: observations.trim(),
        evidenceIds: evidence,
      });
      toast({ message: first ? 'Registro de cierre guardado' : 'Registro de cierre actualizado', tone: 'success' });
      close();
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const addEvidence = async (files: FileList | null) => {
    if (!task || !files?.length) return;
    for (const f of Array.from(files)) {
      try {
        const att = await repo.addAttachment(task.id, f);
        setEvidence((e) => [...e, att.id]);
        void describeAttachment(att);
      } catch (e) {
        toast({ message: errorMessage(e), tone: 'error' });
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const results = settings.closureResults.filter((o) => !o.archived || o.id === resultId);
  const types = settings.attentionTypes.filter((o) => !o.archived || o.id === typeId);

  return (
    <Modal open={open} onClose={close} title={first ? 'Registro de cierre' : 'Editar registro de cierre'} size="md" className="closure-modal">
      {task && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="closure-lead">
            <CheckCircle2 size={18} aria-hidden="true" /> <strong>{task.title}</strong>
            <span className="muted small"> · completada {task.completedAt ? formatTimestamp(task.completedAt) : ''}</span>
          </p>
          <p className="muted small">Todos los campos son opcionales: puedes guardar ahora o completar el registro más tarde desde la actividad.</p>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Resultado de atención</span>
              <select value={resultId} onChange={(e) => setResultId(e.target.value)}>
                <option value="">Sin registrar</option>
                {results.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Tipo de atención</span>
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">Sin registrar</option>
                {types.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Fecha efectiva de atención</span>
              <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Responsable</span>
              <input value={responsible} maxLength={120} onChange={(e) => setResponsible(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Folio o referencia</span>
              <input value={folio} maxLength={120} onChange={(e) => setFolio(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Observaciones</span>
            <textarea rows={3} maxLength={20000} value={observations} onChange={(e) => setObservations(e.target.value)} />
          </label>
          <fieldset className="field">
            <legend className="field-label">Evidencia documental</legend>
            {attachments.length > 0 ? (
              <ul className="evidence-list">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <label className="check-line check-line-olive">
                      <input
                        type="checkbox"
                        checked={evidence.includes(a.id)}
                        onChange={(e) => setEvidence((list) => (e.target.checked ? [...list, a.id] : list.filter((x) => x !== a.id)))}
                      />
                      {a.name}
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">La actividad no tiene documentos adjuntos.</p>
            )}
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => fileRef.current?.click()}>
              <Paperclip size={15} aria-hidden="true" /> Adjuntar evidencia
            </button>
            <input ref={fileRef} type="file" multiple accept={repo.ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void addEvidence(e.target.files)} />
          </fieldset>
          <div>
            <span className="field-label">Tiempo y plazo (calculados)</span>
            <TimeFacts task={{ ...task, closure: { ...(task.closure ?? { resultId: null, attentionTypeId: null, responsible: '', observations: '', folio: '', evidenceIds: [], recordedAt: '', updatedAt: '' }), effectiveDate: effectiveDate || null } }} />
          </div>
          <div className="row-end">
            <button type="button" className="btn btn-ghost" onClick={close}>
              {first ? 'Omitir por ahora' : 'Cancelar'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Guardar registro
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const EVENT_LABEL: Record<Activity['type'], string> = {
  created: 'Creada',
  completed: 'Completada',
  reopened: 'Reabierta',
  deleted: 'Eliminada',
  updated: 'Modificada',
  cancelled: 'Cancelada',
  status: 'Cambio de estado',
  responsible: 'Cambio de responsable',
  dueDate: 'Cambio de vencimiento',
  closure: 'Registro de cierre',
};

export function HistoryList({ taskId }: { taskId: string }) {
  const events = useLiveQuery(() => db.activity.where('taskId').equals(taskId).toArray(), [taskId]) ?? [];
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  if (!sorted.length) return <p className="muted small">Sin eventos registrados.</p>;
  return (
    <ol className="history">
      {sorted.slice(0, 50).map((e) => (
        <li key={e.id}>
          <span className="history-type">{EVENT_LABEL[e.type]}</span>
          <span className="small muted">{formatTimestamp(e.at)}</span>
          {e.changes?.map((c, i) => (
            <span key={i} className="history-change small">
              {c.field}: {c.from ?? '—'} → {c.to ?? '—'}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}
