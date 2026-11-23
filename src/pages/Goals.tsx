import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Archive, ArchiveRestore, CalendarDays, Minus, MoreHorizontal, Pencil, Plus, RotateCcw, Target, Trash2, Trophy } from 'lucide-react';
import { useData } from '../state/data';
import { useFeedback, useUI } from '../state/ui';
import * as repo from '../db/repo';
import type { Goal, GoalKind } from '../domain/types';
import { SWATCHES } from '../domain/types';
import { diffDays, formatDayMonthYear, formatTimestamp } from '../domain/dates';
import { goalProgress } from '../domain/personal';
import { celebrate } from '../celebrate';
import { errorMessage } from '../hooks/useTaskActions';
import { TaskList } from '../components/TaskList';
import { EmptyState, Menu, Modal, PageHeader, ProgressRing, Section } from '../components/ui';
import { AreaChips, EmojiPicker } from '../components/Pickers';
import { ColorPicker } from './Projects';

const KIND_LABEL: Record<GoalKind, string> = { count: 'Un número', tasks: 'Con pasos', check: 'Sí / no' };
const KIND_HINT: Record<GoalKind, string> = {
  count: 'Por ejemplo: leer 12 libros, ahorrar $20,000, correr 100 km.',
  tasks: 'Divide la meta en pasos (tareas) y avanza al completarlos.',
  check: 'Algo que se logra o no: correr un 10K, aprender a nadar.',
};

function useAchieve() {
  const { toast } = useFeedback();
  return async (g: Goal, patch: Partial<Goal>) => {
    try {
      const { achieved } = await repo.updateGoal(g.id, patch);
      if (achieved) {
        celebrate({ amount: 'big' });
        toast({ message: `¡Meta lograda! ${g.emoji} ${g.title} 🏆`, tone: 'success', duration: 6000 });
      }
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'error' });
    }
  };
}

export function GoalsPage() {
  const { goals } = useData();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const active = goals.filter((g) => g.status === 'active');
  const achieved = goals.filter((g) => g.status === 'achieved').sort((a, b) => (b.achievedAt ?? '').localeCompare(a.achievedAt ?? ''));
  const archived = goals.filter((g) => g.status === 'archived');

  return (
    <div className="page">
      <PageHeader
        eyebrow="Lo que quiero lograr"
        title="Metas"
        subtitle={active.length ? `${active.length} en camino${achieved.length ? ` · ${achieved.length} logradas 🏆` : ''}` : 'Pon nombre a lo que sueñas y avanza paso a paso.'}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={17} aria-hidden="true" /> Nueva meta
          </button>
        }
      />

      {goals.length === 0 && (
        <EmptyState
          icon={<Target size={28} />}
          title="¿Qué te gustaría lograr?"
          action={
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={17} aria-hidden="true" /> Crear mi primera meta
            </button>
          }
        >
          Leer más, ahorrar para un viaje, correr tu primer 10K… Una meta clara hace que cada día cuente.
        </EmptyState>
      )}

      {active.length > 0 && (
        <ul className="goal-grid">
          {active.map((g) => (
            <li key={g.id}>
              <GoalCard goal={g} onEdit={() => setEditing(g)} />
            </li>
          ))}
        </ul>
      )}

      {achieved.length > 0 && (
        <Section title="Logradas 🏆" count={achieved.length}>
          <ul className="goal-grid">
            {achieved.map((g) => (
              <li key={g.id}>
                <GoalCard goal={g} onEdit={() => setEditing(g)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {archived.length > 0 && (
        <button type="button" className="btn btn-link" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Ocultar archivadas' : `Metas archivadas (${archived.length})`}
        </button>
      )}
      {showArchived && (
        <ul className="manage-list">
          {archived.map((g) => (
            <li key={g.id} className="manage-item">
              <span className="manage-name">
                {g.emoji} {g.title}
              </span>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void repo.updateGoal(g.id, { status: 'active' })}>
                <ArchiveRestore size={15} aria-hidden="true" /> Reactivar
              </button>
            </li>
          ))}
        </ul>
      )}

      <GoalForm goal={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function GoalCard({ goal: g, onEdit }: { goal: Goal; onEdit: () => void }) {
  const { tasks, categoryById } = useData();
  const { today, openQuickAdd } = useUI();
  const { toast, confirm } = useFeedback();
  const achieve = useAchieve();
  const [showSteps, setShowSteps] = useState(false);
  const p = goalProgress(g, tasks);
  const area = g.categoryId ? categoryById.get(g.categoryId) : undefined;
  const done = g.status === 'achieved';
  const days = g.dueDate ? diffDays(g.dueDate, today) : null;
  const steps = useMemo(() => tasks.filter((t) => t.goalId === g.id && t.status !== 'cancelled').sort((a, b) => (a.status === b.status ? a.order - b.order : a.status === 'open' ? -1 : 1)), [tasks, g.id]);

  const remove = async () => {
    const ok = await confirm({ title: `Eliminar “${g.title}”`, message: steps.length ? 'Sus pasos (tareas) se conservarán sin vínculo a la meta.' : undefined, confirmLabel: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    const d = await repo.deleteGoal(g.id);
    if (d) toast({ message: 'Meta eliminada', action: { label: 'Deshacer', run: () => repo.restoreGoal(d) } });
  };

  return (
    <article className={`goal-card${done ? ' is-achieved' : ''}`} style={{ '--g': g.color } as CSSProperties} aria-label={g.title}>
      <div className="goal-head">
        <span className="goal-emoji" aria-hidden="true">
          {g.emoji}
        </span>
        <div className="goal-titles">
          <h3 className="goal-title">{g.title}</h3>
          {area && (
            <span className="tag tag-cat" style={{ '--tag-color': area.color } as CSSProperties}>
              {area.emoji} {area.name}
            </span>
          )}
        </div>
        <Menu
          label={`Opciones de ${g.title}`}
          trigger={<MoreHorizontal size={18} />}
          items={[
            { label: 'Editar', icon: <Pencil size={16} />, onSelect: onEdit },
            done
              ? { label: 'Volver a “en camino”', icon: <RotateCcw size={16} />, onSelect: () => void repo.updateGoal(g.id, { status: 'active', ...(g.kind === 'count' && g.current >= g.target ? { current: Math.max(0, g.target - 1) } : {}) }) }
              : { label: 'Archivar', icon: <Archive size={16} />, onSelect: () => void repo.updateGoal(g.id, { status: 'archived' }) },
            'sep',
            { label: 'Eliminar', icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove() },
          ]}
        />
      </div>

      <div className="goal-progress">
        <div className="goal-ring">
          <ProgressRing value={p.pct / 100} size={64} label={`Progreso: ${p.pct}%`} />
          <span className="goal-pct">{done ? '🏆' : `${p.pct}%`}</span>
        </div>
        <div className="goal-meta">
          <span className="goal-label">{p.label}</span>
          {done && g.achievedAt && <span className="small muted">Lograda el {formatTimestamp(g.achievedAt).split(',')[0]}</span>}
          {!done && g.dueDate && (
            <span className={`small ${days! < 0 ? 'text-danger' : 'muted'}`}>
              <CalendarDays size={13} aria-hidden="true" /> {formatDayMonthYear(g.dueDate)}
              {days! >= 0 ? ` · faltan ${days} día${days === 1 ? '' : 's'}` : ' · ¡aún puedes lograrla!'}
            </span>
          )}
        </div>
      </div>

      {g.why && <p className="goal-why">“{g.why}”</p>}

      {!done && (
        <div className="goal-actions">
          {g.kind === 'count' && (
            <>
              <button type="button" className="icon-btn icon-btn-bordered" aria-label={`Restar 1 a ${g.title}`} onClick={() => void achieve(g, { current: Math.max(0, g.current - 1) })}>
                <Minus size={16} />
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void achieve(g, { current: g.current + 1 })}>
                <Plus size={15} aria-hidden="true" /> 1
              </button>
              <CountInput goal={g} onSet={(n) => void achieve(g, { current: n })} />
            </>
          )}
          {g.kind === 'tasks' && (
            <>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => openQuickAdd({ goalId: g.id, categoryId: g.categoryId })}>
                <Plus size={15} aria-hidden="true" /> Añadir paso
              </button>
              {steps.length > 0 && (
                <button type="button" className="btn btn-link btn-sm" aria-expanded={showSteps} onClick={() => setShowSteps((v) => !v)}>
                  {showSteps ? 'Ocultar pasos' : `Ver pasos (${steps.length})`}
                </button>
              )}
            </>
          )}
          {(g.kind === 'check' || p.ready) && (
            <button type="button" className="btn btn-primary btn-sm btn-celebrate" onClick={() => void achieve(g, { status: 'achieved' })}>
              <Trophy size={15} aria-hidden="true" /> ¡Lo logré!
            </button>
          )}
        </div>
      )}
      {showSteps && g.kind === 'tasks' && <TaskList tasks={steps} showProject={false} label={`Pasos de ${g.title}`} />}
    </article>
  );
}

function CountInput({ goal, onSet }: { goal: Goal; onSet: (n: number) => void }) {
  const [v, setV] = useState(String(goal.current));
  useEffect(() => setV(String(goal.current)), [goal.current]);
  return (
    <label className="count-input small muted">
      Llevo
      <input
        inputMode="decimal"
        value={v}
        aria-label={`Valor actual de ${goal.title}`}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Number(v.replace(',', '.'));
          if (Number.isFinite(n) && n >= 0 && n !== goal.current) onSet(n);
          else setV(String(goal.current));
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

function GoalForm({ goal, onClose }: { goal: Goal | 'new' | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<GoalKind>('count');
  const [target, setTarget] = useState('12');
  const [unit, setUnit] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [why, setWhy] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const [color, setColor] = useState(SWATCHES[0].value);
  const [area, setArea] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!goal) return;
    const g = goal === 'new' ? null : goal;
    setTitle(g?.title ?? '');
    setKind(g?.kind ?? 'count');
    setTarget(String(g?.target ?? 12));
    setUnit(g?.unit ?? '');
    setDueDate(g?.dueDate ?? '');
    setWhy(g?.why ?? '');
    setEmoji(g?.emoji ?? '🎯');
    setColor(g?.color ?? SWATCHES[0].value);
    setArea(g?.categoryId ?? null);
    setError('');
  }, [goal]);

  const submit = async () => {
    if (!title.trim()) return setError('Ponle nombre a tu meta.');
    const t = Number(target.replace(',', '.'));
    if (kind === 'count' && (!Number.isFinite(t) || t <= 0)) return setError('Indica un número objetivo mayor que cero.');
    const data = { title: title.trim(), kind, target: kind === 'count' ? t : 1, unit: unit.trim(), dueDate: dueDate || null, why: why.trim(), emoji, color, categoryId: area };
    try {
      if (goal === 'new') await repo.createGoal(data);
      else if (goal) await repo.updateGoal(goal.id, data);
      toast({ message: goal === 'new' ? '¡Meta creada! Vamos por ella 💫' : 'Meta actualizada', tone: 'success' });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal open={!!goal} onClose={onClose} title={goal === 'new' ? 'Nueva meta' : 'Editar meta'}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span className="field-label">¿Qué quieres lograr?</span>
          <input autoFocus value={title} maxLength={200} placeholder="Ej. Leer 12 libros este año" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <fieldset className="field">
          <legend className="field-label">¿Cómo medirás tu avance?</legend>
          <div className="segmented" role="radiogroup" aria-label="Tipo de meta">
            {(Object.keys(KIND_LABEL) as GoalKind[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={`seg${kind === k ? ' is-on' : ''}`} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="hint">{KIND_HINT[kind]}</p>
        </fieldset>
        {kind === 'count' && (
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Objetivo</span>
              <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Unidad (opcional)</span>
              <input value={unit} maxLength={40} placeholder="libros, km, $" onChange={(e) => setUnit(e.target.value)} />
            </label>
          </div>
        )}
        <label className="field">
          <span className="field-label">¿Para cuándo? (opcional)</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">¿Por qué es importante para ti? (opcional)</span>
          <textarea rows={2} maxLength={500} value={why} placeholder="Tu motivación, para recordarla en los días difíciles" onChange={(e) => setWhy(e.target.value)} />
        </label>
        <fieldset className="field">
          <legend className="field-label">Emoji</legend>
          <EmojiPicker value={emoji} onChange={setEmoji} />
        </fieldset>
        <fieldset className="field">
          <legend className="field-label">Color</legend>
          <ColorPicker value={color} onChange={setColor} />
        </fieldset>
        <fieldset className="field">
          <legend className="field-label">Área</legend>
          <AreaChips value={area} onChange={setArea} />
        </fieldset>
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
            {goal === 'new' ? 'Crear meta' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
