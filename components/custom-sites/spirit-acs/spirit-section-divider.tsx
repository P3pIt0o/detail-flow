/**
 * Séparateur décoratif PROPRE au site Spirit ACS.
 *
 * Assure une continuité visuelle douce entre deux sections (fonds bleu nuit ↔
 * clairs) grâce à un léger chevauchement, un filet fin turquoise/rose et de
 * petites projections d'eau/peinture inspirées du logo. 100 % décoratif :
 * `aria-hidden`, aucun texte, aucun rôle sémantique.
 *
 * Reste local à Spirit (ne devient jamais un composant générique). CSS/SVG
 * locaux uniquement — aucune bibliothèque d'animation. Respecte
 * `prefers-reduced-motion` (géré dans spirit.css).
 *
 * Trois variantes seulement :
 *  - `darkToLight` : section sombre AU-DESSUS, claire EN DESSOUS.
 *  - `lightToDark` : section claire AU-DESSUS, sombre EN DESSOUS.
 *  - `accent`      : filet d'accent discret entre deux sections sombres.
 */

type SpiritDividerVariant = "darkToLight" | "lightToDark" | "accent"

export function SpiritSectionDivider({ variant }: { variant: SpiritDividerVariant }) {
  return (
    <div className={`spirit-divider spirit-divider--${variant}`} aria-hidden="true">
      {/* Filet fin bi-teinte (turquoise → rose) */}
      <span className="spirit-divider__rule" />
      {/* Petites projections inspirées du logo (gouttes) */}
      <span className="spirit-divider__drop spirit-divider__drop--a" />
      <span className="spirit-divider__drop spirit-divider__drop--b" />
      <span className="spirit-divider__drop spirit-divider__drop--c" />
    </div>
  )
}
