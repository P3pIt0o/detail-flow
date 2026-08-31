"use client"

import { useState, useCallback } from "react"
import { Globe, Copy, Check, ExternalLink, Share2, AlertCircle } from "lucide-react"

/**
 * Carte « Mon site internet » (dashboard).
 *
 * L'URL est TOUJOURS résolue côté serveur (domaine racine + slug tenant) et
 * transmise en prop absolue `https://…`. Ce composant ne fabrique jamais d'URL :
 * il ne fait qu'afficher, copier, ouvrir et partager celle qu'on lui donne.
 * `url = null` signifie « site non publié / non joignable » → état explicite,
 * jamais de faux lien (ni localhost, ni Preview, ni lien admin).
 */
export function SiteLinkCard({ url }: { url: string | null }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  const displayUrl = url ? url.replace(/^https:\/\//, "").replace(/\?tenant=.*$/, (m) => m) : ""

  const doCopy = useCallback(async () => {
    if (!url) return
    setError(null)
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        throw new Error("clipboard indisponible")
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Erreur de copie réelle : message honnête, pas de fausse confirmation.
      setError("Copie impossible. Sélectionnez et copiez le lien manuellement.")
    }
  }, [url])

  const doShare = useCallback(async () => {
    if (!url) return
    setError(null)
    try {
      await navigator.share({ title: "Mon site", url })
    } catch (e) {
      // L'utilisateur a annulé le partage : ce n'est PAS une erreur.
      if (e instanceof DOMException && e.name === "AbortError") return
      // Sinon, repli silencieux sur la copie.
      void doCopy()
    }
  }, [url, doCopy])

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Globe className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Mon site internet</h2>
          <p className="text-xs text-muted-foreground">Partagez votre page de réservation.</p>
        </div>
      </div>

      {url ? (
        <>
          <p className="mt-3 truncate rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground" title={url}>
            {displayUrl}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={doCopy}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? "Lien copié" : "Copier le lien"}
            </button>

            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Ouvrir mon site
            </a>

            {canShare && (
              <button
                type="button"
                onClick={doShare}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Share2 className="size-4" aria-hidden="true" />
                Partager
              </button>
            )}
          </div>

          {copied && (
            <p role="status" className="mt-2 text-xs text-primary">
              Le lien a été copié dans le presse-papiers.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
          <p className="text-xs text-foreground">
            Votre site n&apos;est pas encore accessible publiquement. Finalisez sa configuration pour obtenir un lien à
            partager.
          </p>
        </div>
      )}
    </section>
  )
}
