import { useId } from 'react';
import type { Breakdown } from '../domain/analytics';

/** Barras horizontales: una categoría por fila, con valor y porcentaje. Colores del tema activo. */
export function BarList({ data, label, empty = 'Sin datos en este periodo.' }: { data: Breakdown[]; label: string; empty?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  if (!data.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="barlist" aria-label={label}>
      {data.slice(0, 12).map((d, i) => (
        <li key={d.key}>
          <span className="barlist-label">{d.label}</span>
          <span className="barlist-track" aria-hidden="true">
            <span className="barlist-fill" style={{ width: `${(d.value / max) * 100}%`, background: `var(--chart-${(i % 6) + 1})` }} />
          </span>
          <span className="barlist-value">
            {d.value}
            <span className="muted small"> · {Math.round((d.value / total) * 100)}%</span>
          </span>
        </li>
      ))}
      {data.length > 12 && <li className="muted small">y {data.length - 12} más</li>}
    </ul>
  );
}

/** Líneas: actividades creadas y completadas por periodo. Incluye tabla accesible. */
export function TrendChart({ series }: { series: { key: string; label: string; created: number; completed: number }[] }) {
  const id = useId();
  if (series.length < 2) return <p className="muted small">Elige un periodo más amplio para ver la evolución.</p>;
  const W = 640;
  const H = 200;
  const P = { l: 28, r: 12, t: 12, b: 26 };
  const max = Math.max(1, ...series.flatMap((s) => [s.created, s.completed]));
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (series.length - 1);
  const y = (v: number) => H - P.b - (v * (H - P.t - P.b)) / max;
  const path = (k: 'created' | 'completed') => series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const every = Math.ceil(series.length / 8);
  return (
    <figure className="trend" aria-labelledby={`${id}-cap`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-cap`} preserveAspectRatio="none" className="trend-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="trend-grid" />
            <text x={P.l - 6} y={y(t) + 4} className="trend-tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {series.map((s, i) =>
          i % every === 0 ? (
            <text key={s.key} x={x(i)} y={H - 6} className="trend-tick" textAnchor="middle">
              {s.label}
            </text>
          ) : null,
        )}
        <path d={path('created')} className="trend-line trend-created" />
        <path d={path('completed')} className="trend-line trend-completed" />
        {series.map((s, i) => (
          <circle key={s.key} cx={x(i)} cy={y(s.completed)} r={3} className="trend-dot" />
        ))}
      </svg>
      <figcaption id={`${id}-cap`} className="trend-legend">
        <span>
          <i className="lg lg-created" /> Creadas
        </span>
        <span>
          <i className="lg lg-completed" /> Completadas
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Actividades creadas y completadas por periodo</caption>
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Creadas</th>
            <th>Completadas</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td>{s.created}</td>
              <td>{s.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
