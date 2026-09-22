"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { CalendarCheck, Copy, Check, ExternalLink, Rocket, Sparkles } from "lucide-react"
import type { OnboardingIntent } from "@/lib/onboarding/shared"

/**
 * Carte d'accueil post-inscription (« Vos deux prochaines étapes »).
 *
 * ADDITIVE et ÉPHÉMÈRE : rendue uniquement sur le tableau de bord juste après
 * la création d'un espace self-service (paramètre `?start=`), pour un tenant
 * STANDARD (jamais un site personnalisé). Aucun tenant existant n'est affecté :
 * en navigation normale, `?start=` est absent et la carte ne s'affiche pas.
 *
 * Elle matérialise les deux parcours décidés :
 *  - Cas A (« booking ») : le pro a déjà un site → on met en avant le LIEN DE
 *    RÉSERVATION `/p/<slug>/reservation`, qui fonctionne immédiatement.
 *  - Cas B (« page » / « website ») : on met en avant la PAGE PUBLIQUE
 *    `/p/<slug>`, à personnaliser puis publier depuis le configurateur.
 *
 * Ce composant n'invente aucune URL : il n'affiche/copie que celles résolues
 * côté serveur et passées en props.
 */
export function StartFlowCard({
  intent,
  reservationUrl,
  pageUrl,
  configureHref,
  isPublished,
}: {
  intent: OnboardingIntent
  /** Lien public de réservation (absolu en prod, relatif en aperçu). */
  reservationUrl: string
  /** Lien public de la page (absolu en prod, relatif en aperçu). */
  pageUrl: string
  /** Lien tenant-safe vers le configurateur de page publique. */
  configureHref: string
  /** La page publique standard est-elle déjà publiée ? */
  isPublished: boolean
}) {
  const bookingFirst = intent === "booking"

  return (
    <section className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Bienvenue ! Votre espace est prêt</h2>
          <p className="text-xs text-muted-foreground">
            {bookingFirst
              ? "Ajoutez la réservation en ligne à votre site existant."
              : "Partagez votre page professionnelle avec vos clients."}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {bookingFirst ? (
          <>
            <LinkRow
              icon={<CalendarCheck className="size-4" aria-hidden="true" />}
              label="Votre lien de réservation"
              hint="Collez ce lien sur votre site, votre fiche Google ou vos réseaux : vos clients réservent en ligne immédiatement."
              url={reservationUrl}
            />
            <ConfigureLink
              href={configureHref}
              label="Créer aussi une page publique (optionnel)"
            />
          </>
        ) : (
          <>
            <LinkRow
              icon={<CalendarCheck className="size-4" aria-hidden="true" />}
              label="Votre page publique"
              hint={
                isPublished
                  ? "Votre page est en ligne. Partagez ce lien avec vos clients."
                  : "Personnalisez puis publiez votre page pour la rendre accessible à ce lien."
              }
              url={pageUrl}
              muted={!isPublished}
            />
            <ConfigureLink
              href={configureHref}
              label={isPublished ? "Personnaliser ma page" : "Personnaliser et publier ma page"}
              primary={!isPublished}
            />
          </>
        )}
      </div>
    </section>
  )
}

function LinkRow({
  icon,
  label,
  hint,
  url,
  muted,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  url: string
  muted?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doCopy = useCallback(async () => {
    setError(null)
    try {
      if (!navigator?.clipboard?.writeText) throw new Error("clipboard indisponible")
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Copie impossible. Sélectionnez et copiez le lien manuellement.")
    }
  }, [url])

  const display = url.replace(/^https:\/\//, "")

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-xs text-muted-foreground text-pretty">{hint}</p>
      <p
        className={`mt-2 truncate rounded-md border border-border px-3 py-2 text-sm ${muted ? "bg-muted/40 text-muted-foreground" : "bg-muted/50 text-foreground"}`}
        title={url}
      >
        {display}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={doCopy}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? "Lien copié" : "Copier le lien"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Ouvrir
        </a>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function ConfigureLink({
  href,
  label,
  primary,
}: {
  href: string
  label: string
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          : "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      }
    >
      <Rocket className="size-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
