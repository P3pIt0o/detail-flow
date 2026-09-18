"use client"

import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { X } from "lucide-react"
import { EmbedBridge, postEmbedMessage } from "./embed-bridge"

/**
 * Coquille NUE du module embarqué : un bandeau discret (logo + nom du tenant +
 * bouton fermer) puis le contenu du tunnel. Aucune navbar/footer marketing.
 *
 * - Le bouton « Fermer » émet `detailflow:close` : la modal du script parent se
 *   referme. Il n'est affiché qu'en mode MODAL (`?modal=1`, posé par le script
 *   d'intégration) : en intégration INLINE (iframe posée dans la page), le
 *   parent n'écoute pas `close`, donc on masque le bouton pour éviter un
 *   contrôle sans effet.
 * - Hauteur `min-h-dvh` + safe-area iOS pour un plein écran mobile correct.
 * - Le branding (couleurs) est injecté par le layout via des variables CSS ;
 *   ici on ne consomme que les tokens de thème (aucune couleur en dur).
 */
export function EmbedShell({
  brandName,
  logoSrc,
  children,
}: {
  brandName?: string | null
  logoSrc?: string | null
  children: React.ReactNode
}) {
  const searchParams = useSearchParams()
  const isModal = searchParams.get("modal") === "1"

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <EmbedBridge started />
      <header
        className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {logoSrc ? (
            <Image
              src={logoSrc || "/placeholder.svg"}
              alt={brandName ? `Logo ${brandName}` : "Logo"}
              width={112}
              height={32}
              className="h-7 w-auto object-contain"
              unoptimized
            />
          ) : brandName ? (
            <span className="truncate font-semibold text-foreground">{brandName}</span>
          ) : null}
        </div>
        {isModal && (
          <button
            type="button"
            onClick={() => postEmbedMessage("close")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Fermer la réservation"
          >
            <X className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Fermer</span>
          </button>
        )}
      </header>

      <main
        id="contenu"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  )
}
