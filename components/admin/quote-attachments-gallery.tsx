"use client"

/**
 * Galerie des photos jointes à une demande — espace ADMIN uniquement.
 *
 * Les images sont servies par la route authentifiée `/api/quote-photos/view`
 * (jamais d'URL privée exposée dans le HTML public). On ne reçoit ici que des
 * identifiants numériques ; l'autorisation (session + entreprise + cohérence
 * demande) est revérifiée à chaque lecture côté serveur. Les blobs stockés sont
 * déjà optimisés à l'envoi (≤ 2560 px), donc raisonnables à afficher.
 */

import { useEffect, useState } from "react"
import { Download, X, ImageOff } from "lucide-react"
import { formatBytes } from "@/lib/quote-photos/config"

export interface AttachmentVM {
  id: number
  name: string
  size: number
  contentType: string
}

/**
 * Construit l'URL de lecture authentifiée d'une photo.
 *
 * IMPORTANT (isolation multi-tenant) : la route `/api/quote-photos/view` résout
 * son tenant à partir de l'en-tête `x-tenant-slug` posé par le middleware. Sur
 * le domaine racine, une requête `<img>`/téléchargement SANS `?tenant=` ferait
 * retomber la route sur l'appartenance de l'utilisateur (sa plus ancienne
 * entreprise) — potentiellement un AUTRE tenant → 404. On propage donc le slug
 * du tenant courant (celui déjà résolu et vérifié par la page) pour garantir la
 * cohérence. L'autorisation réelle (session + appartenance + périmètre
 * entreprise de la pièce jointe) reste revérifiée côté serveur.
 */
function viewUrl(id: number, tenantSlug: string | null, download = false): string {
  const params = new URLSearchParams()
  params.set("id", String(id))
  if (download) params.set("download", "1")
  if (tenantSlug) params.set("tenant", tenantSlug)
  return `/api/quote-photos/view?${params.toString()}`
}

export function QuoteAttachmentsGallery({
  attachments,
  tenantSlug = null,
}: {
  attachments: AttachmentVM[]
  tenantSlug?: string | null
}) {
  const [active, setActive] = useState<AttachmentVM | null>(null)

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active])

  if (attachments.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Photos jointes (0)</h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <ImageOff className="size-4" aria-hidden="true" />
          Aucune photo n&apos;a été jointe à cette demande.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Photos jointes ({attachments.length})</h2>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {attachments.map((a) => (
          <li key={a.id} className="group relative overflow-hidden rounded-lg border border-border bg-muted">
            <button
              type="button"
              onClick={() => setActive(a)}
              className="block aspect-square w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Agrandir la photo ${a.name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewUrl(a.id, tenantSlug) || "/placeholder.svg"}
                alt={a.name}
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform group-hover:scale-105"
              />
            </button>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="truncate text-[11px] text-muted-foreground" title={a.name}>
                {a.name}
              </span>
              <a
                href={viewUrl(a.id, tenantSlug, true)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={`Télécharger la photo ${a.name}`}
              >
                <Download className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </li>
        ))}
      </ul>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${active.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActive(null)}
        >
          <div className="relative max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewUrl(active.id, tenantSlug) || "/placeholder.svg"}
              alt={active.name}
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-sm text-white">
              <span className="truncate">
                {active.name} · {formatBytes(active.size)}
              </span>
              <div className="flex items-center gap-3">
                <a
                  href={viewUrl(active.id, tenantSlug, true)}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <Download className="size-4" aria-hidden="true" /> Télécharger
                </a>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  aria-label="Fermer"
                  className="inline-flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
