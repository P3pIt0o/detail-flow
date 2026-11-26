"use client"

import type { ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { Tabs } from "@/components/ui/tabs"

/**
 * Onglets des Paramètres PILOTÉS PAR L'ADRESSE (`?tab=`). Changer de pastille met
 * l'adresse à jour sans recharger la page et retire `bloc` : cliquer ensuite un
 * résultat de recherche change toujours l'adresse, donc rouvre bien le réglage.
 * Seuls les onglets visibles pour ce tenant (`tabs`, décidés côté serveur) sont acceptés.
 */
export function SettingsTabs({
  defaultTab,
  tabs,
  className,
  children,
}: {
  defaultTab: string | undefined
  tabs: string[]
  className?: string
  children: ReactNode
}) {
  const params = useSearchParams()
  const urlTab = params.get("tab")
  const value = urlTab && tabs.includes(urlTab) ? urlTab : defaultTab

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (typeof next !== "string" || !tabs.includes(next)) return
        window.history.replaceState(null, "", settingsTabUrl(params.toString(), next))
      }}
      className={className}
    >
      {children}
    </Tabs>
  )
}

/** Adresse après un changement de pastille : `tab` mis à jour, `bloc` retiré, le reste (ex. `tenant`) gardé. */
export function settingsTabUrl(search: string, tab: string): string {
  const p = new URLSearchParams(search)
  p.set("tab", tab)
  p.delete("bloc")
  return `?${p.toString()}`
}
