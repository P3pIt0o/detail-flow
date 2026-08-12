"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveSectionOrder } from "@/app/admin/(dashboard)/parametres/branding-actions"
import type { HomeSectionKey } from "@/lib/site-content"

type Props = {
  /**
   * Ordre initial résolu (clé + libellé), fourni par le serveur pour éviter
   * d'importer côté client des helpers serveur (lib/site-content → lib/tenant).
   */
  items: { key: HomeSectionKey; label: string }[]
}

/**
 * Paramètres > Site public > « Ordre des sections ».
 *
 * Réordonne les sections de la page d'accueil avec de simples boutons
 * Monter / Descendre (aucune librairie de drag-and-drop requise). Ne modifie
 * QUE l'ordre : le contenu de chaque section reste géré par ses propres blocs.
 */
export function SectionOrderSettings({ items: initialItems }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next)
    setNotice(null)
    setError(null)
  }

  function save() {
    setNotice(null)
    setError(null)
    startTransition(async () => {
      const res = await saveSectionOrder(items.map((i) => i.key))
      if (res.ok) {
        setNotice("Ordre des sections enregistré.")
        router.refresh()
      } else {
        setError(res.error ?? "Une erreur est survenue.")
      }
    })
  }

  return (
    <div className="max-w-xl">
      <h3 className="text-base font-semibold text-foreground">Ordre des sections</h3>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">
        Réorganisez l&apos;ordre d&apos;affichage des sections de votre page d&apos;accueil. Les sections désactivées
        restent masquées.
      </p>

      <ul className="mt-4 space-y-2">
        {items.map((item, index) => (
          <li
            key={item.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span className="flex items-center gap-3 text-sm font-medium text-foreground">
              <span className="inline-flex size-6 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                {index + 1}
              </span>
              {item.label}
            </span>
            <span className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => move(index, -1)}
                disabled={index === 0 || pending}
                aria-label={`Monter ${item.label}`}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1 || pending}
                aria-label={`Descendre ${item.label}`}
              >
                <ChevronDown className="size-4" />
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {notice && <p className="mt-3 text-sm text-primary">{notice}</p>}

      <div className="mt-4">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Enregistrer l&apos;ordre
        </Button>
      </div>
    </div>
  )
}
