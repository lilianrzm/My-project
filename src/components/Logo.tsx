/** Símbolo de The Daily Edit: un sol que nace sobre las líneas de una página. */
export function Logo({ size = 32, rounded = true }: { size?: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false" className="logo">
      <rect width="512" height="512" rx={rounded ? 116 : 0} fill="#F2DDE2" />
      <path d="M146 262a110 110 0 0 1 220 0z" fill="#81866A" />
      <rect x="118" y="286" width="276" height="18" rx="9" fill="#81866A" />
      <rect x="160" y="332" width="192" height="16" rx="8" fill="#81866A" opacity="0.6" />
      <rect x="204" y="374" width="104" height="16" rx="8" fill="#81866A" opacity="0.35" />
    </svg>
  );
}
