import { useState } from 'react';
import { EMOJI_CHOICES } from '../domain/types';
import { useData } from '../state/data';

/** Selector de emoji: cuadrícula sugerida + campo para escribir cualquier otro (teclado de emojis del iPad). */
export function EmojiPicker({ value, onChange, label = 'Emoji' }: { value: string; onChange: (e: string) => void; label?: string }) {
  const [custom, setCustom] = useState('');
  return (
    <div className="emoji-picker">
      <div className="emoji-grid" role="radiogroup" aria-label={label}>
        {EMOJI_CHOICES.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={value === e} aria-label={e} className={`emoji-opt${value === e ? ' is-on' : ''}`} onClick={() => onChange(e)}>
            {e}
          </button>
        ))}
      </div>
      <label className="emoji-custom small muted">
        Otro:
        <input
          value={custom}
          maxLength={8}
          placeholder="🙂"
          aria-label="Escribe otro emoji"
          onChange={(e) => {
            setCustom(e.target.value);
            const t = e.target.value.trim();
            if (t && [...t].length <= 4) onChange(t);
          }}
        />
      </label>
    </div>
  );
}

/** Chips de áreas de vida (con emoji y color) para elegir rápido. */
export function AreaChips({ value, onChange, allowNone = true }: { value: string | null; onChange: (id: string | null) => void; allowNone?: boolean }) {
  const { categories } = useData();
  return (
    <div className="area-chips" role="radiogroup" aria-label="Área">
      {allowNone && (
        <button type="button" role="radio" aria-checked={value === null} className={`area-chip${value === null ? ' is-on' : ''}`} onClick={() => onChange(null)}>
          Sin área
        </button>
      )}
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          className={`area-chip${value === c.id ? ' is-on' : ''}`}
          style={{ '--area': c.color } as React.CSSProperties}
          onClick={() => onChange(value === c.id ? null : c.id)}
        >
          <span aria-hidden="true">{c.emoji}</span> {c.name}
        </button>
      ))}
    </div>
  );
}
