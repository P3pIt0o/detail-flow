"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { MessageSquare, AlertTriangle } from "lucide-react"
import {
  saveSmsReminderSettings,
  createRechargeRequest,
  type CreateRechargeResult,
} from "@/app/admin/(dashboard)/parametres/sms-actions"
import {
  SMS_PACKS,
  SMS_MIN_CUSTOM_QUANTITY,
  SMS_LOW_BALANCE_THRESHOLD,
  SMS_BETA_BONUS,
  amountForQuantity,
  formatSmsAmount,
} from "@/lib/sms/config"

type Props = {
  balance: number
  betaBonusGranted: boolean
  enabled: boolean
  offsetHours: number
  template: string
  defaultTemplate: string
  revolutUrl: string | null
  revolutQrSrc: string | null
}

type PendingRecharge = Extract<CreateRechargeResult, { ok: true }>

export function SmsSettings(props: Props) {
  const [enabled, setEnabled] = useState(props.enabled)
  const [offset, setOffset] = useState<24 | 48>(props.offsetHours === 48 ? 48 : 24)
  const [template, setTemplate] = useState(props.template || props.defaultTemplate)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pending, start] = useTransition()

  const [open, setOpen] = useState(false)

  function save() {
    setMsg(null)
    start(async () => {
      const r = await saveSmsReminderSettings({ enabled, offsetHours: offset, template })
      setMsg(r.ok ? { type: "ok", text: "Préférences enregistrées." } : { type: "err", text: r.error ?? "Erreur." })
    })
  }

  const low = props.balance > 0 && props.balance <= SMS_LOW_BALANCE_THRESHOLD
  const empty = props.balance <= 0

  return (
    <div className="max-w-2xl space-y-6">
      {/* Récapitulatif lisible en un coup d'œil */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquare className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Rappels SMS</h2>
              <p className="text-sm text-muted-foreground text-pretty">
                Réduisez les oublis en envoyant automatiquement un rappel à vos clients avant leur rendez-vous.
              </p>
            </div>
          </div>
          <Badge variant={enabled ? "default" : "secondary"} className="shrink-0">
            {enabled ? "Activés" : "Désactivés"}
          </Badge>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-xs text-muted-foreground">SMS disponibles</p>
            <p className="text-2xl font-semibold text-foreground">{props.balance}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rappel</p>
            <p className="text-sm font-medium text-foreground">{offset} h avant</p>
          </div>
          {props.betaBonusGranted ? (
            <p className="text-xs text-muted-foreground">{SMS_BETA_BONUS} SMS offerts avec votre compte bêta</p>
          ) : null}
        </div>

        {/* Alerte solde faible / épuisé (discrète) */}
        {low ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              Votre solde SMS est bientôt épuisé.
            </p>
            <Button size="sm" onClick={() => setOpen(true)}>
              Acheter des SMS
            </Button>
          </div>
        ) : null}
        {empty ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              Votre solde SMS est épuisé. Les rappels sont temporairement suspendus.
            </p>
            <Button size="sm" onClick={() => setOpen(true)}>
              Acheter des SMS
            </Button>
          </div>
        ) : null}

        {!low && !empty ? (
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              Acheter des SMS
            </Button>
          </div>
        ) : null}
      </Card>

      {/* Configuration des rappels */}
      <Card className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="sms-enabled" className="text-sm font-medium">
              Activer les rappels SMS
            </Label>
            <p className="text-xs text-muted-foreground">Un SMS de rappel est envoyé avant chaque rendez-vous confirmé.</p>
          </div>
          <Switch id="sms-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Délai avant le rendez-vous</p>
          <div className="flex gap-2">
            {([24, 48] as const).map((h) => (
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

        <div>
          <Label htmlFor="sms-template" className="text-sm font-medium">
            Message envoyé
          </Label>
          <Textarea
            id="sms-template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={3}
            className="mt-2"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Variables disponibles : {"{prenom}"}, {"{entreprise}"}, {"{date}"}, {"{heure}"}.
          </p>
        </div>

        {msg ? (
          <p className={`text-sm ${msg.type === "ok" ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
        ) : null}

        <div>
          <Button onClick={save} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>

        <p className="border-t border-border pt-4 text-xs text-muted-foreground text-pretty">
          Les SMS sont facturés par notre opérateur. Les crédits achetés permettent de couvrir leur envoi depuis
          DetailFlow.
        </p>
      </Card>

      <RechargeDialog
        open={open}
        onOpenChange={setOpen}
        revolutUrl={props.revolutUrl}
        revolutQrSrc={props.revolutQrSrc}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Modal de recharge                                                          */
/* -------------------------------------------------------------------------- */

function RechargeDialog({
  open,
  onOpenChange,
  revolutUrl,
  revolutQrSrc,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  revolutUrl: string | null
  revolutQrSrc: string | null
}) {
  const [customMode, setCustomMode] = useState(false)
  const [customQty, setCustomQty] = useState(String(SMS_MIN_CUSTOM_QUANTITY))
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<PendingRecharge | null>(null)

  function reset() {
    setCreated(null)
    setError(null)
    setCustomMode(false)
    setCustomQty(String(SMS_MIN_CUSTOM_QUANTITY))
  }

  function submit(quantity: number) {
    setError(null)
    start(async () => {
      const r = await createRechargeRequest(quantity)
      if (r.ok) setCreated(r)
      else setError(r.error)
    })
  }

  const customQtyNum = Math.floor(Number(customQty))
  const customAmount = Number.isFinite(customQtyNum) && customQtyNum >= SMS_MIN_CUSTOM_QUANTITY ? amountForQuantity(customQtyNum) : null

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="max-w-md">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>Recharger mes SMS</DialogTitle>
              <DialogDescription>Choisissez une quantité. Le prix est affiché avant validation.</DialogDescription>
            </DialogHeader>

            {!customMode ? (
              <div className="grid grid-cols-2 gap-2">
                {SMS_PACKS.map((p) => (
                  <button
                    key={p.quantity}
                    type="button"
                    disabled={pending}
                    onClick={() => submit(p.quantity)}
                    className="flex flex-col items-start rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                  >
                    <span className="text-lg font-semibold text-foreground">{p.quantity} SMS</span>
                    <span className="text-sm text-muted-foreground">{formatSmsAmount(p.amountCents)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomMode(true)}
                  className="col-span-2 rounded-lg border border-dashed border-border p-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50"
                >
                  Autre quantité
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="custom-qty" className="text-sm">
                    Quantité de SMS (min. {SMS_MIN_CUSTOM_QUANTITY})
                  </Label>
                  <Input
                    id="custom-qty"
                    type="number"
                    min={SMS_MIN_CUSTOM_QUANTITY}
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    className="mt-1"
                  />
                </div>
                {customAmount != null ? (
                  <p className="text-sm text-muted-foreground">
                    Prix : <span className="font-semibold text-foreground">{formatSmsAmount(customAmount)}</span>
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCustomMode(false)} className="flex-1">
                    Retour
                  </Button>
                  <Button
                    onClick={() => submit(customQtyNum)}
                    disabled={pending || customAmount == null}
                    className="flex-1"
                  >
                    Valider
                  </Button>
                </div>
              </div>
            )}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <p className="text-xs text-muted-foreground text-pretty">
              Les SMS sont facturés par notre opérateur. Les crédits achetés permettent de couvrir leur envoi depuis
              DetailFlow.
            </p>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Votre demande de recharge a été créée.</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pack</span>
                <span className="font-medium text-foreground">{created.quantity} SMS</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant</span>
                <span className="font-medium text-foreground">{created.amountLabel}</span>
              </div>
              <div>
                <p className="text-muted-foreground">Référence</p>
                <p className="mt-1 rounded-md bg-primary/10 px-3 py-2 text-center text-lg font-bold tracking-widest text-primary">
                  {created.reference}
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground text-pretty">
              Indiquez cette référence lors de votre paiement afin que nous puissions identifier votre recharge.
            </p>

            {revolutQrSrc ? (
              <div className="flex justify-center">
                <Image
                  src={revolutQrSrc || "/placeholder.svg"}
                  alt="QR code de paiement Revolut"
                  width={180}
                  height={180}
                  className="rounded-lg border border-border"
                />
              </div>
            ) : null}

            {revolutUrl ? (
              <a
                href={revolutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
              >
                Payer avec Revolut
              </a>
            ) : (
              <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Le lien de paiement Revolut n&apos;est pas encore configuré. Contactez DetailFlow avec la référence
                ci-dessus.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Les SMS seront crédités après validation du paiement par DetailFlow.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
