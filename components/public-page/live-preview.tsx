"use client"

import { useEffect, useRef, useState } from "react"
import { Monitor, Smartphone, RefreshCw, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

type Device = "desktop" | "mobile"

/**
 * Aperçu EN DIRECT de la page publique dans une iframe même origine, avec
 * bascule desktop / mobile. La source pointe vers `/p/<slug>` (résolu par le
 * middleware, exactement comme le site en production). `reloadKey` force un
 * rechargement après un enregistrement pour refléter la config à jour.
 */
export function LivePreview({ previewPath, reloadKey }: { previewPath: string; reloadKey: number }) {
  const [device, setDevice] = useState<Device>("desktop")
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Cache-buster : garantit que l'iframe recharge une version fraîche du rendu
  // public après chaque enregistrement (revalidatePath côté serveur + ce param).
  const src = `${previewPath}?preview=${reloadKey}`

  useEffect(() => {
    if (iframeRef.current) iframeRef.current.src = src
  }, [src])

  function reload() {
    if (iframeRef.current) iframeRef.current.src = `${previewPath}?preview=${Date.now()}`
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Format d'aperçu">
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            aria-pressed={device === "desktop"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              device === "desktop" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Monitor className="size-4" aria-hidden="true" />
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            aria-pressed={device === "mobile"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              device === "mobile" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Smartphone className="size-4" aria-hidden="true" />
            Mobile
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            aria-label="Rafraîchir l'aperçu"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </button>
          <a
            href={previewPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Ouvrir
          </a>
        </div>
      </div>

      <div className="flex justify-center overflow-hidden rounded-xl bg-muted/40 p-3">
        <div
          className={cn(
            "overflow-hidden rounded-lg border border-border bg-background shadow-sm transition-all",
            device === "mobile" ? "w-[390px]" : "w-full",
          )}
        >
          <iframe
            ref={iframeRef}
            title="Aperçu de la page publique"
            src={src}
            className={cn("h-[720px] w-full border-0", device === "mobile" && "mx-auto")}
          />
        </div>
      </div>
    </div>
  )
}
