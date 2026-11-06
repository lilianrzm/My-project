import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { useData } from '../state/data';
import { useFeedback } from '../state/ui';
import type { Appearance, RadiusStyle } from '../domain/types';
import * as repo from '../db/repo';
import { errorMessage } from '../hooks/useTaskActions';
import { DEFAULT_APPEARANCE, FONT_SETS, PALETTES, applyAppearance, sameAppearance, setPreviewing } from '../theme';

/** Apariencia: los cambios se ven al instante y solo se guardan al confirmar. */
export function AppearanceCard() {
  const { settings } = useData();
  const { toast } = useFeedback();
  const saved = settings.appearance;
  const [draft, setDraft] = useState<Appearance>(saved);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const dirty = !sameAppearance(draft, saved);

  useEffect(() => setDraft(saved), [saved]);

  // Vista previa en vivo
  useEffect(() => {
    setPreviewing(dirty);
    applyAppearance(draft);
  }, [draft, dirty]);

  // Al salir sin guardar, volver a lo guardado
  useEffect(
    () => () => {
      setPreviewing(false);
      applyAppearance(savedRef.current);
    },
    [],
  );

  const save = async () => {
    try {
      await repo.saveSettings({ appearance: draft });
      applyAppearance(draft, true);
      toast({ message: 'Apariencia guardada', tone: 'success' });
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'error' });
    }
  };

  return (
    <section className="card settings-card" aria-labelledby="ap-title" id="apariencia">
      <h2 id="ap-title" className="card-title">
        Apariencia
      </h2>
      <p className="muted small">Los cambios se muestran al instante en toda la app. Guárdalos para conservarlos.</p>

      <fieldset className="ap-group">
        <legend className="field-label">Tipografía</legend>
        <div className="ap-options ap-fonts" role="radiogroup" aria-label="Tipografía">
          {FONT_SETS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={draft.font === f.id}
              className={`ap-option${draft.font === f.id ? ' is-on' : ''}`}
              onClick={() => setDraft({ ...draft, font: f.id })}
            >
              <span
                className="font-sample-title"
                style={{ fontFamily: `${f.display}, var(--font-system)`, fontStyle: f.id === 'editorial' ? 'italic' : 'normal', fontWeight: f.id === 'clean' ? 600 : f.id === 'playful' ? 500 : 400 }}
              >
                Good morning
              </span>
              <span className="font-sample-body" style={{ fontFamily: `${f.body}, var(--font-system)` }}>
                Revisar documentación · 3 subtareas
              </span>
              <span className="ap-name">
                {f.name}
                {f.id === 'playful' && <span className="muted"> · predeterminada</span>}
              </span>
              <span className="muted small">{f.note}</span>
              {draft.font === f.id && <Check className="ap-check" size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ap-group">
        <legend className="field-label">Paleta de colores</legend>
        <div className="ap-options ap-palettes" role="radiogroup" aria-label="Paleta de colores">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={draft.palette === p.id}
              className={`ap-option${draft.palette === p.id ? ' is-on' : ''}`}
              onClick={() => setDraft({ ...draft, palette: p.id })}
            >
              <span className="palette-preview" style={{ background: p.bg }} aria-hidden="true">
                <span className="pp-chip" style={{ background: p.secondary }} />
                <span className="pp-btn" style={{ background: p.accent }} />
                <span className="pp-line" />
                <span className="pp-line pp-line-short" />
              </span>
              <span className="ap-name">
                {p.name}
                {p.id === 'olive' && <span className="muted"> · predeterminada</span>}
              </span>
              {draft.palette === p.id && <Check className="ap-check" size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ap-group">
        <legend className="field-label">Esquinas</legend>
        <div className="segmented" role="radiogroup" aria-label="Esquinas">
          {(['soft', 'round'] as RadiusStyle[]).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={draft.radius === r} className={`seg${draft.radius === r ? ' is-on' : ''}`} onClick={() => setDraft({ ...draft, radius: r })}>
              {r === 'soft' ? 'Suaves' : 'Más redondeadas'}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="row-wrap ap-actions">
        <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => void save()}>
          Guardar apariencia
        </button>
        <button type="button" className="btn btn-quiet" disabled={!dirty} onClick={() => setDraft(saved)}>
          Cancelar cambios
        </button>
        <button type="button" className="btn btn-ghost" disabled={sameAppearance(draft, DEFAULT_APPEARANCE)} onClick={() => setDraft(DEFAULT_APPEARANCE)}>
          <RotateCcw size={15} aria-hidden="true" /> Restablecer diseño original
        </button>
        {dirty && <span className="small muted">Vista previa sin guardar</span>}
      </div>
    </section>
  );
}
