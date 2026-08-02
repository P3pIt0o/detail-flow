import type { Metadata } from "next"
import { siteConfig, getWhatsAppUrl } from "@/config/site"
import { PageHeader } from "@/components/layout/page-header"
import { ContactForm } from "@/components/contact-form"
import { Reveal } from "@/components/ui/reveal"
import { Phone, Mail, MapPin, MessageCircle, Clock } from "lucide-react"
import { getPublicContact } from "@/lib/public-contact"

export const metadata: Metadata = {
  title: "Contact",
  description: "Contactez-nous pour toute demande d'information ou de réservation.",
  alternates: { canonical: "/contact" },
}

export default async function ContactPage() {
  // Coordonnées réelles du tenant (aucune donnée statique).
  const contact = await getPublicContact()
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Parlons de votre véhicule"
        description="Une question, une demande de devis ou une réservation ? Nous vous répondons rapidement."
      />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2">
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
                {siteConfig.contact.whatsapp && (
                  <ContactRow icon={MessageCircle} label="WhatsApp" href={getWhatsAppUrl()} external>
                    Discuter sur WhatsApp
                  </ContactRow>
                )}
                {contact.address && (
                  <ContactRow icon={MapPin} label="Adresse">
                    {contact.address}
                  </ContactRow>
                )}
              </div>

              {/* Horaires */}
              <div className="rounded-2xl border border-border bg-card/40 p-6">
                <div className="flex items-center gap-2 text-foreground">
                  <Clock className="size-5 text-primary" aria-hidden="true" />
                  <h2 className="font-semibold">Horaires d&apos;ouverture</h2>
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {siteConfig.hours.map((h) => (
                    <li key={h.day} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{h.label}</span>
                      <span className="text-foreground">
                        {h.open ? `${h.from} – ${h.to}` : "Fermé"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
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
      className="block rounded-xl transition-colors hover:bg-card/60"
    >
      {content}
    </a>
  )
}
