"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Bell, Star, AlertTriangle, Mail, ExternalLink, Lock } from "lucide-react"
import {
  saveProReminderAction,
  saveReviewRequestAction,
  testReviewLinkAction,
} from "@/app/admin/(dashboard)/parametres/notifications-actions"

type Props = {
  canReminders: boolean
  canReviews: boolean
  /** Migration LOT D appliquée ? Sinon activation impossible (message clair). */
  migrationApplied: boolean
  /** Destinataire pro affiché clairement (email pro configuré). */
  proRecipient: string | null
  proReminderEnabled: boolean
  proReminderOffsetHours: number
  reviewRequestEnabled: boolean
  reviewRequestOffsetHours: number
  reviewRequestLink: string | null
  /** Lien d'avis effectif résolu côté serveur (Place ID Google configuré). */
  resolvedReviewLink: string | null
}

type Msg = { type: "ok" | "err"; text: string } | null

function LockedBanner() {
  return (
    <Card className="border-amber-500/30 bg-amber-500/10 p-4">
      <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
        <Lock className="size-4 shrink-0" aria-hidden="true" />
        Cette fonctionnalité n&apos;est pas incluse dans votre offre. Passez à une offre supérieure pour l&apos;activer.
      </p>
    </Card>
  )
}

export function NotificationsSettings(props: Props) {
  return (
    <div className="max-w-2xl space-y-8">
      <ProReminderCard {...props} />
      <ReviewRequestCard {...props} />
    </div>
  )
}

/* --------------------------- Rappel professionnel --------------------------- */

function ProReminderCard(props: Props) {
  const locked = !props.canReminders
  const [enabled, setEnabled] = useState(props.proReminderEnabled)
  const [offset, setOffset] = useState<number>(props.proReminderOffsetHours)
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, start] = useTransition()

  function save() {
    setMsg(null)
    start(async () => {
      const r = await saveProReminderAction({ enabled, offsetHours: offset })
      setMsg(
        r.ok
          ? { type: "ok", text: "Préférences enregistrées." }
          : { type: "err", text: r.error ?? "Erreur." },
      )
      if (!r.ok && r.migrationRequired) setEnabled(false)
    })
  }

  return (
    <div className="space-y-4">
      {locked ? <LockedBanner /> : null}
      {!props.migrationApplied ? (
        <Card className="border-border bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            L&apos;activation sera possible après la mise à jour de la base de données.
          </p>
        </Card>
      ) : null}

      <Card className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bell className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Me rappeler mes rendez-vous</h2>
              <p className="text-sm text-muted-foreground text-pretty">
                Recevez un email de rappel avant chaque rendez-vous confirmé.
              </p>
            </div>
          </div>
          <Badge variant={enabled ? "default" : "secondary"} className="shrink-0">
            {enabled ? "Activé" : "Désactivé"}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pro-reminder-enabled" className="text-sm font-medium">
            Activer le rappel par email
          </Label>
          <Switch
            id="pro-reminder-enabled"
            checked={enabled}
            disabled={(locked || !props.migrationApplied) && !enabled}
            onCheckedChange={(v) => {
              if ((locked || !props.migrationApplied) && v) return
              setEnabled(v)
            }}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Délai avant le rendez-vous</p>
          <div className="flex gap-2">
            {([1, 2, 24] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setOffset(h)}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  offset === h
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
                aria-pressed={offset === h}
              >
                {h} h avant
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Destinataire</p>
          {props.proRecipient ? (
            <p className="mt-0.5 flex items-center gap-2 text-sm font-medium text-foreground">
              <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
              {props.proRecipient}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-amber-600 dark:text-amber-400">
              Renseignez l&apos;email professionnel dans « Coordonnées » pour recevoir les rappels.
            </p>
          )}
        </div>

        {msg ? (
          <p className={`text-sm ${msg.type === "ok" ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
        ) : null}

        <Button onClick={save} disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </Card>
    </div>
  )
}

/* ---------------------------- Demande d'avis Google ---------------------------- */

function ReviewRequestCard(props: Props) {
  const locked = !props.canReviews
  const [enabled, setEnabled] = useState(props.reviewRequestEnabled)
  const [offset, setOffset] = useState<number>(props.reviewRequestOffsetHours)
  const [link, setLink] = useState(props.reviewRequestLink ?? "")
  const [msg, setMsg] = useState<Msg>(null)
  const [testMsg, setTestMsg] = useState<Msg>(null)
  const [testUrl, setTestUrl] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [testing, startTest] = useTransition()

  function save() {
    setMsg(null)
    start(async () => {
      const r = await saveReviewRequestAction({
        enabled,
        offsetHours: offset,
        link: link.trim() || null,
      })
      setMsg(
        r.ok
          ? { type: "ok", text: "Préférences enregistrées." }
          : { type: "err", text: r.error ?? "Erreur." },
      )
      if (!r.ok && r.migrationRequired) setEnabled(false)
    })
  }

  function testLink() {
    setTestMsg(null)
    setTestUrl(null)
    startTest(async () => {
      const r = await testReviewLinkAction({ link: link.trim() || null })
      if (r.ok && r.url) {
        setTestUrl(r.url)
        setTestMsg({ type: "ok", text: "Lien valide. Ouvrez-le pour vérifier la fiche." })
      } else {
        setTestMsg({ type: "err", text: r.error ?? "Lien invalide." })
      }
    })
  }

  const effectiveLink = link.trim() || props.resolvedReviewLink || null

  return (
    <div className="space-y-4">
      {locked ? <LockedBanner /> : null}
      {!props.migrationApplied ? (
        <Card className="border-border bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            L&apos;activation sera possible après la mise à jour de la base de données.
          </p>
        </Card>
      ) : null}

      <Card className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Star className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Demander un avis après la prestation</h2>
              <p className="text-sm text-muted-foreground text-pretty">
                Un email invite le client à laisser un avis Google une fois la prestation réalisée.
              </p>
            </div>
          </div>
          <Badge variant={enabled ? "default" : "secondary"} className="shrink-0">
            {enabled ? "Activé" : "Désactivé"}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="review-enabled" className="text-sm font-medium">
            Activer la demande d&apos;avis
          </Label>
          <Switch
            id="review-enabled"
            checked={enabled}
            disabled={(locked || !props.migrationApplied) && !enabled}
            onCheckedChange={(v) => {
              if ((locked || !props.migrationApplied) && v) return
              setEnabled(v)
            }}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Délai après la prestation</p>
          <div className="flex gap-2">
            {([2, 24] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setOffset(h)}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  offset === h
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
                aria-pressed={offset === h}
              >
                {h} h après
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="review-link" className="text-sm font-medium">
            Lien d&apos;avis Google
          </Label>
          <Input
            id="review-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://g.page/r/… ou https://search.google.com/local/writereview?placeid=…"
            className="mt-1"
            inputMode="url"
          />
          <p className="mt-1 text-xs text-muted-foreground text-pretty">
            {props.resolvedReviewLink && !link.trim()
              ? "Un lien est déjà déduit de votre fiche Google configurée. Vous pouvez le remplacer ici."
              : "Collez le lien de demande d'avis de votre fiche Google Business Profile."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={testLink} disabled={testing}>
              {testing ? "Vérification…" : "Tester le lien"}
            </Button>
            {testUrl ? (
              <a
                href={testUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ouvrir <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          {testMsg ? (
            <p className={`mt-1 text-sm ${testMsg.type === "ok" ? "text-primary" : "text-destructive"}`}>
              {testMsg.text}
            </p>
          ) : null}
        </div>

        {/* Aperçu STATIQUE de l'email (aucun envoi). */}
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Aperçu de l&apos;email</p>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-sm font-semibold text-foreground">Merci pour votre confiance !</p>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Bonjour, nous espérons que la prestation vous a pleinement satisfait. Votre avis nous aiderait beaucoup
              et ne prend qu&apos;une minute.
            </p>
            <span className="mt-3 inline-flex items-center rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
              Laisser un avis
            </span>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {effectiveLink ? "Le bouton pointera vers votre fiche Google." : "Configurez un lien pour activer le bouton."}
            </p>
          </div>
        </div>

        {msg ? (
          <p className={`text-sm ${msg.type === "ok" ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
        ) : null}

        <Button onClick={save} disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </Card>
    </div>
  )
}
