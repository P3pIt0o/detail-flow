/**
 * Emplacement photo Rozan.
 *
 * Deux modes, sans jamais changer les composants appelants :
 *  - `src` FOURNI  → affiche la VRAIE photo Rozan via `next/image` (cadrage
 *    couvrant, ratio maîtrisé). C'est le mode nominal maintenant que Rozan a
 *    fourni ses photos officielles (`/public/custom-sites/rozan/*`).
 *  - `src` ABSENT  → placeholder premium (repère de cadrage + légende du cliché
 *    attendu). On n'invente jamais une fausse image : l'emplacement reste
 *    élégant tant qu'aucune photo n'est fournie pour ce cadre précis.
 *
 * Rendu neutre et cohérent avec la DA claire/premium ; ce n'est PAS un « blob ».
 */

import Image from "next/image"
import { Camera } from "lucide-react"

type RozanShotProps = {
  /** Intitulé du cliché attendu (mode placeholder) ou alt de la vraie photo. */
  label: string
  /** Vraie photo Rozan (chemin public). Si fourni, affiche l'image. */
  src?: string
  /** Texte alternatif de la vraie photo (défaut : `label`). */
  alt?: string
  /** Ratio d'aspect Tailwind (ex. "aspect-[4/3]"). */
  ratio?: string
  /** Variante de fond : clair (défaut) ou sombre (sur sections foncées). */
  tone?: "light" | "dark"
  className?: string
  /** Coins arrondis (défaut : rayon de marque). */
  rounded?: string
  /** Chargement prioritaire (hero au-dessus de la ligne de flottaison). */
  priority?: boolean
  /** `sizes` responsive transmis à next/image. */
  sizes?: string
}

export function RozanShot({
  label,
  src,
  alt,
  ratio = "aspect-[4/3]",
  tone = "light",
  className = "",
  rounded = "rounded-2xl",
  priority = false,
  sizes = "(max-width: 1024px) 100vw, 50vw",
}: RozanShotProps) {
  // Mode nominal : vraie photo Rozan.
  if (src) {
    return (
      <div className={`relative ${ratio} w-full overflow-hidden ${rounded} ${className}`}>
        <Image
          src={src || "/placeholder.svg"}
          alt={alt ?? label}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    )
  }

  // Mode repli : emplacement premium sans fausse image.
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
