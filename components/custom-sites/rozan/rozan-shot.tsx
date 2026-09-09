/**
 * Emplacement photo Rozan (placeholder premium).
 *
 * En Phase 2, Rozan fournira ses VRAIES photos plus tard : ce composant matérialise
 * proprement l'emplacement d'une image (cadrage, ratio, légende du cliché attendu)
 * sans jamais inventer de fausse photo ni utiliser d'image générée. Il suffira de
 * remplacer ce composant par `next/image` avec la vraie source pour finaliser.
 *
 * Rendu neutre et élégant (fond de marque discret + repère de cadrage), cohérent
 * avec la DA claire/premium ; ce n'est PAS un « blob » décoratif.
 */

import { Camera } from "lucide-react"

type RozanShotProps = {
  /** Intitulé du cliché attendu (ex. « Intérieur de véhicule nettoyé »). */
  label: string
  /** Ratio d'aspect Tailwind (ex. "aspect-[4/3]"). */
  ratio?: string
  /** Variante de fond : clair (défaut) ou sombre (sur sections foncées). */
  tone?: "light" | "dark"
  className?: string
  /** Coins arrondis (défaut : rayon de marque). */
  rounded?: string
}

export function RozanShot({
  label,
  ratio = "aspect-[4/3]",
  tone = "light",
  className = "",
  rounded = "rounded-2xl",
}: RozanShotProps) {
  const toneClasses =
    tone === "dark"
      ? "bg-white/[0.04] border-white/10 text-white/55"
      : "bg-[var(--rozan-surface-2)] border-[color:var(--rozan-line)] text-[var(--rozan-muted)]"

  return (
    <div
      className={`relative ${ratio} w-full overflow-hidden border ${rounded} ${toneClasses} ${className}`}
      role="img"
      aria-label={`Photo à venir : ${label}`}
    >
      {/* Trame diagonale très discrète pour signaler l'emplacement sans surcharger. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.35] [background-image:repeating-linear-gradient(135deg,currentColor_0,currentColor_1px,transparent_1px,transparent_11px)]"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <Camera className="size-6" strokeWidth={1.5} aria-hidden="true" />
        <span className="max-w-[85%] text-pretty text-xs font-medium leading-snug">{label}</span>
      </div>
    </div>
  )
}
