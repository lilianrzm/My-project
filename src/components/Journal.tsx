import { useEffect, useState } from 'react';
import { Heart, Sparkles } from 'lucide-react';
import { useData } from '../state/data';
import { useFeedback } from '../state/ui';
import * as repo from '../db/repo';
import { MOODS, type Mood } from '../domain/types';
import { errorMessage } from '../hooks/useTaskActions';

/** Registro rápido del día: ánimo, gratitud y un logro personal. Todo opcional. */
export function JournalCard({ date, compact = false }: { date: string; compact?: boolean }) {
  const { journal } = useData();
  const { toast } = useFeedback();
  const entry = journal.find((j) => j.date === date);
  const [gratitude, setGratitude] = useState(entry?.gratitude ?? '');
  const [proud, setProud] = useState(entry?.proud ?? '');
  useEffect(() => setGratitude(entry?.gratitude ?? ''), [entry?.gratitude]);
  useEffect(() => setProud(entry?.proud ?? ''), [entry?.proud]);

  const save = (patch: { mood?: Mood | null; gratitude?: string; proud?: string }) =>
    repo.saveJournal(date, patch).catch((e) => toast({ message: errorMessage(e), tone: 'error' }));

  return (
    <section className={`card journal-card${compact ? ' is-compact' : ''}`} aria-labelledby={`jr-${date}`}>
      <h2 id={`jr-${date}`} className="card-title">
        <Heart size={18} aria-hidden="true" /> ¿Cómo te sientes hoy?
      </h2>
      <div className="mood-row" role="radiogroup" aria-label="Ánimo de hoy">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={entry?.mood === m.value}
            aria-label={m.label}
            title={m.label}
            className={`mood${entry?.mood === m.value ? ' is-on' : ''}`}
            onClick={() => void save({ mood: entry?.mood === m.value ? null : m.value })}
          >
            <span aria-hidden="true">{m.emoji}</span>
            <span className="mood-label">{m.label}</span>
          </button>
        ))}
      </div>
      <label className="journal-field">
        <span className="field-label">
          <Heart size={14} aria-hidden="true" /> Hoy agradezco…
        </span>
        <input
          value={gratitude}
          maxLength={500}
          placeholder="Algo pequeño también cuenta"
          onChange={(e) => setGratitude(e.target.value)}
          onBlur={() => gratitude !== (entry?.gratitude ?? '') && void save({ gratitude: gratitude.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      {!compact && (
        <label className="journal-field">
          <span className="field-label">
            <Sparkles size={14} aria-hidden="true" /> Mi logro de hoy
          </span>
          <textarea
            rows={2}
            value={proud}
            maxLength={500}
            placeholder="¿Qué hiciste hoy que te hace sentir bien?"
            onChange={(e) => setProud(e.target.value)}
            onBlur={() => proud !== (entry?.proud ?? '') && void save({ proud: proud.trim() })}
          />
        </label>
      )}
    </section>
  );
}
