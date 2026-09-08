/**
 * ============================================================================
 *  PICTOGRAMMES DE TYPE DE VÉHICULE — configurateur Spirit ACS
 * ============================================================================
 *
 *  Silhouettes automobiles en profil (viewBox 48×30), style line-art minimaliste
 *  et cohérent : même vue latérale, même épaisseur de trait (1.8), roues à
 *  arches ouvertes. Chaque type a une signature de proportions nettement
 *  distincte — aucune n'est une répétition d'une autre.
 *
 *  Aucun logo constructeur, aucun véhicule de marque, aucun asset externe :
 *  SVG pur, léger, maintenable. La couleur suit `currentColor` afin de rester
 *  discrète à l'état normal et de basculer automatiquement (blanc sur pastille
 *  rose) à l'état sélectionné, sans changer la DA existante.
 *
 *  Les clés correspondent EXACTEMENT aux libellés de `VEHICLE_TYPES` (config).
 */

const SVG_PROPS = {
  viewBox: "0 0 48 30",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
}

/** Citadine — compacte : hayon court, habitacle ramassé, faibles porte-à-faux. */
function Citadine() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M7 23 L7 19 L10 17.5 L14.5 12.5 Q15.4 11.5 17 11.5 L25 11.5 Q26.6 11.5 27.6 12.8 L31 17.5 L40 18 L40 23" />
      <path d="M7 23 L9.1 23 A4.4 4.4 0 0 1 17.9 23 L29.1 23 A4.4 4.4 0 0 1 37.9 23 L40 23" />
      <circle cx="13.5" cy="23" r="3.3" />
      <circle cx="33.5" cy="23" r="3.3" />
    </svg>
  )
}

/** Berline — longue et basse, vraie forme trois volumes (coffre séparé). */
function Berline() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M4 23 L4 19.5 L9 17.5 L16 13.5 L28 13.5 L33 16.5 L38 17.8 L44 18 L44 23" />
      <path d="M4 23 L8.6 23 A4.4 4.4 0 0 1 17.4 23 L31.6 23 A4.4 4.4 0 0 1 40.4 23 L44 23" />
      <circle cx="13" cy="23" r="3.3" />
      <circle cx="36" cy="23" r="3.3" />
    </svg>
  )
}

/** SUV / 4×4 — carrosserie haute et massive, garde au sol marquée, grandes roues. */
function Suv() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M6 22 L6 15 L9 13 L12.5 8.5 Q13.2 7.5 14.6 7.5 L31 7.5 Q32.5 7.5 33.5 9 L37 13 L42 14 L42 22" />
      <path d="M6 22 L9 22 A5 5 0 0 1 19 22 L29 22 A5 5 0 0 1 39 22 L42 22" />
      <circle cx="14" cy="22" r="3.8" />
      <circle cx="34" cy="22" r="3.8" />
    </svg>
  )
}

/** Monospace — monovolume : pare-brise très incliné depuis un capot court, toit long. */
function Monospace() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M5 22.5 L5 18 L7 16.5 L14 8 Q14.6 7.2 16 7.2 L36 7.2 Q37.5 7.2 38 8.6 L41 13 L43 14 L43 22.5" />
      <path d="M5 22.5 L8.6 22.5 A4.4 4.4 0 0 1 17.4 22.5 L30.6 22.5 A4.4 4.4 0 0 1 39.4 22.5 L43 22.5" />
      <circle cx="13" cy="22.5" r="3.3" />
      <circle cx="35" cy="22.5" r="3.3" />
    </svg>
  )
}

/** Utilitaire / Van — fourgon : caisse haute, toit plat sur toute la longueur, arrière vertical. */
function Utilitaire() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M4 23 L4 12 L6.5 9 Q7 8 8.5 8 L44 8 L44 23" />
      <path d="M4 23 L7.6 23 A4.4 4.4 0 0 1 16.4 23 L32.6 23 A4.4 4.4 0 0 1 41.4 23 L44 23" />
      <circle cx="12" cy="23" r="3.3" />
      <circle cx="37" cy="23" r="3.3" />
    </svg>
  )
}

/** Moto / Scooter — deux-roues : guidon, réservoir/selle, fourche avant. */
function Moto() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="10" cy="20" r="4.2" />
      <circle cx="38" cy="20" r="4.2" />
      <path d="M10 20 L19 20 L23 12.5 L30 12.5" />
      <path d="M23 12.5 L27 20 L34 20" />
      <path d="M30 12.5 L34 9 L37.5 9.6" />
      <path d="M13.5 20 L17.5 13.5 L23 13.5" />
    </svg>
  )
}

const ICONS: Record<string, () => React.ReactElement> = {
  Citadine,
  Berline,
  "SUV / 4×4": Suv,
  Monospace,
  "Utilitaire / Van": Utilitaire,
  "Moto / Scooter": Moto,
}

/** Rend le pictogramme correspondant au type (repli neutre : citadine). */
export function VehicleTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICONS[type] ?? Citadine
  return (
    <span className={className} aria-hidden="true">
      <Icon />
    </span>
  )
}
