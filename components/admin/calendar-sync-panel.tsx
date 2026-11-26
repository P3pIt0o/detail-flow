"use client"

import { useEffect, useState, useTransition } from "react"
import { Check, CalendarPlus, Smartphone } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  refreshExternalCalendarAction,
  regenerateFeedAddressAction,
  removeExternalCalendarAction,
  saveExternalCalendarAction,
} from "@/app/admin/(dashboard)/mon-agenda/actions"

type Phone = "iphone" | "android"

/** Étapes illustrées par téléphone (pictogrammes, aucune image). */
export const PHONE_STEPS: Record<Phone, string[]> = {
  iphone: [
    "Ouvrez l'application Calendrier, puis touchez « Calendriers » en bas de l'écran.",
    "Touchez le « i » à côté de votre agenda, activez « Calendrier public », puis « Partager le lien » et « Copier ».",
    "Collez l'adresse ci-dessous et touchez « Enregistrer ».",
  ],
  android: [
    "Sur un ordinateur (ou en « version ordinateur »), ouvrez Google Agenda puis les paramètres de votre agenda.",
    "Dans « Intégrer l'agenda », copiez la rubrique « Adresse secrète ».",
    "Collez l'adresse ci-dessous et touchez « Enregistrer ».",
  ],
}

export function CalendarSyncPanel(props: {
  iphoneUrl: string
  googleUrl: string
  rawAddress: string
  externalMasked: string | null
  lastSuccessAt: string | null
  errorMessage: string | null
}) {
  const [phone, setPhone] = useState<Phone>("iphone")
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [address, setAddress] = useState("")

  useEffect(() => {
    if (/android/i.test(navigator.userAgent)) setPhone("android")
  }, [])

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    startTransition(async () => {
      const res = await fn()
      setMessage({ ok: res.ok, text: res.ok ? okText : (res.error ?? "Une erreur est survenue.") })
      if (res.ok) setAddress("")
    })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.rawAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage({ ok: false, text: "Copie impossible : sélectionnez l'adresse et copiez-la à la main." })
    }
  }

  const last = props.lastSuccessAt
    ? new Date(props.lastSuccessAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
    : null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Mon agenda</h1>
        <p className="text-sm text-muted-foreground">
          Retrouvez vos rendez-vous sur votre téléphone, et bloquez automatiquement les créneaux déjà pris dans votre agenda.
        </p>
      </header>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">1. Voir mes rendez-vous DetailFlow sur mon téléphone</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <a href={props.iphoneUrl} className={buttonVariants({ size: "lg", className: "h-12 text-base" })}>
            <Smartphone className="size-5" /> Ajouter à mon iPhone
          </a>
          <a
            href={props.googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 text-base" })}
          >
            <CalendarPlus className="size-5" /> Ajouter à Google Agenda
          </a>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Autre agenda</summary>
          <div className="mt-2 space-y-2">
            <p className="text-muted-foreground">Cette adresse est privée : ne la partagez pas.</p>
            <div className="flex gap-2">
              <Input readOnly value={props.rawAddress} aria-label="Adresse privée de votre agenda DetailFlow" />
              <Button type="button" variant="outline" onClick={copy}>
                {copied ? <Check className="size-4" /> : "Copier"}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm("L'ancienne adresse cessera de fonctionner. Continuer ?"))
                  run(regenerateFeedAddressAction, "Nouvelle adresse générée. Pensez à la remettre dans votre téléphone.")
              }}
            >
              Générer une nouvelle adresse
            </Button>
          </div>
        </details>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">2. Bloquer les créneaux déjà pris dans mon téléphone</h2>
        <p className="text-sm text-muted-foreground">Quel téléphone utilisez-vous ?</p>
        <div className="flex gap-2" role="group" aria-label="Type de téléphone">
          {(["iphone", "android"] as const).map((p) => (
            <Button key={p} type="button" variant={phone === p ? "default" : "outline"} onClick={() => setPhone(p)}>
              <Smartphone className="size-4" /> {p === "iphone" ? "iPhone" : "Android"}
            </Button>
          ))}
        </div>
        <ol className="space-y-2 text-sm">
          {PHONE_STEPS[phone].map((t, i) => (
            <li key={t} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          action={(fd) => run(() => saveExternalCalendarAction(fd), "Agenda relié. Vos créneaux occupés sont pris en compte.")}
        >
          <Input
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={props.externalMasked ?? "Collez ici l'adresse de votre agenda"}
            aria-label="Adresse de votre agenda"
            autoComplete="off"
          />
          <Button type="submit" disabled={pending || !address.trim()}>
            Enregistrer
          </Button>
        </form>

        {props.externalMasked ? (
          <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
            <p>
              Agenda relié : <strong>{props.externalMasked}</strong>
            </p>
            <p className="text-muted-foreground">
              {last ? `Dernière mise à jour réussie : ${last}.` : "Pas encore de mise à jour réussie."} Mise à jour automatique toutes les 15 minutes.
            </p>
            {props.errorMessage ? <p className="text-destructive">{props.errorMessage}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(refreshExternalCalendarAction, "Agenda actualisé.")}>
                Actualiser maintenant
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(removeExternalCalendarAction, "Agenda délié.")}>
                Délier
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {message ? (
        <p role="status" className={message.ok ? "text-sm text-green-700" : "text-sm text-destructive"}>
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
