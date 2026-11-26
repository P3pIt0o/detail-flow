"use client"

import { useEffect, useState, useTransition } from "react"
import { Check, CalendarDays, CalendarPlus, ClipboardPaste, Copy, Info, Link2, Settings, Smartphone, type LucideIcon } from "lucide-react"
import { formatSince } from "@/lib/calendar-sync/ics-feed"
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

/** Un pictogramme par étape, dans l'ordre de PHONE_STEPS. */
const PHONE_ICONS: Record<Phone, LucideIcon[]> = {
  iphone: [CalendarDays, Info, ClipboardPaste],
  android: [Settings, Copy, Link2],
}

/** Abonnement à la main (DetailFlow → téléphone), si le bouton ne réagit pas. */
export const SUBSCRIBE_HELP: { title: string; steps: string[] }[] = [
  {
    title: "Sur iPhone",
    steps: [
      "Copiez l'adresse privée affichée plus bas.",
      "Ouvrez Réglages → Calendrier → Comptes → Ajouter un abonnement.",
      "Collez l'adresse, puis validez.",
    ],
  },
  {
    title: "Avec Google Agenda",
    steps: [
      "Copiez l'adresse privée affichée plus bas.",
      "Sur un ordinateur, ouvrez Google Agenda : à côté de « Autres agendas », cliquez sur « + » puis « À partir de l'URL ».",
      "Collez l'adresse, puis cliquez sur « Ajouter l'agenda ».",
    ],
  },
]

export function CalendarSyncPanel(props: {
  iphoneUrl: string
  googleUrl: string
  rawAddress: string
  externalMasked: string | null
  lastSuccessAt: string | null
  errorMessage: string | null
  blockCount: number
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

  // Calculé après montage : évite l'heure du serveur et les écarts d'hydratation.
  const [since, setSince] = useState<string | null>(null)
  useEffect(() => {
    const update = () => setSince(props.lastSuccessAt ? formatSince(props.lastSuccessAt, Date.now()) : null)
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [props.lastSuccessAt])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Mon agenda</h1>
        <p className="text-sm text-muted-foreground">
          Retrouvez vos rendez-vous sur votre téléphone, et bloquez automatiquement les créneaux déjà pris dans votre agenda.
        </p>
      </header>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">1. Mes rendez-vous dans mon téléphone</h2>
        <p className="text-sm text-muted-foreground">
          Vos rendez-vous DetailFlow apparaissent dans votre agenda, mis à jour automatiquement.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <a href={props.iphoneUrl} className={buttonVariants({ size: "lg", className: "h-12 text-base" })}>
            <Smartphone className="size-5" /> Ajouter à mon iPhone
          </a>
          <a
            href={props.googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg", className: "h-12 text-base" })}
          >
            <CalendarPlus className="size-5" /> Ajouter à Google Agenda
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Google Agenda peut mettre plusieurs heures à afficher un nouveau rendez-vous.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Le bouton ne marche pas ? Mode d&apos;emploi</summary>
          <div className="mt-2 space-y-2">
            {SUBSCRIBE_HELP.map((help) => (
              <div key={help.title}>
                <p className="font-medium">{help.title}</p>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  {help.steps.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </details>
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
        <h2 className="font-medium">2. Bloquer mes indisponibilités</h2>
        <p className="text-sm text-muted-foreground">
          Vos moments « occupés » ne seront plus proposés aux clients. Seuls les horaires sont lus, jamais le titre. Vos rendez-vous DetailFlow sont reconnus et ignorés automatiquement.
        </p>
        <p className="text-sm font-medium">Quel téléphone avez-vous ?</p>
        <div className="flex gap-2" role="group" aria-label="Type de téléphone">
          {(["iphone", "android"] as const).map((p) => (
            <Button key={p} type="button" variant={phone === p ? "default" : "outline"} onClick={() => setPhone(p)}>
              <Smartphone className="size-4" /> {p === "iphone" ? "iPhone" : "Android"}
            </Button>
          ))}
        </div>
        <p className="text-sm font-medium">Sur {phone === "iphone" ? "iPhone" : "Android"}, en 3 étapes</p>
        <ol className="space-y-2 text-sm">
          {PHONE_STEPS[phone].map((t, i) => {
            const Icon = PHONE_ICONS[phone][i]
            return (
              <li key={t} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  {i + 1}
                </span>
                <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <span>{t}</span>
              </li>
            )
          })}
        </ol>
        <p className="text-xs text-muted-foreground">
          Ne partagez pas ce lien : toute personne qui l&apos;a peut lire votre agenda.
        </p>
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
              {since
                ? `Dernière mise à jour ${since} — ${props.blockCount} ${props.blockCount > 1 ? "événements pris" : "événement pris"} en compte.`
                : props.lastSuccessAt
                  ? ""
                  : "Pas encore de mise à jour réussie."}{" "}
              Mise à jour automatique toutes les 15 minutes.
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
