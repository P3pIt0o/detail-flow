"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import {
  CalendarCheck,
  Copy,
  Check,
  ExternalLink,
  Rocket,
  Sparkles,
  Globe,
  PencilRuler,
  ArrowRight,
  Settings,
} from "lucide-react"
import type { OnboardingIntentValue } from "@/lib/onboarding/intent"
import { cn } from "@/lib/utils"
import { ReadinessBanner, StepHeading, type ReadinessItem } from "@/components/admin/booking-hub/setup-overview"
import { LinkActions, LinkDisplay } from "@/components/admin/booking-hub/link-actions"
import { AddToSite } from "@/components/admin/booking-hub/add-to-site"
import { btnOutline, btnPrimary } from "@/components/admin/booking-hub/styles"

/**
 * Panneau d'accueil CONTEXTUEL du tableau de bord, piloté par le parcours choisi
 * avant l'inscription (`companies.onboardingIntent`, valeur canonique).
 *
 * Contrairement à l'ancienne version, il est PERSISTANT (plus lié à `?start=`) :
 * il retrouve toujours le bon parcours après reconnexion, sur n'importe quel
 * appareil, tant que la colonne est renseignée. Il n'est JAMAIS rendu pour un
 * tenant historique (`onboardingIntent` NULL) ni pour un site 100 % personnalisé
 * (Spirit ACS, Rozan, Cleanyzer, JustClean…) — cette décision est prise côté
 * serveur (voir lib/onboarding/intent.ts) ; ici on se contente d'afficher le
 * parcours reçu, et on n'invente aucune URL (toutes résolues côté serveur).
 *
 * Trois parcours, MUTUELLEMENT EXCLUSIFS — jamais de blocs contradictoires :
 *  - booking_only   : le pro a déjà un site → moteur de réservation en avant.
 *  - public_page    : le pro n'a pas de site → page publique DetailFlow en avant.
 *  - custom_website : site sur mesure → état de la demande (pas de /p/<slug>).
 */
export function StartFlowCard({
  intent,
  reservationUrl,
  pageUrl,
  configureHref,
  bookingSettingsHref,
  customRequestHref,
  isPublished,
  bookingSetup,
  scriptSnippet,
  iframeSnippet,
}: {
  intent: OnboardingIntentValue
  /** Lien public de réservation (absolu en prod, relatif en aperçu). */
  reservationUrl: string
  /** Lien public de la page (absolu en prod, relatif en aperçu). */
  pageUrl: string
  /** Lien tenant-safe vers le configurateur de page publique. */
  configureHref: string
  /** Lien tenant-safe vers l'assistant « Ma réservation en ligne ». */
  bookingSettingsHref: string
  /** État de configuration (booking_only uniquement), calculé côté serveur. */
  bookingSetup?: BookingSetupSnapshot
  /** Codes d'intégration (booking_only), slug injecté côté serveur. */
  scriptSnippet?: string
  iframeSnippet?: string
  /** Lien tenant-safe vers le formulaire de demande de site personnalisé. */
  customRequestHref: string
  /** La page publique standard est-elle déjà publiée ? */
  isPublished: boolean
}) {
  if (intent === "custom_website") {
    return <CustomWebsitePanel href={customRequestHref} />
  }

  // Parcours « réservation en ligne » (booking_only) : UNE seule URL de
  // réservation, présentée simplement, à utiliser de deux façons. Aucun jargon
  // « page publique » / « site internet » : le pro obtient un lien, il choisit
  // seulement OÙ le mettre.
  if (intent === "booking_only" && bookingSetup) {
    return (
      <BookingPanel
        reservationUrl={reservationUrl}
        hubHref={bookingSettingsHref}
        setup={bookingSetup}
        scriptSnippet={scriptSnippet ?? ""}
        iframeSnippet={iframeSnippet ?? ""}
      />
    )
  }

  // Parcours historique « page publique » (public_page) — comportement inchangé
  // pour les comptes existants qui l'ont déjà.
  return (
    <section className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Globe className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Votre page professionnelle</h2>
          <p className="text-xs text-muted-foreground text-pretty">
            Créez, personnalisez et publiez votre page DetailFlow, puis partagez-la avec vos clients.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <LinkRow
          icon={<Globe className="size-4" aria-hidden="true" />}
          label="Votre page publique"
          hint={
            isPublished
              ? "Votre page est en ligne. Partagez ce lien ; son bouton « Réserver » mène directement à votre prise de rendez-vous."
              : "Personnalisez puis publiez votre page pour la rendre accessible. Son bouton « Réserver » mènera à votre prise de rendez-vous."
          }
          url={pageUrl}
          muted={!isPublished}
        />
        <ConfigureLink
          href={configureHref}
          label={isPublished ? "Personnaliser ma page" : "Personnaliser et publier ma page"}
          icon={<Rocket className="size-4" aria-hidden="true" />}
          primary={!isPublished}
        />
      </div>
    </section>
  )
}

export type BookingSetupSnapshot = { ready: boolean; missing: ReadinessItem[] }

/**
 * Parcours « réservation en ligne » (booking_only) : Configurer → Tester →
 * Partager. Le lien public n'apparaît qu'UNE fois ; l'intégration au site est
 * une action secondaire, sans code affiché tant qu'on ne l'a pas demandé.
 */
function BookingPanel({
  reservationUrl,
  hubHref,
  setup,
  scriptSnippet,
  iframeSnippet,
}: {
  reservationUrl: string
  hubHref: string
  setup: BookingSetupSnapshot
  scriptSnippet: string
  iframeSnippet: string
}) {
  return (
    <section
      aria-labelledby="booking-panel-title"
      className="mb-6 flex flex-col gap-5 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <CalendarCheck className="size-5" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="booking-panel-title" className="text-lg font-semibold text-foreground text-balance">
            Ma réservation en ligne
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            Configurez votre réservation puis partagez-la avec vos clients.
          </p>
        </div>
      </div>

      <ReadinessBanner missing={setup.missing} />

      <ol className="flex flex-col gap-6">
        <li className="flex flex-col gap-3">
          <StepHeading
            as="h3"
            n={1}
            label="CONFIGURER"
            text="Choisissez vos prestations, horaires et lieux d'intervention."
            done={setup.ready}
          />
          <Link href={hubHref} className={cn(setup.ready ? btnOutline : btnPrimary, "sm:ml-11 sm:self-start")}>
            <Settings className="size-5" aria-hidden="true" />
            Configurer ma réservation
          </Link>
        </li>
        <li className="flex flex-col gap-3">
          <StepHeading as="h3" n={2} label="TESTER" text="Voyez exactement ce que verront vos clients." />
          <a
            href={reservationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(btnOutline, "sm:ml-11 sm:self-start")}
          >
            <ExternalLink className="size-5" aria-hidden="true" />
            Voir ma page de réservation
          </a>
        </li>
        <li className="flex flex-col gap-3">
          <StepHeading as="h3" n={3} label="PARTAGER" text="Votre réservation est prête ? Partagez votre lien." />
          <div className="flex flex-col gap-3 sm:ml-11">
            <LinkDisplay url={reservationUrl} />
            <LinkActions url={reservationUrl} primaryCopy={setup.ready} />
          </div>
        </li>
      </ol>

      <div className="border-t border-border pt-4">
        <AddToSite compact url={reservationUrl} scriptSnippet={scriptSnippet} iframeSnippet={iframeSnippet} />
      </div>
    </section>
  )
}

/**
 * Parcours « site personnalisé » : on n'expose JAMAIS /p/<slug> comme étant le
 * site commandé. On affiche l'état de la demande et on renvoie vers le
 * formulaire de qualification (dont l'envoi se fait par email).
 */
function CustomWebsitePanel({ href }: { href: string }) {
  return (
    <section className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PencilRuler className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Votre site personnalisé</h2>
          <p className="text-xs text-muted-foreground text-pretty">
            Un site sur mesure nécessite une prise en charge dédiée par notre équipe. Décrivez votre projet : nous
            l&apos;étudions et revenons vers vous.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Demande de site sur mesure
          </div>
          <p className="mt-1 text-xs text-muted-foreground text-pretty">
            En attendant, votre espace DetailFlow (réservations, clients, facturation) est déjà pleinement utilisable.
          </p>
          <div className="mt-3">
            <Link
              href={href}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <PencilRuler className="size-4" aria-hidden="true" />
              Décrire mon projet
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
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
  icon,
  primary,
}: {
  href: string
  label: string
  icon: React.ReactNode
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
      {icon}
      {label}
    </Link>
  )
}
