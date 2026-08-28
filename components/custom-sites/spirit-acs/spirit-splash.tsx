/**
 * Décor « projection de lavage » de Spirit ACS.
 *
 * SVG LOCAL spécifique à Spirit : une gerbe fluide turquoise qui monte depuis le
 * coin bas (projections en « doigts » + gouttes détachées de tailles variées,
 * quelques éclats roses), dans l'esprit du logo Spirit et de la maquette — et
 * NON une forme abstraite générique. Purement décoratif : `aria-hidden`,
 * `pointer-events:none` (posé par l'appelant), sans état ni écouteur.
 *
 * Le viewBox se met à l'échelle du conteneur : on peut donc l'agrandir
 * largement (bas de page) tout en gardant un tracé net.
 */

type SpiritSplashProps = {
  className?: string
  /** Miroir horizontal (pour placer une gerbe symétrique de l'autre côté). */
  flip?: boolean
}

export function SpiritSplash({ className, flip = false }: SpiritSplashProps) {
  return (
    <svg
      viewBox="0 0 300 260"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMax meet"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      {/* Masse arrière large et diffuse */}
      <path
        fill="var(--spirit-teal)"
        opacity="0.14"
        d="M0 260 L0 158 C22 126 34 158 46 124 C54 98 40 82 62 70 C82 60 86 98 100 92 C116 86 108 46 128 44 C148 42 146 92 162 98 C182 104 186 64 208 74 C228 84 212 122 238 126 C262 130 268 152 300 142 L300 260 Z"
      />
      {/* Masse avant plus dense (cœur de la gerbe) */}
      <path
        fill="var(--spirit-teal)"
        opacity="0.26"
        d="M0 260 L0 192 C18 176 30 200 44 176 C54 158 46 146 64 140 C82 134 84 166 98 162 C114 158 110 130 128 130 C146 130 146 164 160 168 C178 172 180 146 200 152 C220 158 210 186 300 182 L300 260 Z"
      />
      {/* Gouttes projetées (turquoise) */}
      <g fill="var(--spirit-teal)" opacity="0.3">
        <circle cx="150" cy="70" r="8" />
        <circle cx="182" cy="44" r="5" />
        <circle cx="120" cy="46" r="4" />
        <circle cx="206" cy="70" r="3.5" />
        <circle cx="96" cy="80" r="3" />
        <circle cx="238" cy="96" r="4.5" />
      </g>
      {/* Éclats roses (accent d'identité Spirit) */}
      <g fill="var(--spirit-pink)" opacity="0.55">
        <circle cx="166" cy="40" r="4" />
        <circle cx="132" cy="24" r="2.5" />
        <circle cx="214" cy="52" r="2.5" />
      </g>
    </svg>
  )
}
