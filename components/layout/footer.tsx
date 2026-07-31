import Link from "next/link"
import { Phone, Mail, MapPin } from "lucide-react"
import { siteConfig, getFullAddress } from "@/config/site"
import { withTenant } from "@/lib/tenant-link"
import { Logo } from "./logo"
import { socialIconMap } from "@/components/icons/social-icons"

type FooterProps = {
  /** Branding du tenant courant, transmis au logo et au copyright. */
  brandName?: string
  logoSrc?: string
  /** Slug du tenant courant : conserve ?tenant= sur les liens internes (aperçu). */
  tenantSlug?: string | null
}

export function Footer({ brandName, logoSrc, tenantSlug = null }: FooterProps = {}) {
  const year = new Date().getFullYear()
  const socials = Object.entries(siteConfig.social).filter(([, url]) => Boolean(url))
  const displayName = brandName || siteConfig.brand.name

  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Marque */}
          <div className="lg:col-span-1">
            <Logo brandName={brandName} logoSrc={logoSrc} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">{siteConfig.brand.tagline}</p>
            {socials.length > 0 && (
              <div className="mt-6 flex gap-3">
                {socials.map(([key, url]) => {
                  const Icon = socialIconMap[key as keyof typeof socialIconMap]
                  if (!Icon) return null
                  return (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={key}
                      className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <Icon className="size-4" />
                    </a>
                  )
                })}
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav aria-label="Pied de page — pages">
            <h2 className="text-sm font-semibold text-foreground">Navigation</h2>
            <ul className="mt-4 space-y-3">
              {siteConfig.nav.map((item) => (
                <li key={item.href}>
                  <Link href={withTenant(item.href, tenantSlug)} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Légal */}
          <nav aria-label="Pied de page — informations légales">
            <h2 className="text-sm font-semibold text-foreground">Informations</h2>
            <ul className="mt-4 space-y-3">
              {siteConfig.legalNav.map((item) => (
                <li key={item.href}>
                  <Link href={withTenant(item.href, tenantSlug)} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h2 className="text-sm font-semibold text-foreground">Contact</h2>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <a href={`tel:${siteConfig.contact.phoneRaw}`} className="flex items-start gap-2 transition-colors hover:text-foreground">
                  <Phone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {siteConfig.contact.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${siteConfig.contact.email}`} className="flex items-start gap-2 transition-colors hover:text-foreground">
                  <Mail className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {siteConfig.contact.email}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {getFullAddress()}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 text-center text-sm text-muted-foreground sm:flex-row sm:text-left">
          <p>
            &copy; {year} {displayName}. Tous droits réservés.
          </p>
          <p>Detailing automobile premium</p>
        </div>
      </div>
    </footer>
  )
}
