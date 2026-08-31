"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { CheckCircle2, CircleDashed, CreditCard, ExternalLink, Loader2, ShieldCheck } from "lucide-react"
import {
  startStripeOnboarding,
  refreshStripeStatus,
  openStripeDashboard,
  savePaymentSettings,
} from "@/app/admin/(dashboard)/parametres/payment-actions"

type PaymentMode = "none" | "deposit" | "full" | "choice"

type Props = {
  connected: boolean
  chargesEnabled: boolean
  detailsSubmitted: boolean
  paymentsEnabled: boolean
  paymentMode: PaymentMode
  feePercent: string
  /** Résumé lisible de l'acompte configuré (onglet Planning). */
  depositConfigured: boolean
  depositSummary: string
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "Qui reçoit l'argent des clients ?",
    a: "Vous. Les paiements sont versés directement sur votre compte Stripe, puis reversés sur votre compte bancaire selon votre calendrier de virement Stripe. DetailFlow ne conserve jamais vos fonds.",
  },
  {
    q: "Dois-je saisir une clé API ou un identifiant Stripe ?",
    a: "Non. Vous connectez votre compte via le parcours sécurisé officiel de Stripe. Aucune information technique ni bancaire ne transite par DetailFlow : la saisie de carte est entièrement gérée par Stripe.",
  },
  {
    q: "Quelle commission est prélevée ?",
    a: "DetailFlow prélève une commission fixe sur chaque paiement encaissé en ligne. Elle est déduite automatiquement ; le reste vous revient. Les frais de traitement Stripe s'appliquent en plus, côté Stripe.",
  },
  {
    q: "Puis-je désactiver les paiements en ligne ?",
    a: "Oui, à tout moment. La désactivation empêche de nouveaux paiements mais ne supprime rien : votre historique et votre compte Stripe restent intacts.",
  },
  {
    q: "Que se passe-t-il si un client ne paie pas ?",
    a: "La réservation reste en attente de paiement tant que l'encaissement n'est pas confirmé. Vous gardez la main pour la confirmer ou l'annuler manuellement.",
  },
]

export function PaymentsSettings(props: Props) {
  const [paymentsEnabled, setPaymentsEnabled] = useState(props.paymentsEnabled)
  const [mode, setMode] = useState<PaymentMode>(props.paymentMode)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [connectPending, startConnect] = useTransition()

  const canCollect = props.connected && props.chargesEnabled

  function goToStripe(action: () => Promise<{ ok: boolean; url?: string; error?: string }>) {
    setMsg(null)
    startConnect(async () => {
      const r = await action()
      if (r.ok && r.url) {
        window.location.href = r.url
        return
      }
      if (!r.ok) setMsg({ type: "err", text: r.error ?? "Erreur" })
    })
  }

  function refresh() {
    setMsg(null)
    startConnect(async () => {
      const r = await refreshStripeStatus()
      if (r.ok) window.location.reload()
      else setMsg({ type: "err", text: r.error ?? "Erreur" })
    })
  }

  function save() {
    setMsg(null)
    startTransition(async () => {
      const r = await savePaymentSettings({ paymentsEnabled, paymentMode: mode })
      setMsg(
        r.ok
          ? { type: "ok", text: "Préférences de paiement enregistrées." }
          : { type: "err", text: r.error ?? "Erreur" },
      )
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Paiements en ligne</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
            Encaissez un acompte ou le paiement intégral au moment de la réservation. Les fonds arrivent directement sur
            votre compte.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Commission {props.feePercent}%
        </Badge>
      </div>

      {/* Étape 1 — Compte de paiement */}
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <CreditCard className="size-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold text-foreground">Compte de paiement</h3>
        </div>

        <ul className="space-y-2 text-sm">
          <StatusRow ok={props.connected} label="Compte Stripe connecté" />
          <StatusRow ok={props.detailsSubmitted} label="Informations vérifiées par Stripe" />
          <StatusRow ok={props.chargesEnabled} label="Encaissements activés" />
        </ul>

        <div className="flex flex-wrap gap-2">
          {!canCollect ? (
            <Button onClick={() => goToStripe(startStripeOnboarding)} disabled={connectPending}>
              {connectPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {props.connected ? "Continuer la configuration" : "Connecter mon compte Stripe"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => goToStripe(openStripeDashboard)} disabled={connectPending}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Tableau de bord Stripe
            </Button>
          )}
          {props.connected ? (
            <Button variant="ghost" onClick={refresh} disabled={connectPending}>
              Rafraîchir le statut
            </Button>
          ) : null}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          La configuration se fait sur le parcours officiel et sécurisé de Stripe. Vous n&apos;avez aucune clé API ni
          identifiant à saisir dans DetailFlow.
        </p>
      </Card>

      {/* Étape 2 — Mode de paiement */}
      <Card className="space-y-4 p-6">
        <h3 className="font-semibold text-foreground">Mode de paiement demandé au client</h3>
        {!canCollect ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Terminez d&apos;abord la connexion de votre compte pour choisir un mode de paiement.
          </p>
        ) : null}

        <fieldset disabled={!canCollect} className="space-y-2">
          <ModeOption
            active={mode === "none"}
            onSelect={() => setMode("none")}
            title="Aucun paiement en ligne"
            desc="Le client réserve sans payer. Vous encaissez comme aujourd'hui."
          />
          <ModeOption
            active={mode === "deposit"}
            onSelect={() => setMode("deposit")}
            title="Acompte à la réservation"
            desc={
              props.depositConfigured
                ? `Montant de l'acompte : ${props.depositSummary} (réglage dans l'onglet Planning & acompte).`
                : "Aucun acompte n'est encore configuré. Définissez-le dans l'onglet Planning & acompte."
            }
            warn={mode === "deposit" && !props.depositConfigured}
          />
          <ModeOption
            active={mode === "full"}
            onSelect={() => setMode("full")}
            title="Paiement intégral"
            desc="Le client règle la totalité de la prestation au moment de la réservation."
          />
          <ModeOption
            active={mode === "choice"}
            onSelect={() => setMode("choice")}
            title="Laisser le client choisir"
            desc={
              props.depositConfigured
                ? `Le client choisit entre l'acompte (${props.depositSummary}) et le paiement intégral au moment de la réservation.`
                : "Le client pourra régler la totalité. Configurez un acompte dans l'onglet Planning & acompte pour proposer aussi l'acompte."
            }
          />
        </fieldset>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Activer les paiements en ligne</p>
            <p className="text-xs text-muted-foreground">Nécessaire pour demander un paiement dans le tunnel.</p>
          </div>
          <Switch
            checked={paymentsEnabled}
            onCheckedChange={setPaymentsEnabled}
            disabled={!canCollect}
            aria-label="Activer les paiements en ligne"
          />
        </div>

        {msg ? (
          <p className={`text-sm ${msg.type === "ok" ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
        ) : null}

        <Button onClick={save} disabled={pending || !canCollect}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Enregistrer
        </Button>
      </Card>

      {/* FAQ */}
      <Card className="p-6">
        <h3 className="mb-2 font-semibold text-foreground">Questions fréquentes</h3>
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>
    </div>
  )
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
      ) : (
        <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </li>
  )
}

function ModeOption({
  active,
  onSelect,
  title,
  desc,
  warn,
}: {
  active: boolean
  onSelect: () => void
  title: string
  desc: string
  warn?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex w-full flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
      }`}
    >
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className={`text-xs ${warn ? "text-destructive" : "text-muted-foreground"}`}>{desc}</span>
    </button>
  )
}
