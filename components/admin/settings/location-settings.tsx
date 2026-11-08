"use client"

import { useState, useTransition } from "react"
import { Car, Store, Check, AlertCircle, Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { saveLocationLabels, saveLocationSettings } from "@/app/admin/(dashboard)/parametres/location-actions"
import {
  DEFAULT_LOCATION_LABELS,
  LOCATION_LABEL_MAX,
  isWorkshopAddressComplete,
  type LocationConfig,
  type LocationLabel,
  type LocationLabelsInput,
  type LocationType,
} from "@/lib/booking/location-shared"
import { TravelSettings } from "./travel-settings"

type TravelProps = React.ComponentProps<typeof TravelSettings>

/**
 * « Où recevez-vous vos clients ? » — deux cartes activables indépendamment.
 * Les réglages de déplacement EXISTANTS (TravelSettings) n'apparaissent que si
 * « Je me déplace » est activé ; l'adresse atelier que si « J'ai un atelier »
 * est activé. Aucune logique de calcul n'est recréée ici.
 */
export function LocationSettings({
  initial,
  initialLabels,
  travel,
  available,
}: {
  initial: LocationConfig
  /** Libellés saisis (siteContent.locationLabels) ; vide = texte par défaut. */
  initialLabels: LocationLabelsInput
  travel: TravelProps
  /** false tant que la migration « lieu » n'est pas appliquée. */
  available: boolean
}) {
  const [config, setConfig] = useState(initial)
  const [labels, setLabels] = useState(initialLabels)
  const [modeMsg, setModeMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [addrMsg, setAddrMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [labelsMsg, setLabelsMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pendingMode, startMode] = useTransition()
  const [pendingAddr, startAddr] = useTransition()
  const [pendingLabels, startLabels] = useTransition()

  function setLabel(mode: LocationType, field: keyof LocationLabel, value: string) {
    setLabels({ ...labels, [mode]: { ...labels[mode], [field]: value } })
    setLabelsMsg(null)
  }

  function saveLabels() {
    setLabelsMsg(null)
    startLabels(async () => {
      // Les champs d'une carte désactivée sont masqués mais renvoyés : leurs valeurs sont conservées.
      const res = await saveLocationLabels(labels)
      setLabelsMsg(res.ok ? { ok: true, text: "Enregistré" } : { ok: false, text: res.error })
    })
  }

  const labelFields = (mode: LocationType) => (
    <LabelFields mode={mode} value={labels[mode] ?? {}} disabled={pendingLabels} onChange={setLabel} />
  )

  function toggle(key: "mobileEnabled" | "workshopEnabled", value: boolean) {
    const next = { ...config, [key]: value }
    if (!next.mobileEnabled && !next.workshopEnabled) {
      setModeMsg({ ok: false, text: "Gardez au moins un lieu activé." })
      return
    }
    // Atelier seul sans adresse : on active la carte, l'adresse est demandée juste en dessous.
    const previous = config
    setConfig(next)
    setModeMsg(null)
    if (!next.mobileEnabled && !isWorkshopAddressComplete(next)) return
    startMode(async () => {
      const res = await saveLocationSettings(next)
      if (!res.ok) {
        setConfig(previous)
        setModeMsg({ ok: false, text: res.error })
      } else {
        setModeMsg({ ok: true, text: "Enregistré" })
      }
    })
  }

  function saveWorkshop() {
    setAddrMsg(null)
    if (!isWorkshopAddressComplete(config)) {
      setAddrMsg({ ok: false, text: "Renseignez l'adresse, le code postal et la ville." })
      return
    }
    startAddr(async () => {
      const res = await saveLocationSettings(config)
      setAddrMsg(res.ok ? { ok: true, text: "Adresse enregistrée" } : { ok: false, text: res.error })
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground text-balance">Où recevez-vous vos clients ?</h2>
          <p className="text-sm text-muted-foreground text-pretty">Choisissez comment vous réalisez vos prestations.</p>
        </div>

        {!available && (
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-pretty">
              L&apos;option atelier arrive très bientôt. En attendant, vos clients réservent une intervention à leur
              adresse.
            </span>
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <ModeCard
              id="mode-mobile"
              icon={<Car className="size-5" aria-hidden="true" />}
              title="Je me déplace chez mes clients"
              text="Vous intervenez à l'adresse du client."
              checked={config.mobileEnabled}
              disabled={!available || pendingMode}
              onChange={(v) => toggle("mobileEnabled", v)}
            />
            {available && config.mobileEnabled && labelFields("client")}
          </div>
          <div className="flex flex-col gap-3">
            <ModeCard
              id="mode-workshop"
              icon={<Store className="size-5" aria-hidden="true" />}
              title="J'ai un atelier"
              text="Vos clients viennent directement chez vous."
              checked={config.workshopEnabled}
              disabled={!available || pendingMode}
              onChange={(v) => toggle("workshopEnabled", v)}
            />
            {available && config.workshopEnabled && labelFields("workshop")}
          </div>
        </div>

        <StatusLine pending={pendingMode} msg={modeMsg} />

        {available && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-pretty">
              Facultatif. Laissé vide, le texte grisé s&apos;affiche. Visible par vos clients quand vous proposez les
              deux lieux.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveLabels} disabled={pendingLabels} className="h-12 px-6 text-base">
                {pendingLabels ? "Enregistrement…" : "Enregistrer les libellés"}
              </Button>
              <StatusLine pending={false} msg={labelsMsg} />
            </div>
          </div>
        )}
      </section>

      {config.workshopEnabled && available && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">Adresse de votre atelier</h3>
            <p className="text-sm text-muted-foreground text-pretty">
              Elle s&apos;affiche à vos clients et dans leur confirmation.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="workshopAddress">Adresse</Label>
            <Input
              id="workshopAddress"
              value={config.workshopAddress}
              onChange={(e) => setConfig({ ...config, workshopAddress: e.target.value })}
              placeholder="12 rue des Artisans"
              autoComplete="street-address"
              className="h-12 text-base"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="workshopPostalCode">Code postal</Label>
              <Input
                id="workshopPostalCode"
                value={config.workshopPostalCode}
                onChange={(e) => setConfig({ ...config, workshopPostalCode: e.target.value })}
                placeholder="75011"
                inputMode="numeric"
                autoComplete="postal-code"
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="workshopCity">Ville</Label>
              <Input
                id="workshopCity"
                value={config.workshopCity}
                onChange={(e) => setConfig({ ...config, workshopCity: e.target.value })}
                placeholder="Paris"
                autoComplete="address-level2"
                className="h-12 text-base"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveWorkshop} disabled={pendingAddr} className="h-12 px-6 text-base">
              {pendingAddr ? "Enregistrement…" : "Enregistrer l'adresse"}
            </Button>
            <StatusLine pending={false} msg={addrMsg} />
          </div>
        </section>
      )}

      {config.mobileEnabled && <TravelSettings {...travel} />}
    </div>
  )
}

function ModeCard({
  id,
  icon,
  title,
  text,
  checked,
  disabled,
  onChange,
}: {
  id: string
  icon: React.ReactNode
  title: string
  text: string
  checked: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
        checked ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base font-semibold leading-snug text-foreground">{title}</span>
        <span className="text-sm leading-relaxed text-muted-foreground">{text}</span>
      </span>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-1" />
    </label>
  )
}

/** Titre + description affichés aux clients pour un lieu ; placeholder = texte par défaut. */
function LabelFields({
  mode,
  value,
  disabled,
  onChange,
}: {
  mode: LocationType
  value: Partial<LocationLabel>
  disabled: boolean
  onChange: (mode: LocationType, field: keyof LocationLabel, value: string) => void
}) {
  const fields: { field: keyof LocationLabel; label: string }[] = [
    { field: "title", label: "Titre affiché aux clients" },
    { field: "text", label: "Description" },
  ]
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      {fields.map(({ field, label }) => {
        const id = `location-label-${mode}-${field}`
        const v = value[field] ?? ""
        const max = LOCATION_LABEL_MAX[field]
        return (
          <div key={field} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={id}>{label}</Label>
              <span className="text-xs tabular-nums text-muted-foreground" aria-hidden="true">
                {v.length}/{max}
              </span>
            </div>
            <Input
              id={id}
              value={v}
              maxLength={max}
              disabled={disabled}
              placeholder={DEFAULT_LOCATION_LABELS[mode][field]}
              onChange={(e) => onChange(mode, field, e.target.value)}
              className="h-12 text-base"
            />
          </div>
        )
      })}
    </div>
  )
}

function StatusLine({ pending, msg }: { pending: boolean; msg: { ok: boolean; text: string } | null }) {
  if (pending) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Enregistrement…
      </p>
    )
  }
  if (!msg) return null
  return (
    <p
      role={msg.ok ? "status" : "alert"}
      className={cn("flex items-center gap-1.5 text-sm", msg.ok ? "text-primary" : "text-destructive")}
    >
      {msg.ok ? <Check className="size-4" aria-hidden="true" /> : <AlertCircle className="size-4" aria-hidden="true" />}
      {msg.text}
    </p>
  )
}
