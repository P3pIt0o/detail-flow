"use client"

import { useState } from "react"
import { Info, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import type { VehicleRow } from "./shared"

/**
 * Aide au choix de la catégorie de véhicule côté client.
 *
 * - N'affiche QUE les types réellement configurés par le tenant courant
 *   (les données proviennent déjà du serveur, scopées par entreprise).
 * - N'affiche description/exemples que s'ils sont renseignés (aucun bloc vide).
 * - Un clic sur une catégorie la sélectionne et ferme la fenêtre (facultatif).
 * - Réutilise le composant Dialog existant (responsive, pas de nouvelle lib).
 */
export function VehicleCategoryHelp({
  vehicleTypes,
  onSelect,
}: {
  vehicleTypes: VehicleRow[]
  onSelect?: (vehicleTypeId: number) => void
}) {
  const [open, setOpen] = useState(false)

  if (vehicleTypes.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
      >
        <Info className="h-3.5 w-3.5 shrink-0" />
        Je ne connais pas la catégorie de mon véhicule
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choisir la bonne catégorie</DialogTitle>
            <DialogDescription>
              Voici les catégories proposées. Sélectionnez celle qui correspond le mieux à votre véhicule.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {vehicleTypes.map((t) => {
              const description = t.description?.trim()
              const examples = t.examples?.trim()
              const clickable = Boolean(onSelect)

              const content = (
                <>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium text-card-foreground">{t.name}</span>
                    {clickable && <Check className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </span>
                  {description && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
                  )}
                  {examples && (
                    <span className="mt-1 block text-xs text-muted-foreground/80">{examples}</span>
                  )}
                </>
              )

              return (
                <li key={t.id}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelect?.(t.id)
                        setOpen(false)
                      }}
                      className="flex w-full flex-col items-start rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/50"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="rounded-lg border border-border bg-background p-3">{content}</div>
                  )}
                </li>
              )
            })}
          </ul>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Vous avez encore un doute&nbsp;? Choisissez la catégorie qui vous semble la plus proche. Le
            professionnel pourra la confirmer avant votre rendez-vous.
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
