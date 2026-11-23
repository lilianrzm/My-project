import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Archive, ArchiveRestore, Check, Flame, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useData } from '../state/data';
import { useFeedback, useUI } from '../state/ui';
import * as repo from '../db/repo';
import type { Habit } from '../domain/types';
import { SWATCHES } from '../domain/types';
import { addDays, formatWeekdayShort, capitalize, parseISODate } from '../domain/dates';
import { bestHabitStreak, habitRate, habitStreak, isScheduled, logSet } from '../domain/personal';
import { celebrate } from '../celebrate';
import { errorMessage } from '../hooks/useTaskActions';
import { EmptyState, Menu, Modal, PageHeader, Section } from '../components/ui';
import { AreaChips, EmojiPicker } from '../components/Pickers';
import { ColorPicker } from './Projects';

const SUGGESTIONS: Partial<Habit>[] = [
  { title: 'Tomar 8 vasos de agua', emoji: '💧', color: '#9DBBE8' },
  { title: 'Leer 10 minutos', emoji: '📚', color: '#B9A3E3' },
  { title: 'Moverme 30 minutos', emoji: '🏃', color: '#9FD3A8' },
  { title: 'Dormir antes de las 11', emoji: '🌙', color: '#F4A6B8' },
];

/** Marca rápida de un hábito para un día (círculo grande con su emoji). */
export function HabitCheck({ habit, date, done }: { habit: Habit; date: string; done: boolean }) {
  const { toast } = useFeedback();
  return (
    <button
      type="button"
      className={`habit-check${done ? ' is-done' : ''}`}
      style={{ '--h': habit.color } as CSSProperties}
      aria-pressed={done}
      aria-label={`${habit.title}: ${done ? 'cumplido, tocar para desmarcar' : 'marcar como cumplido'}`}
      onClick={async (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        try {
          const now = await repo.toggleHabit(habit.id, date);
          if (now) celebrate({ origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
        } catch (err) {
          toast({ message: errorMessage(err), tone: 'error' });
        }
      }}
    >
      <span className="habit-emoji" aria-hidden="true">
        {habit.emoji}
      </span>
      {done && (
        <span className="habit-tick" aria-hidden="true">
          <Check size={13} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

export function HabitsPage() {
  const { habits, habitLogs, settings } = useData();
  const { today } = useUI();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<Habit | Partial<Habit> | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = habits.filter((h) => !h.archived);
  const archived = habits.filter((h) => h.archived);
  const todays = active.filter((h) => isScheduled(h, today));
  const doneByHabit = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const h of habits) m.set(h.id, logSet(habitLogs, h.id));
    return m;
  }, [habits, habitLogs]);
  const doneToday = todays.filter((h) => doneByHabit.get(h.id)?.has(today)).length;

  // Celebración grande al completar todos los hábitos del día
  const [allDoneShown, setAllDoneShown] = useState(false);
  useEffect(() => {
    if (todays.length && doneToday === todays.length && !allDoneShown) {
      setAllDoneShown(true);
      celebrate({ amount: 'big' });
      toast({ message: '¡Todos tus hábitos de hoy! 🌟', tone: 'success' });
    }
    if (doneToday < todays.length) setAllDoneShown(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneToday, todays.length]);

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  const remove = async (h: Habit) => {
    const ok = await confirm({ title: `Eliminar “${h.title}”`, message: 'Se borrará también su historial. Si solo quieres pausarlo, archívalo.', confirmLabel: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    const d = await repo.deleteHabit(h.id);
    if (d) toast({ message: 'Hábito eliminado', action: { label: 'Deshacer', run: () => repo.restoreHabit(d) } });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Constancia"
        title="Hábitos"
        subtitle={todays.length ? `Hoy: ${doneToday} de ${todays.length} ${doneToday === todays.length ? '🌟' : ''}` : 'Pequeñas acciones que, repetidas, te transforman.'}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={17} aria-hidden="true" /> Nuevo hábito
          </button>
        }
      />

      {active.length === 0 ? (
        <EmptyState icon={<Flame size={28} />} title="Empieza con algo pequeño">
          <span className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s.title} type="button" className="suggestion" onClick={() => setEditing(s)}>
                {s.emoji} {s.title}
              </button>
            ))}
          </span>
        </EmptyState>
      ) : (
        <>
          {todays.length > 0 && (
            <Section title="Hoy" count={todays.length}>
              <div className="habit-today">
                {todays.map((h) => (
                  <div key={h.id} className="habit-today-item">
                    <HabitCheck habit={h} date={today} done={!!doneByHabit.get(h.id)?.has(today)} />
                    <span className="habit-today-title">{h.title}</span>
                    {habitStreak(h, doneByHabit.get(h.id)!, today) > 1 && (
                      <span className="streak-chip">
                        <Flame size={13} aria-hidden="true" /> {habitStreak(h, doneByHabit.get(h.id)!, today)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Tus hábitos" count={active.length}>
            <ul className="habit-list">
              {active.map((h) => {
                const done = doneByHabit.get(h.id)!;
                const streak = habitStreak(h, done, today);
                const best = bestHabitStreak(h, done, today);
                const rate = habitRate(h, done, today, 30);
                return (
                  <li key={h.id} className="habit-card" style={{ '--h': h.color } as CSSProperties}>
                    <div className="habit-card-head">
                      <span className="habit-big-emoji" aria-hidden="true">
                        {h.emoji}
                      </span>
                      <div className="habit-card-info">
                        <span className="habit-card-title">{h.title}</span>
                        <span className="small muted">
                          {h.weekdays.length ? h.weekdays.map((d) => capitalize(formatWeekdayShort(addDays('2023-01-01', d)))).join(' · ') : 'Todos los días'}
                        </span>
                      </div>
                      <Menu
                        label={`Opciones de ${h.title}`}
                        trigger={<MoreHorizontal size={18} />}
                        items={[
                          { label: 'Editar', icon: <Pencil size={16} />, onSelect: () => setEditing(h) },
                          { label: 'Archivar (pausar)', icon: <Archive size={16} />, onSelect: () => void repo.updateHabit(h.id, { archived: true }) },
                          'sep',
                          { label: 'Eliminar', icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove(h) },
                        ]}
                      />
                    </div>
                    <div className="habit-week" role="group" aria-label={`Últimos 7 días de ${h.title}`}>
                      {week.map((d) => {
                        const sched = isScheduled(h, d);
                        const ok = done.has(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            disabled={!sched && !ok}
                            className={`hw-day${ok ? ' is-done' : ''}${d === today ? ' is-today' : ''}${!sched ? ' is-off' : ''}`}
                            aria-pressed={ok}
                            aria-label={`${capitalize(formatWeekdayShort(d))} ${parseISODate(d).getDate()}: ${ok ? 'cumplido' : sched ? 'sin marcar' : 'no toca'}`}
                            onClick={() => void repo.toggleHabit(h.id, d)}
                          >
                            <span className="hw-label">{capitalize(formatWeekdayShort(d)).slice(0, 2)}</span>
                            <span className="hw-dot">{ok ? <Check size={12} strokeWidth={3} /> : parseISODate(d).getDate()}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="habit-stats">
                      <span>
                        <Flame size={14} aria-hidden="true" /> Racha <strong>{streak}</strong>
                      </span>
                      <span>
                        Mejor <strong>{best}</strong>
                      </span>
                      <span>
                        30 días <strong>{rate === null ? '—' : `${rate}%`}</strong>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        </>
      )}

      {archived.length > 0 && (
        <button type="button" className="btn btn-link" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Ocultar pausados' : `Hábitos pausados (${archived.length})`}
        </button>
      )}
      {showArchived && (
        <ul className="manage-list">
          {archived.map((h) => (
            <li key={h.id} className="manage-item">
              <span className="manage-name">
                {h.emoji} {h.title}
              </span>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void repo.updateHabit(h.id, { archived: false })}>
                <ArchiveRestore size={15} aria-hidden="true" /> Reactivar
              </button>
            </li>
          ))}
        </ul>
      )}

      <HabitForm value={editing} weekStart={settings.weekStart} onClose={() => setEditing(null)} />
    </div>
  );
}

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function HabitForm({ value, weekStart, onClose }: { value: Habit | Partial<Habit> | null; weekStart: 0 | 1; onClose: () => void }) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [color, setColor] = useState(SWATCHES[3].value);
  const [area, setArea] = useState<string | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [error, setError] = useState('');
  const isEdit = !!value && 'id' in value && !!value.id;

  useEffect(() => {
    if (!value) return;
    setTitle(value.title ?? '');
    setEmoji(value.emoji ?? '✨');
    setColor(value.color ?? SWATCHES[3].value);
    setArea(value.categoryId ?? null);
    setDays(value.weekdays ?? []);
    setError('');
  }, [value]);

  const order = weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  const submit = async () => {
    if (!title.trim()) return setError('Ponle un nombre a tu hábito.');
    try {
      const data = { title: title.trim(), emoji, color, categoryId: area, weekdays: days };
      if (isEdit) await repo.updateHabit((value as Habit).id, data);
      else await repo.createHabit(data);
      toast({ message: isEdit ? 'Hábito actualizado' : '¡Nuevo hábito! 🌱', tone: 'success' });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal open={!!value} onClose={onClose} title={isEdit ? 'Editar hábito' : 'Nuevo hábito'}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span className="field-label">¿Qué quieres hacer?</span>
          <input autoFocus value={title} maxLength={120} placeholder="Ej. Leer 10 minutos" onChange={(e) => setTitle(e.target.value)} />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <fieldset className="field">
          <legend className="field-label">¿Qué días?</legend>
          <div className="row-wrap tight">
            <button type="button" className={`toggle-chip${!days.length ? ' is-on' : ''}`} aria-pressed={!days.length} onClick={() => setDays([])}>
              Todos los días
            </button>
            <div className="weekday-picker" role="group" aria-label="Días concretos">
              {order.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={DAY_NAMES[d]}
                    className={`wd${on ? ' is-on' : ''}`}
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                  >
                    {DAY_LETTERS[d]}
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>
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
        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            {isEdit ? 'Guardar' : 'Crear hábito'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
