import type { Appearance, FontSet, Palette } from './domain/types';
import { DEFAULT_APPEARANCE } from './domain/types';

/**
 * Sistema de temas: la apariencia se aplica como atributos en <html>
 * (data-palette, data-font, data-radius) y tokens.css resuelve las variables.
 *
 * La fuente de verdad es IndexedDB (Configuración). Se guarda además una copia mínima en
 * localStorage solo para aplicarla ANTES de que cargue la app (script en index.html) y así
 * evitar el destello del tema predeterminado.
 */
export const APPEARANCE_MIRROR_KEY = 'tde-appearance';

export const PALETTES: { id: Palette; name: string; bg: string; accent: string; secondary: string }[] = [
  { id: 'olive', name: 'Olive & Blush', bg: '#FAF9F6', accent: '#81866A', secondary: '#F2DDE2' },
  { id: 'rose', name: 'Rose & Cream', bg: '#FFF9F7', accent: '#AD7785', secondary: '#F4DCE2' },
  { id: 'sage', name: 'Sage & Linen', bg: '#FAF9F3', accent: '#718878', secondary: '#E5EAD9' },
  { id: 'blue', name: 'Blue & Ivory', bg: '#FAFAF7', accent: '#758BA1', secondary: '#E4EAF0' },
];

export const FONT_SETS: { id: FontSet; name: string; display: string; body: string; note: string }[] = [
  { id: 'playful', name: 'Playful Minimalism', display: "'Outfit'", body: "'Plus Jakarta Sans'", note: 'Outfit + Plus Jakarta Sans' },
  { id: 'editorial', name: 'Editorial', display: "'Instrument Serif'", body: "'Instrument Sans'", note: 'Instrument Serif + Instrument Sans' },
  { id: 'clean', name: 'Clean', display: "'Inter'", body: "'Inter'", note: 'Inter' },
];

export function applyAppearance(a: Appearance, mirror = false): void {
  const el = document.documentElement;
  el.dataset.palette = a.palette;
  el.dataset.font = a.font;
  el.dataset.radius = a.radius;
  const bg = PALETTES.find((p) => p.id === a.palette)?.bg ?? '#FAF9F6';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  if (mirror) {
    try {
      localStorage.setItem(APPEARANCE_MIRROR_KEY, JSON.stringify(a));
    } catch {
      /* opcional */
    }
  }
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return a.font === b.font && a.palette === b.palette && a.radius === b.radius;
}

export { DEFAULT_APPEARANCE };

let previewing = false;
/** Mientras la sección Apariencia muestra una vista previa, la app no la sobrescribe. */
export function setPreviewing(v: boolean) {
  previewing = v;
}
export function isPreviewing() {
  return previewing;
}
