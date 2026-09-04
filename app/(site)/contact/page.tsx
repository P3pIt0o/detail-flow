import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { ContactForm } from "@/components/contact-form"
import { Reveal } from "@/components/ui/reveal"
import { Phone, Mail, MapPin, MessageCircle, Clock } from "lucide-react"
import { getPublicContact, getPublicHours } from "@/lib/public-contact"
import { requireWebsiteFeature } from "@/lib/licensing/website-guard"
import { resolveCustomSite } from "@/lib/custom-sites/server"
import { buildTenantMetadata, resolveTenantSeo } from "@/lib/seo/tenant-seo.server"
import { SPIRIT_PAGE_META } from "@/components/custom-sites/spirit-acs/seo-content"

/**
 * Métadonnées tenant-aware : la canonique pointe vers l'URL PUBLIQUE réelle du
 * tenant (`.../contact?tenant={slug}`) au lieu du chemin relatif « /contact »
 * erroné. Pour Spirit ACS, titre/description éditoriaux localisés ; sinon repli
 * générique construit à partir du nom du tenant.
 */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await resolveTenantSeo()
  const title = seo.isSpirit ? SPIRIT_PAGE_META.contact.title : `Contact | ${seo.siteName}`
  const description = seo.isSpirit
    ? SPIRIT_PAGE_META.contact.description
    : `Contactez ${seo.siteName} pour toute demande d'information ou de devis pour l'entretien de votre véhicule.`
  return buildTenantMetadata({ path: "/contact", title, description })
}

export default async function ContactPage() {
  // Garde du site vitrine (feature website). LEGACY / domaine racine => autorisé.
  await requireWebsiteFeature()

  // Coordonnées + horaires réels du tenant (aucune donnée statique).
  const [contact, hours, customSite] = await Promise.all([
    getPublicContact(),
    getPublicHours(),
    resolveCustomSite(),
  ])
  const whatsappHref = contact.phoneRaw
    ? `https://wa.me/${contact.phoneRaw.replace(/[^\d]/g, "")}`
    : null

  // Adresse cliquable vers Google Maps — UNIQUEMENT pour le site Spirit ACS.
  // Les autres tenants conservent EXACTEMENT le comportement actuel (adresse
  // non cliquable). On utilise strictement la valeur d'adresse RÉELLE affichée
  // (adresse complète si disponible, sinon la ville enregistrée), jamais une
  // valeur inventée ou codée en dur.
  const addressMapsHref =
    customSite?.key === "spirit-acs" && contact.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`
      : null
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Parlons de votre véhicule"
        description="Une question, une demande de devis ou une réservation ? Nous vous répondons rapidement."
      />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* A2 — `lg:items-start` empêche l'étirement des colonnes de la grille :
            sans cela, la colonne du formulaire (plus courte) était étirée à la
            hauteur de la colonne coordonnées + horaires, laissant une immense
            zone vide sous le bouton « Envoyer le message ». Chaque colonne prend
            désormais sa hauteur naturelle. Neutre pour les autres tenants
            (aucun contenu masqué), la page se termine juste après son contenu. */}
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
          {/* Coordonnées */}
          <Reveal>
            <div className="space-y-8">
              <div className="space-y-4">
                {contact.phone && (
                  <ContactRow icon={Phone} label="Téléphone" href={`tel:${contact.phoneRaw ?? contact.phone}`}>
                    {contact.phone}
                  </ContactRow>
                )}
                {contact.email && (
                  <ContactRow icon={Mail} label="Email" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </ContactRow>
                )}
                {whatsappHref && (
                  <ContactRow icon={MessageCircle} label="WhatsApp" href={whatsappHref} external>
                    Discuter sur WhatsApp
                  </ContactRow>
                )}
                {contact.address && (
                  <ContactRow
                    icon={MapPin}
                    label="Adresse"
                    {...(addressMapsHref ? { href: addressMapsHref, external: true } : {})}
                  >
                    {contact.address}
                  </ContactRow>
                )}
              </div>

              {/* Horaires — réels du tenant uniquement */}
              {hours.length > 0 && (
                <div className="rounded-2xl border border-border bg-card/40 p-6">
                  <div className="flex items-center gap-2 text-foreground">
                    <Clock className="size-5 text-primary" aria-hidden="true" />
                    <h2 className="font-semibold">Horaires d&apos;ouverture</h2>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm">
                    {hours.map((h) => (
                      <li key={h.day} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{h.label}</span>
                        <span className="text-foreground">
                          {h.open && h.from && h.to ? `${h.from} – ${h.to}` : "Fermé"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Reveal>

          {/* Formulaire */}
          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-foreground">Envoyez-nous un message</h2>
              <p className="mt-1 text-sm text-muted-foreground">Nous vous répondons sous 24h ouvrées.</p>
              <div className="mt-6">
                <ContactForm />
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

/* Ligne de coordonnée réutilisable */
function ContactRow({
  icon: Icon,
  label,
  href,
  external,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  href?: string
  external?: boolean
  children: React.ReactNode
}) {
  const content = (
    <div className="flex items-start gap-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium text-foreground">{children}</p>
      </div>
    </div>
  )

  if (!href) return content
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="block rounded-xl transition-colors hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {content}
    </a>
  )
}
