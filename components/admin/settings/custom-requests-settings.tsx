"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { saveCustomRequestsConfig } from "@/app/admin/(dashboard)/parametres/custom-requests-actions"
import {
  CUSTOM_REQUEST_DEFAULTS,
  type CustomRequestsConfig,
  type CustomRequestType,
} from "@/lib/custom-requests"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"

export function CustomRequestsSettings({ config }: { config: CustomRequestsConfig }) {
  const router = useRouter()
  const [values, setValues] = useState<CustomRequestsConfig>(config)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function patch(p: Partial<CustomRequestsConfig>) {
    setValues((prev) => ({ ...prev, ...p }))
  }

  function setType(index: number, p: Partial<CustomRequestType>) {
    setValues((prev) => ({
      ...prev,
      types: prev.types.map((t, i) => (i === index ? { ...t, ...p } : t)),
    }))
  }

  function addCustomType() {
    setValues((prev) => ({
      ...prev,
      types: [
        ...prev.types,
        { key: `type-${Date.now()}`, label: "", description: "", enabled: true, builtin: false },
      ],
    }))
  }

  function removeType(index: number) {
    setValues((prev) => ({ ...prev, types: prev.types.filter((_, i) => i !== index) }))
  }

  function save() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await saveCustomRequestsConfig(values)
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      setNotice("Demandes personnalisées enregistrées.")
      router.refresh()
    })
  }

  const builtins = values.types.map((t, i) => ({ t, i })).filter((x) => x.t.builtin)
  const customs = values.types.map((t, i) => ({ t, i })).filter((x) => !x.t.builtin)

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground text-pretty">
        Proposez à vos clients de décrire un besoin sur mesure (prestation spécifique, entretien régulier, flotte
        professionnelle…). Vous recevez la demande, envoyez une proposition, puis convertissez-la en rendez-vous.
      </p>

      {/* Activation */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
        <div>
          <span className="text-sm font-medium text-foreground">
            Accepter les demandes personnalisées sur mon site
          </span>
          <p className="text-xs text-muted-foreground">
            Désactivé, aucune card ni formulaire n&apos;apparaît sur votre site public.
          </p>
        </div>
        <Switch checked={values.enabled} onCheckedChange={(c) => patch({ enabled: c })} />
      </div>

      {values.enabled && (
        <>
          {/* Personnalisation de la card */}
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <h3 className="text-base font-semibold text-foreground">Card affichée sur votre site</h3>
            <p className="text-xs text-muted-foreground">Laissez un champ vide pour utiliser le texte par défaut.</p>
            <div>
              <label className={labelClass}>Titre</label>
              <input
                type="text"
                value={values.title ?? ""}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder={CUSTOM_REQUEST_DEFAULTS.title}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={values.description ?? ""}
                onChange={(e) => patch({ description: e.target.value })}
                rows={3}
                placeholder={CUSTOM_REQUEST_DEFAULTS.description}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Texte du bouton</label>
              <input
                type="text"
                value={values.ctaLabel ?? ""}
                onChange={(e) => patch({ ctaLabel: e.target.value })}
                placeholder={CUSTOM_REQUEST_DEFAULTS.ctaLabel}
                className={inputClass}
              />
            </div>
          </div>

          {/* Types de demandes */}
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Types de demandes proposés</h3>
              <p className="text-xs text-muted-foreground">
                Activez les catégories DetailFlow que vous souhaitez proposer, et ajoutez les vôtres.
              </p>
            </div>

            <div className="space-y-2">
              {builtins.map(({ t, i }) => (
                <div
                  key={t.key}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                >
                  <span className="text-sm text-foreground">{t.label}</span>
                  <Switch checked={t.enabled} onCheckedChange={(c) => setType(i, { enabled: c })} />
                </div>
              ))}
            </div>

            {customs.length > 0 && (
              <div className="space-y-3 border-t border-border pt-4">
                {customs.map(({ t, i }) => (
                  <div key={i} className="space-y-3 rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={t.label}
                        onChange={(e) => setType(i, { label: e.target.value })}
                        placeholder="Nom du type (ex. Préparation avant vente)"
                        className={inputClass}
                      />
                      <Switch checked={t.enabled} onCheckedChange={(c) => setType(i, { enabled: c })} />
                      <button
                        type="button"
                        onClick={() => removeType(i)}
                        aria-label="Supprimer ce type"
                        className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={t.description ?? ""}
                      onChange={(e) => setType(i, { description: e.target.value })}
                      placeholder="Courte description (facultatif)"
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addCustomType}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Ajouter un type de demande
            </Button>
          </div>
        </>
      )}

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
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        Enregistrer
      </Button>
    </div>
  )
}
