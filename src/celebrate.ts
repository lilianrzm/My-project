/**
 * Pequeña celebración: confeti suave con los colores del tema y de las áreas.
 * Respeta "Reducir movimiento" del sistema y la preferencia de Configuración.
 * Sin dependencias; usa un canvas temporal que se elimina al terminar.
 */
let enabled = true;

export function setCelebrations(v: boolean) {
  enabled = v;
}

const COLORS = ['#F4A6B8', '#F7B58C', '#F5CF6B', '#9FD3A8', '#9DBBE8', '#B9A3E3'];

export function celebrate(opts: { origin?: { x: number; y: number }; amount?: 'small' | 'big' } = {}): void {
  if (!enabled || typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const big = opts.amount === 'big';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const colors = accent ? [...COLORS, accent] : COLORS;
  const ox = opts.origin?.x ?? window.innerWidth / 2;
  const oy = opts.origin?.y ?? window.innerHeight * 0.35;
  const n = big ? 140 : 46;
  const parts = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = (big ? 7 : 5) + Math.random() * (big ? 7 : 4);
    return {
      x: ox,
      y: oy,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - (big ? 6 : 4),
      r: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() < 0.4,
    };
  });
  const start = performance.now();
  const dur = big ? 1800 : 1100;
  const frame = (t: number) => {
    const k = (t - start) / dur;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    if (k < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
