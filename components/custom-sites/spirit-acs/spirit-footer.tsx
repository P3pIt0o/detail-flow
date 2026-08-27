"use client"

/**
 * Pied de page du site Spirit ACS.
 *
 * N'affiche QUE des données réelles du tenant : logo, coordonnées publiques,
 * liens de pages publiques et liens légaux existants (mentions légales, CGV,
 * confidentialité). Aucun contenu inventé : un champ manquant est simplement
 * masqué. Les liens internes conservent le contexte tenant (`?tenant=`).
 */

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Phone, Mail, MapPin } from "lucide-react"
import { siteConfig } from "@/config/site"
import { withTenant } from "@/lib/tenant-link"

type SpiritFooterProps = {
  brandName: string
  logoSrc: string | null
  phone: string | null
  phoneRaw: string | null
  email: string | null
  address: string | null
  tagline: string | null
}

export function SpiritFooter({ brandName, logoSrc, phone, phoneRaw, email, address, tagline }: SpiritFooterProps) {
  const tenant = useSearchParams().get("tenant")
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/10 bg-[var(--spirit-navy)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Marque */}
          <div>
            <Link href={withTenant("/", tenant)} className="inline-flex items-center gap-2" aria-label={`${brandName} — accueil`}>
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc || "/placeholder.svg"} alt={brandName} className="h-12 w-auto max-w-[170px] object-contain" />
              ) : (
                <span className="spirit-title text-2xl text-white">{brandName}</span>
              )}
            </Link>
            {tagline && <p className="mt-4 max-w-xs text-sm leading-relaxed text-[color:var(--spirit-muted)]">{tagline}</p>}
          </div>

          {/* Pages publiques */}
          <nav aria-label="Pied de page — pages">
            <h2 className="spirit-eyebrow">Navigation</h2>
            <ul className="mt-4 space-y-3">
              {siteConfig.nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={withTenant(item.href, tenant)}
                    className="text-sm text-[color:var(--spirit-muted)] transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Légal */}
          <nav aria-label="Pied de page — informations légales">
            <h2 className="spirit-eyebrow">Informations</h2>
            <ul className="mt-4 space-y-3">
              {siteConfig.legalNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={withTenant(item.href, tenant)}
                    className="text-sm text-[color:var(--spirit-muted)] transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact — coordonnées réelles uniquement */}
          <div>
            <h2 className="spirit-eyebrow">Contact</h2>
            <ul className="mt-4 space-y-3 text-sm text-[color:var(--spirit-muted)]">
              {phone && (
                <li>
                  <a href={`tel:${phoneRaw ?? phone}`} className="flex items-start gap-2 transition-colors hover:text-white">
                    <Phone className="mt-0.5 size-4 shrink-0 text-[var(--spirit-teal)]" aria-hidden="true" />
                    {phone}
                  </a>
                </li>
              )}
              {email && (
                <li>
                  <a href={`mailto:${email}`} className="flex items-start gap-2 transition-colors hover:text-white">
                    <Mail className="mt-0.5 size-4 shrink-0 text-[var(--spirit-teal)]" aria-hidden="true" />
                    {email}
                  </a>
                </li>
              )}
              {address && (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--spirit-teal)]" aria-hidden="true" />
                  {address}
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-[color:var(--spirit-muted)]">
          <p>
            &copy; {year} {brandName}. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  )
}
