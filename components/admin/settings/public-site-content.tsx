"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { saveSiteContent } from "@/app/admin/(dashboard)/parametres/branding-actions"
import type { SiteContent } from "@/lib/site-content"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"

type Props = {
  /** Contenu résolu (fusion des valeurs enregistrées + valeurs par défaut). */
  content: Required<{ [K in keyof SiteContent]: Required<SiteContent[K]> }>
}

/**
 * Paramètres > Site public.
 *
 * Interface simple (accordéon) pour personnaliser les textes des sections
 * statiques de la vitrine : Présentation, Pourquoi nous choisir, intro
 * Prestations, intro Galerie, intro Avis, Contact/CTA, Pied de page.
 *
 * Ne gère PAS les modules déjà fonctionnels (Header/Hero, CRUD Avis, CRUD
 * Prestations, CRUD Galerie) : uniquement les titres/intros et l'activation
 * des sections correspondantes. Un champ laissé vide retombe automatiquement
 * sur un texte par défaut neutre (voir lib/site-content.ts).
 */
export function PublicSiteContent({ content }: Props) {
  const router = useRouter()
  const [values, setValues] = useState<SiteContent>(content)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function set<K extends keyof SiteContent>(key: K, patch: Partial<SiteContent[K]>) {
    setValues((prev) => ({ ...prev, [key]: { ...(prev[key] as object), ...patch } }))
  }

  function save() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await saveSiteContent(values)
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      setNotice("Contenu du site public enregistré.")
      router.refresh()
    })
  }

  const points = values.whyUs?.points ?? content.whyUs.points
  const pointsText = points.join("\n")

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-pretty">
        Personnalisez les textes affichés sur votre site public. Un champ laissé vide affiche un texte par défaut.
      </p>

      <Accordion type="multiple" defaultValue={["about"]} className="space-y-3">
        {/* Présentation / À propos */}
        <AccordionItem value="about" className="rounded-2xl border border-border bg-card px-4">
          <AccordionTrigger className="text-base font-semibold text-foreground">Présentation</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <div>
              <label className={labelClass}>Titre</label>
              <input
                type="text"
                value={values.about?.title ?? ""}
                onChange={(e) => set("about", { title: e.target.value })}
                placeholder={content.about.title}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Texte</label>
              <textarea
                value={values.about?.text ?? ""}
                onChange={(e) => set("about", { text: e.target.value })}
                rows={4}
                placeholder={content.about.text}
                className={inputClass}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Libellé du bouton <span className="text-muted-foreground">(facultatif)</span>
                </label>
                <input
                  type="text"
                  value={values.about?.buttonLabel ?? ""}
                  onChange={(e) => set("about", { buttonLabel: e.target.value })}
                  placeholder="En savoir plus"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Lien du bouton <span className="text-muted-foreground">(facultatif)</span>
                </label>
                <input
                  type="text"
                  value={values.about?.buttonHref ?? ""}
                  onChange={(e) => set("about", { buttonHref: e.target.value })}
                  placeholder="/prestations"
                  className={inputClass}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Pourquoi nous choisir */}
        <AccordionItem value="whyUs" className="rounded-2xl border border-border bg-card px-4">
          <AccordionTrigger className="text-base font-semibold text-foreground">
            Pourquoi nous choisir
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-sm text-foreground">Afficher cette section sur le site public</span>
              <Switch
                checked={values.whyUs?.enabled ?? true}
                onCheckedChange={(checked) => set("whyUs", { enabled: checked })}
              />
            </div>
            <div>
              <label className={labelClass}>Titre</label>
              <input
                type="text"
                value={values.whyUs?.title ?? ""}
                onChange={(e) => set("whyUs", { title: e.target.value })}
                placeholder={content.whyUs.title}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Sous-titre</label>
              <input
                type="text"
                value={values.whyUs?.subtitle ?? ""}
                onChange={(e) => set("whyUs", { subtitle: e.target.value })}
                placeholder={content.whyUs.subtitle}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Avantages (un par ligne)</label>
              <textarea
                value={pointsText}
                onChange={(e) => set("whyUs", { points: e.target.value.split("\n") })}
                rows={4}
                placeholder={content.whyUs.points.join("\n")}
                className={inputClass}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Prestations (intro) */}
        <AccordionItem value="services" className="rounded-2xl border border-border bg-card px-4">
          <AccordionTrigger className="text-base font-semibold text-foreground">Prestations</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              Les prestations elles-mêmes se gèrent dans l&apos;onglet Prestations. Ici, seul le titre et le texte
              d&apos;introduction de la section sont personnalisables.
            </p>
            <div>
              <label className={labelClass}>
                Sur-titre <span className="text-muted-foreground">(facultatif — laisser vide pour le masquer)</span>
              </label>
              <input
                type="text"
                value={values.services?.eyebrow ?? ""}
                onChange={(e) => set("services", { eyebrow: e.target.value })}
                placeholder="Nos prestations"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Titre de la section</label>
              <input
                type="text"
                value={values.services?.title ?? ""}
                onChange={(e) => set("services", { title: e.target.value })}
                placeholder={content.services.title}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Texte d&apos;introduction</label>
              <textarea
                value={values.services?.intro ?? ""}
                onChange={(e) => set("services", { intro: e.target.value })}
                rows={3}
                placeholder={content.services.intro}
                className={inputClass}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Galerie */}
        <AccordionItem value="gallery" className="rounded-2xl border border-border bg-card px-4">
          <AccordionTrigger className="text-base font-semibold text-foreground">
            Galerie Avant / Après
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              Les photos se gèrent dans l&apos;onglet Galerie. Ici, seul le titre, le texte d&apos;introduction et
              l&apos;affichage de la section sont personnalisables.
            </p>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-sm text-foreground">Afficher cette section sur le site public</span>
              <Switch
                checked={values.gallery?.enabled ?? true}
                onCheckedChange={(checked) => set("gallery", { enabled: checked })}
              />
            </div>
            <div>
              <label className={labelClass}>Titre de la section</label>
              <input
                type="text"
                value={values.gallery?.title ?? ""}
                onChange={(e) => set("gallery", { title: e.target.value })}
                placeholder={content.gallery.title}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Texte d&apos;introduction</label>
              <textarea
                value={values.gallery?.intro ?? ""}
                onChange={(e) => set("gallery", { intro: e.target.value })}
                rows={3}
                placeholder={content.gallery.intro}
                className={inputClass}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Avis */}
        <AccordionItem value="reviews" className="rounded-2xl border border-border bg-card px-4">
          <AccordionTrigger className="text-base font-semibold text-foreground">Avis</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              Les avis eux-mêmes se gèrent dans l&apos;onglet Avis. Ici, seul le titre, le texte d&apos;introduction et
              l&apos;affichage de la section sont personnalisables.
            </p>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-sm text-foreground">Afficher cette section sur le site public</span>
              <Switch
                checked={values.reviews?.enabled ?? true}
                onCheckedChange={(checked) => set("reviews", { enabled: checked })}
              />
            </div>
            <div>
              <label className={labelClass}>Titre de la section</label>
              <input
                type="text"
                value={values.reviews?.title ?? ""}
                onChange={(e) => set("reviews", { title: e.target.value })}
                placeholder={content.reviews.title}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Texte d&apos;introduction</label>
              <textarea
                value={values.reviews?.intro ?? ""}
                onChange={(e) => set("reviews", { intro: e.target.value })}
                rows={3}
                placeholder={content.reviews.intro}
                className={inputClass}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Contact / CTA */}
        <AccordionItem value="contact" className="rounded-2xl border border-border bg-card px-4">
          <AccordionTrigger className="text-base font-semibold text-foreground">Contact</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-sm text-foreground">Afficher cette section sur le site public</span>
              <Switch
                checked={values.contact?.enabled ?? true}
                onCheckedChange={(checked) => set("contact", { enabled: checked })}
              />
            </div>
            <div>
              <label className={labelClass}>Titre</label>
              <input
                type="text"
                value={values.contact?.title ?? ""}
                onChange={(e) => set("contact", { title: e.target.value })}
                placeholder={content.contact.title}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Texte</label>
              <textarea
                value={values.contact?.text ?? ""}
                onChange={(e) => set("contact", { text: e.target.value })}
                rows={3}
                placeholder={content.contact.text}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Libellé du bouton</label>
              <input
                type="text"
                value={values.contact?.buttonLabel ?? ""}
                onChange={(e) => set("contact", { buttonLabel: e.target.value })}
                placeholder={content.contact.buttonLabel}
                className={inputClass}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Pied de page */}
        <AccordionItem value="footer" className="rounded-2xl border border-border bg-card px-4">
          <AccordionTrigger className="text-base font-semibold text-foreground">Pied de page</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              Vos coordonnées, réseaux sociaux et mentions légales restent gérés dans les autres onglets. Ici, un
              court texte de présentation et un slogan facultatifs.
            </p>
            <div>
              <label className={labelClass}>
                Texte de présentation <span className="text-muted-foreground">(facultatif)</span>
              </label>
              <textarea
                value={values.footer?.text ?? ""}
                onChange={(e) => set("footer", { text: e.target.value })}
                rows={2}
                placeholder="Votre spécialiste detailing de confiance."
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Slogan <span className="text-muted-foreground">(facultatif)</span>
              </label>
              <input
                type="text"
                value={values.footer?.tagline ?? ""}
                onChange={(e) => set("footer", { tagline: e.target.value })}
                placeholder="La propreté a un nom."
                className={inputClass}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">{notice}</div>
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
