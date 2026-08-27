"use client"

import { HelpCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FIELD_HELP } from "@/lib/billing/field-help"

/**
 * Bouton « ? » d'aide contextuelle à placer à côté d'un champ difficile.
 * S'appuie sur le Dialog existant : ouverture au CLIC (jamais au survol), donc
 * identique et utilisable au tactile sur mobile. Contenu court et structuré.
 */
export function FieldHelp({ field, label }: { field: keyof typeof FIELD_HELP; label?: string }) {
  const help = FIELD_HELP[field]
  if (!help) return null

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`Aide : ${label ?? help.title}`}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        }
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{help.title}</DialogTitle>
          <DialogDescription className="sr-only">Aide pour le champ {help.title}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium text-foreground">Ce que c&apos;est</dt>
            <dd className="mt-0.5 text-muted-foreground leading-relaxed text-pretty">{help.what}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Pourquoi c&apos;est demandé</dt>
            <dd className="mt-0.5 text-muted-foreground leading-relaxed text-pretty">{help.why}</dd>
          </div>
          {help.where && (
            <div>
              <dt className="font-medium text-foreground">Où trouver l&apos;information</dt>
              <dd className="mt-0.5 text-muted-foreground leading-relaxed text-pretty">{help.where}</dd>
            </div>
          )}
          {help.example && (
            <div>
              <dt className="font-medium text-foreground">Exemple</dt>
              <dd className="mt-0.5 text-muted-foreground leading-relaxed text-pretty">{help.example}</dd>
            </div>
          )}
          {help.required && (
            <div className="rounded-lg bg-primary/5 px-3 py-2">
              <dt className="font-medium text-foreground">Obligatoire ?</dt>
              <dd className="mt-0.5 text-muted-foreground leading-relaxed text-pretty">{help.required}</dd>
            </div>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
