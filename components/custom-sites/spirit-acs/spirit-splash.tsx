/**
 * Décor « projection de lavage » de Spirit ACS.
 *
 * SVG LOCAL léger et spécifique à Spirit : une gerbe de gouttes turquoise
 * (avec quelques éclats roses) qui évoque une projection d'eau/de produit
 * maîtrisée, dans l'esprit du logo Spirit — et non une forme abstraite
 * générique. Purement décoratif (aria-hidden), sans coût runtime : pas d'état,
 * pas d'écouteur, animation CSS d'opacité uniquement à l'entrée.
 */

type SpiritSplashProps = {
  className?: string
  /** Miroir horizontal (pour placer une gerbe symétrique de l'autre côté). */
  flip?: boolean
}

export function SpiritSplash({ className, flip = false }: SpiritSplashProps) {
  return (
    <svg
      viewBox="0 0 240 200"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      {/* Masse principale de la gerbe */}
      <g fill="var(--spirit-teal)" opacity="0.16">
        <ellipse cx="70" cy="150" rx="58" ry="30" />
        <ellipse cx="118" cy="120" rx="20" ry="34" transform="rotate(24 118 120)" />
        <ellipse cx="92" cy="104" rx="15" ry="30" transform="rotate(8 92 104)" />
        <ellipse cx="64" cy="98" rx="13" ry="27" transform="rotate(-12 64 98)" />
        <ellipse cx="40" cy="112" rx="11" ry="22" transform="rotate(-28 40 112)" />
      </g>
      {/* Gouttes projetées */}
      <g fill="var(--spirit-teal)" opacity="0.22">
        <circle cx="150" cy="86" r="7" />
        <circle cx="168" cy="60" r="4.5" />
        <circle cx="128" cy="66" r="5" />
        <circle cx="104" cy="52" r="3.5" />
      </g>
      {/* Éclats roses (accent d'identité) */}
      <g fill="var(--spirit-pink)" opacity="0.5">
        <circle cx="182" cy="92" r="3.5" />
        <circle cx="146" cy="44" r="2.5" />
      </g>
    </svg>
  )
}
