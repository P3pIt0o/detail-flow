"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { saveSpiritSiteTexts } from "@/app/admin/(dashboard)/parametres/spirit-texts-actions"
import {
  SPIRIT_TEXT_FORM_SECTIONS,
  type SpiritTextFieldDef,
  type SpiritTextFieldValue,
} from "@/components/custom-sites/spirit-acs/site-texts"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "block text-sm font-medium text-foreground"

type Values = Record<string, SpiritTextFieldValue>

/**
 * Paramètres → Site public → « Textes du site » (Spirit ACS uniquement).
 *
 * Chaque champ est PRÉ-REMPLI avec la valeur réellement affichée sur le site
 * (override enregistré, sinon fallback exact du code) — jamais un simple
 * placeholder. Un badge indique défaut/personnalisé, un compteur de caractères
 * borne la saisie (maxLength), et un bouton réinitialise le champ (suppression
 * du seul override concerné). L'enregistrement n'envoie que les champs modifiés.
 */
export function SpiritSiteTexts({ initialValues }: { initialValues: Values }) {
  const router = useRouter()
  const [fields, setFields] = useState<Values>(initialValues)
  const [saved, setSaved] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialValues).map(([k, v]) => [k, v.value])),
  )
  const [pending, startTransition] = useTransition()
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function setValue(id: string, value: string) {
    setFields((prev) => ({ ...prev, [id]: { ...prev[id], value } }))
  }

  function applyResult(values: Values) {
    setFields(values)
    setSaved(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.value])))
  }

  function save() {
    setError(null)
    setNotice(null)
    const changed: Record<string, string> = {}
    for (const [id, f] of Object.entries(fields)) {
      if (f.value !== saved[id]) changed[id] = f.value
    }
    if (Object.keys(changed).length === 0) {
      setNotice("Aucune modification à enregistrer.")
      return
    }
    startTransition(async () => {
      const res = await saveSpiritSiteTexts(changed)
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      if (res.values) applyResult(res.values)
      setNotice("Textes enregistrés.")
      router.refresh()
    })
  }

  function reset(id: string) {
    setError(null)
    setNotice(null)
    setResettingId(id)
    startTransition(async () => {
      const res = await saveSpiritSiteTexts({ [id]: "" })
      setResettingId(null)
      if (!res.ok) {
        setError(res.error || "Erreur lors de la réinitialisation.")
        return
      }
      if (res.values) applyResult(res.values)
      setNotice("Texte réinitialisé.")
      router.refresh()
    })
  }

  function renderField(def: SpiritTextFieldDef) {
    const f = fields[def.id]
    if (!f) return null
    const count = f.value.length
    return (
      <div key={def.id} className="rounded-xl border border-border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`spirit-${def.id}`} className={labelClass}>
            {def.label}
          </label>
          <span
            className={
              f.custom
                ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            }
          >
            {f.custom ? "Texte personnalisé" : "Texte par défaut"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">{def.help}</p>
        {def.multiline ? (
          <textarea
            id={`spirit-${def.id}`}
            value={f.value}
            maxLength={f.max}
            rows={4}
            onChange={(e) => setValue(def.id, e.target.value)}
            className={`mt-2 ${inputClass}`}
          />
        ) : (
          <input
            id={`spirit-${def.id}`}
            type="text"
            value={f.value}
            maxLength={f.max}
            onChange={(e) => setValue(def.id, e.target.value)}
            className={`mt-2 ${inputClass}`}
          />
        )}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={() => reset(def.id)}
            disabled={pending || !f.custom}
          >
            {resettingId === def.id ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="mr-1.5 h-3 w-3" aria-hidden="true" />
            )}
            Réinitialiser
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {count} / {f.max}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground text-pretty">
          Ces textes sont visibles sur votre site et peuvent influencer son contenu éditorial. Les titres SEO, URLs et
          réglages techniques restent protégés.
        </p>
      </div>

      <Accordion type="multiple" defaultValue={[SPIRIT_TEXT_FORM_SECTIONS[0]?.id ?? "accueil"]} className="space-y-3">
        {SPIRIT_TEXT_FORM_SECTIONS.map((section) => (
          <AccordionItem key={section.id} value={section.id} className="rounded-2xl border border-border bg-card px-4">
            <AccordionTrigger className="text-base font-semibold text-foreground">{section.title}</AccordionTrigger>
            <AccordionContent className="space-y-5 pt-2">
              {section.groups.map((group) => (
                <div key={group.title} className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">{group.title}</h3>
                  {group.fields.map((def) => renderField(def))}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {error && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
          {notice}
        </div>
      )}

      <Button onClick={save} disabled={pending}>
        {pending && !resettingId ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        Enregistrer les textes
      </Button>
    </div>
  )
}
