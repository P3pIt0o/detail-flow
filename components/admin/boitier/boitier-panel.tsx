"use client"

import { useState } from "react"
import { Cpu, Search, Plug } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DEFAULT_BOITIER_STATE,
  BOITIER_CONNECTION_LABELS,
  type BoitierConnectionState,
  type BoitierNetworkState,
  type BoitierSettings,
} from "@/lib/boitier/types"

const CONNECTION_DOT: Record<BoitierConnectionState, string> = {
  disconnected: "bg-muted-foreground/50",
  connecting: "bg-primary animate-pulse",
  connected: "bg-primary",
  error: "bg-destructive",
}

const NETWORK_LABELS: Record<BoitierNetworkState, string> = {
  online: "En ligne",
  offline: "Hors ligne",
  unknown: "Inconnu",
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

/**
 * Panneau de gestion du boîtier — INTERFACE UNIQUEMENT.
 * Aucune communication avec un appareil : l'état affiché est l'état par défaut
 * (déconnecté) et les actions sont désactivées en attendant l'implémentation du
 * contrat `BoitierClient` (futur ESP32). Les préférences sont modifiables
 * localement pour préfigurer l'expérience.
 */
export function BoitierPanel() {
  const { info } = DEFAULT_BOITIER_STATE
  const [connection] = useState<BoitierConnectionState>(DEFAULT_BOITIER_STATE.connection)
  const [settings, setSettings] = useState<BoitierSettings>(DEFAULT_BOITIER_STATE.settings)

  const toggle = (key: keyof BoitierSettings) =>
    setSettings((s) => ({ ...s, [key]: !s[key] }))

  const dash = "—"

  return (
    <Card className="max-w-2xl overflow-hidden">
      {/* En-tête + état */}
      <div className="flex items-center justify-between gap-4 border-b border-border p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Cpu className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Boîtier</h2>
            <p className="text-sm text-muted-foreground">Appareil connecté DetailFlow</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm font-medium text-foreground">
          <span className={cn("size-2 rounded-full", CONNECTION_DOT[connection])} aria-hidden="true" />
          {BOITIER_CONNECTION_LABELS[connection]}
        </span>
      </div>

      {/* Informations */}
      <div className="p-6">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Informations</h3>
        <dl className="divide-y divide-border">
          <InfoRow label="Nom du boîtier" value={info.name ?? dash} />
          <InfoRow label="Numéro de série" value={info.serialNumber ?? dash} />
          <InfoRow label="Version firmware" value={info.firmwareVersion ?? dash} />
          <InfoRow label="Dernière synchronisation" value={info.lastSyncAt ?? "Jamais"} />
          <InfoRow label="Adresse IP" value={info.ipAddress ?? dash} />
          <InfoRow label="État réseau" value={NETWORK_LABELS[info.networkState]} />
        </dl>
      </div>

      {/* Paramètres */}
      <div className="border-t border-border p-6">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Paramètres</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={settings.autoSync}
              onChange={() => toggle("autoSync")}
              className="size-4 rounded border-border"
              style={{ accentColor: "var(--primary)" }}
            />
            Synchronisation automatique
          </label>
          <label className="flex items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={() => toggle("notifications")}
              className="size-4 rounded border-border"
              style={{ accentColor: "var(--primary)" }}
            />
            Notifications
          </label>
        </div>
      </div>

      {/* Actions (inactives tant que la communication n'est pas implémentée) */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border p-6">
        <Button type="button" variant="outline" disabled>
          <Search className="size-4" aria-hidden="true" />
          Rechercher un boîtier
        </Button>
        <Button type="button" disabled>
          <Plug className="size-4" aria-hidden="true" />
          Connecter
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          La communication avec le boîtier sera disponible prochainement.
        </p>
      </div>
    </Card>
  )
}
