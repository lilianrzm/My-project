import { useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle2, Flame, Heart, Sparkles, Trophy } from 'lucide-react';
import { useData } from '../state/data';
import { useUI } from '../state/ui';
import { addDays, formatLong, formatRelative, startOfMonth, startOfWeek } from '../domain/dates';
import { localDateOf } from '../domain/selectors';
import { activeDays, dayStreak } from '../domain/personal';
import { MOODS } from '../domain/types';
import { PageHeader, Section } from '../components/ui';
import { JournalCard } from '../components/Journal';

type Range = 'week' | 'month' | 'year';
const RANGE_LABEL: Record<Range, string> = { week: 'Esta semana', month: 'Este mes', year: 'Este año' };

interface Moment {
  key: string;
  date: string;
  at: string;
  emoji: string;
  text: string;
  kind: 'task' | 'goal' | 'proud';
  color?: string;
}

/** Mis logros: lo que has conseguido, cómo te has sentido y por qué das gracias. */
export function AchievementsPage() {
  const { tasks, habitLogs, goals, journal, categoryById, settings } = useData();
  const { today, selectTask } = useUI();
  const [range, setRange] = useState<Range>('week');

  const from = range === 'week' ? startOfWeek(today, settings.weekStart) : range === 'month' ? startOfMonth(today) : `${today.slice(0, 4)}-01-01`;
  const inRange = (d: string | null) => !!d && d >= from && d <= today;

  const data = useMemo(() => {
    const doneTasks = tasks.filter((t) => t.status === 'completed' && t.completedAt && inRange(localDateOf(t.completedAt)));
    const habitDone = habitLogs.filter((l) => inRange(l.date)).length;
    const goalsAchieved = goals.filter((g) => g.status === 'achieved' && g.achievedAt && inRange(localDateOf(g.achievedAt)));
    const streak = dayStreak(activeDays(tasks, habitLogs), today);

    // Por área
    const byArea = new Map<string, number>();
    for (const t of doneTasks) byArea.set(t.categoryId ?? '__none', (byArea.get(t.categoryId ?? '__none') ?? 0) + 1);
    const areas = [...byArea.entries()]
      .map(([id, n]) => {
        const c = id === '__none' ? undefined : categoryById.get(id);
        return { id, n, label: c ? `${c.emoji} ${c.name}` : '🗂️ Sin área', color: c?.color ?? 'var(--surface-3)' };
      })
      .sort((a, b) => b.n - a.n);

    // Momentos
    const moments: Moment[] = [
      ...goalsAchieved.map((g) => ({ key: `g${g.id}`, date: localDateOf(g.achievedAt!), at: g.achievedAt!, emoji: '🏆', text: `Meta lograda: ${g.emoji} ${g.title}`, kind: 'goal' as const, color: g.color })),
      ...journal.filter((j) => j.proud && inRange(j.date)).map((j) => ({ key: `p${j.date}`, date: j.date, at: `${j.date}T23:59`, emoji: '✨', text: j.proud, kind: 'proud' as const })),
      ...doneTasks.map((t) => {
        const c = t.categoryId ? categoryById.get(t.categoryId) : undefined;
        return { key: `t${t.id}`, date: localDateOf(t.completedAt!), at: t.completedAt!, emoji: c?.emoji ?? '✅', text: t.title, kind: 'task' as const, color: c?.color };
      }),
    ].sort((a, b) => b.at.localeCompare(a.at));

    const moodDays = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)).map((d) => ({ d, mood: journal.find((j) => j.date === d)?.mood ?? null }));
    const gratitude = journal.filter((j) => j.gratitude).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

    return { doneTasks, habitDone, goalsAchieved, streak, areas, moments, moodDays, gratitude };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, habitLogs, goals, journal, categoryById, today, from]);

  const max = Math.max(1, ...data.areas.map((a) => a.n));
  const grouped = useMemo(() => {
    const m = new Map<string, Moment[]>();
    for (const x of data.moments.slice(0, 80)) m.set(x.date, [...(m.get(x.date) ?? []), x]);
    return [...m.entries()];
  }, [data.moments]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Celebra tu camino"
        title="Mis logros"
        subtitle="Todo lo que has hecho por ti, en un solo lugar."
        actions={
          <div className="segmented" role="radiogroup" aria-label="Periodo">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={range === r} className={`seg${range === r ? ' is-on' : ''}`} onClick={() => setRange(r)}>
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        }
      />

      <div className="win-stats">
        <div className="win win-tasks">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span className="win-num">{data.doneTasks.length}</span>
          <span className="win-label">tareas completadas</span>
        </div>
        <div className="win win-habits">
          <Sparkles size={20} aria-hidden="true" />
          <span className="win-num">{data.habitDone}</span>
          <span className="win-label">hábitos cumplidos</span>
        </div>
        <div className="win win-goals">
          <Trophy size={20} aria-hidden="true" />
          <span className="win-num">{data.goalsAchieved.length}</span>
          <span className="win-label">metas logradas</span>
        </div>
        <div className="win win-streak">
          <Flame size={20} aria-hidden="true" />
          <span className="win-num">{data.streak}</span>
          <span className="win-label">{data.streak === 1 ? 'día de racha' : 'días de racha'}</span>
        </div>
      </div>

      <div className="ach-grid">
        <section className="card" aria-labelledby="ach-areas">
          <h2 id="ach-areas" className="card-title">
            Por área de tu vida
          </h2>
          {data.areas.length === 0 ? (
            <p className="muted small">Cuando completes tareas aparecerán aquí, con el color de cada área.</p>
          ) : (
            <ul className="area-bars">
              {data.areas.map((a) => (
                <li key={a.id}>
                  <span className="area-bar-label">{a.label}</span>
                  <span className="area-bar-track" aria-hidden="true">
                    <span className="area-bar-fill" style={{ width: `${(a.n / max) * 100}%`, background: a.color }} />
                  </span>
                  <span className="area-bar-n">{a.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="ach-mood">
          <h2 id="ach-mood" className="card-title">
            <Heart size={18} aria-hidden="true" /> Tu ánimo · 30 días
          </h2>
          <div className="mood-strip" role="list" aria-label="Ánimo de los últimos 30 días">
            {data.moodDays.map(({ d, mood }) => {
              const m = MOODS.find((x) => x.value === mood);
              return (
                <span key={d} role="listitem" className={`mood-day${m ? '' : ' is-empty'}${d === today ? ' is-today' : ''}`} title={`${formatLong(d)}: ${m?.label ?? 'sin registro'}`}>
                  {m ? m.emoji : '·'}
                  <span className="sr-only">
                    {formatLong(d)}: {m?.label ?? 'sin registro'}
                  </span>
                </span>
              );
            })}
          </div>
          {data.gratitude.length > 0 && (
            <>
              <h3 className="group-title">Gracias por…</h3>
              <ul className="gratitude-list">
                {data.gratitude.map((j) => (
                  <li key={j.date}>
                    <span className="small muted">{formatRelative(j.date, today)}</span> {j.gratitude}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <JournalCard date={today} />

      <Section title={`Momentos · ${RANGE_LABEL[range].toLowerCase()}`} count={data.moments.length}>
        {grouped.length === 0 ? (
          <p className="muted small pad">Aquí aparecerán tus tareas completadas, metas logradas y tus logros del día. ¡El primero está a un toque! ✨</p>
        ) : (
          <ol className="moments">
            {grouped.map(([d, list]) => (
              <li key={d}>
                <p className="moment-day">{formatRelative(d, today)}</p>
                <ul>
                  {list.map((m) => (
                    <li key={m.key} className={`moment moment-${m.kind}`} style={{ '--m': m.color } as CSSProperties}>
                      <span className="moment-emoji" aria-hidden="true">
                        {m.emoji}
                      </span>
                      {m.kind === 'task' ? (
                        <button type="button" className="moment-text link-like" onClick={() => selectTask(m.key.slice(1))}>
                          {m.text}
                        </button>
                      ) : (
                        <span className="moment-text">{m.text}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
