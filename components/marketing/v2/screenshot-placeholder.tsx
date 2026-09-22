import { ImageIcon } from "lucide-react"

/**
 * Placeholder de capture produit CLAIREMENT identifié.
 *
 * Utilisé uniquement pour les captures encore manquantes prévues au plan Lot 3.
 * Ne représente JAMAIS une fausse interface DetailFlow : c'est un cadre balisé
 * indiquant explicitement qu'une vraie capture viendra ici.
 */
export function ScreenshotPlaceholder({
  label,
  ratio = "16 / 10",
  className = "",
}: {
  label: string
  ratio?: string
  className?: string
}) {
  return (
    <div
      role="img"
      aria-label={`Emplacement de capture produit à fournir : ${label}`}
      style={{ aspectRatio: ratio }}
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/40 p-8 text-center ${className}`}
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ImageIcon className="size-6" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-foreground">Capture produit à venir</p>
      <p className="max-w-xs text-pretty text-xs leading-relaxed text-muted-foreground">{label}</p>
    </div>
  )
}
