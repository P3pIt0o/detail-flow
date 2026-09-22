"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import {
  Check,
  Copy,
  ExternalLink,
  Share2,
  Code2,
  Globe,
  Settings,
  Camera,
  MapPin,
  MessageCircle,
  QrCode,
  Info,
} from "lucide-react"

/**
 * MODULE DE RÉSERVATION INTÉGRABLE (parcours booking_only).
 *
 * Le professionnel a DÉJÀ son propre site. DetailFlow ne lui crée PAS de site
 * vitrine : on lui fournit (1) un lien de réservation à partager et (2) un code
 * d'intégration à coller dans SON site pour que le bouton « Réserver » ouvre le
 * MÊME moteur de réservation, directement dans sa page.
 *
 * Un SEUL moteur de réservation existe : le lien et l'iframe pointent tous deux
 * vers la route canonique `/p/<slug>/reservation` (l'iframe en mode `?embed=1`,
 * chrome DetailFlow masqué). Aucun deuxième tunnel n'est jamais créé, et le slug
 * du tenant est injecté CÔTÉ SERVEUR dans les snippets — le pro ne saisit jamais
 * d'identifiant technique.
 */
export function ReservationEmbedCard({
  reservationUrl,
  scriptSnippet,
  iframeSnippet,
  bookingSettingsHref,
}: {
  /** Lien public de réservation (absolu `https://…/p/<slug>/reservation`). */
  reservationUrl: string
  /** Snippet recommandé : conteneur + loader `embed.js` (auto-resize). */
  scriptSnippet: string
  /** Snippet de repli : iframe directe, sans JavaScript. */
  iframeSnippet: string
  /** Lien tenant-safe vers les réglages de réservation. */
  bookingSettingsHref: string
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ShareCard url={reservationUrl} />
      <EmbedCard scriptSnippet={scriptSnippet} iframeSnippet={iframeSnippet} />
      <div className="lg:col-span-2">
        <Link
          href={bookingSettingsHref}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Settings className="size-4" aria-hidden="true" />
          Configurer mon moteur de réservation
        </Link>
      </div>
    </div>
  )
}

/** Carte A — partager le lien (bio Instagram, Google, WhatsApp, QR…). */
function ShareCard({ url }: { url: string }) {
  const channels = [
    { label: "Instagram", icon: <Camera className="size-4" aria-hidden="true" /> },
    { label: "Google", icon: <MapPin className="size-4" aria-hidden="true" /> },
    { label: "WhatsApp", icon: <MessageCircle className="size-4" aria-hidden="true" /> },
    { label: "QR code", icon: <QrCode className="size-4" aria-hidden="true" /> },
  ]
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Share2 className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Partager mon lien</h2>
          <p className="text-xs text-muted-foreground text-pretty">
            À mettre dans votre bio Instagram, sur Google, WhatsApp ou à envoyer directement à un client.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {channels.map((c) => (
          <span
            key={c.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground"
          >
            <span className="text-primary">{c.icon}</span>
            {c.label}
          </span>
        ))}
      </div>

      <UrlPreview url={url} />

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={url} label="Copier mon lien" copiedLabel="Lien copié" primary />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Aperçu
        </a>
      </div>
    </section>
  )
}

/** Carte B — intégrer le module dans le site existant du professionnel. */
function EmbedCard({ scriptSnippet, iframeSnippet }: { scriptSnippet: string; iframeSnippet: string }) {
  const [mode, setMode] = useState<"script" | "iframe">("script")
  const snippet = mode === "script" ? scriptSnippet : iframeSnippet

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Code2 className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Intégrer le module à mon site</h2>
          <p className="text-xs text-muted-foreground text-pretty">
            Le moteur de réservation s&apos;affiche directement dans votre page, sans quitter votre site.
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Type d'intégration"
        className="mt-4 inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
      >
        <TabButton active={mode === "script"} onClick={() => setMode("script")}>
          Recommandé
        </TabButton>
        <TabButton active={mode === "iframe"} onClick={() => setMode("iframe")}>
          Sans script
        </TabButton>
      </div>

      <p className="mt-2 text-xs text-muted-foreground text-pretty">
        {mode === "script"
          ? "Le module s'ajuste automatiquement en hauteur. À privilégier si votre site accepte les balises « script »."
          : "Repli sans JavaScript, pour les éditeurs qui n'autorisent pas les balises « script »."}
      </p>

      <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-xs leading-relaxed text-foreground">
        <code>{snippet}</code>
      </pre>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={snippet} label="Copier le code" copiedLabel="Code copié" primary />
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-xs text-muted-foreground">
          <li>Copiez le code ci-dessus</li>
          <li>Ouvrez l&apos;éditeur de votre site (page ou bloc « HTML / intégration »)</li>
          <li>Collez le code à l&apos;endroit où doit apparaître la réservation</li>
          <li>Publiez votre site</li>
        </ol>
      </div>
    </section>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "min-h-8 rounded-md bg-background px-3 py-1 text-xs font-medium text-foreground shadow-sm"
          : "min-h-8 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {children}
    </button>
  )
}

/** Aperçu (non éditable) de l'URL, tronqué proprement. */
function UrlPreview({ url }: { url: string }) {
  const display = url.replace(/^https:\/\//, "")
  return (
    <p
      className="mt-3 truncate rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
      title={url}
    >
      <span className="mr-1.5 inline-flex size-4 -mb-0.5 items-center justify-center text-primary">
        <Globe className="size-4" aria-hidden="true" />
      </span>
      {display}
    </p>
  )
}

/** Bouton « Copier » réutilisable (clipboard + repli message manuel). */
function CopyButton({
  value,
  label,
  copiedLabel,
  primary,
}: {
  value: string
  label: string
  copiedLabel: string
  primary?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doCopy = useCallback(async () => {
    setError(null)
    try {
      if (!navigator?.clipboard?.writeText) throw new Error("clipboard indisponible")
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Copie impossible. Sélectionnez et copiez le contenu manuellement.")
    }
  }, [value])

  return (
    <>
      <button
        type="button"
        onClick={doCopy}
        className={
          primary
            ? "inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            : "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        }
      >
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {copied ? copiedLabel : label}
      </button>
      {error && (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
