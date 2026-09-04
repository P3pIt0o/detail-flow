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
import { toTelHref } from "@/lib/phone"
import { SPIRIT_SECTIONS } from "./tokens"
import { SPIRIT_BUSINESS } from "./seo-content"

type SpiritFooterProps = {
  brandName: string
  logoSrc: string | null
  phone: string | null
  phoneRaw: string | null
  email: string | null
  /** Ville seule (jamais l'adresse postale exacte). */
  city: string | null
  tagline: string | null
}

export function SpiritFooter({ brandName, logoSrc, phone, phoneRaw, email, city, tagline }: SpiritFooterProps) {
  const tenant = useSearchParams().get("tenant")
  const year = new Date().getFullYear()

  return (
    <footer className="bg-[var(--spirit-navy)]">
      {/* Fin filet d'accent (identité Spirit) séparant la page du pied de page. */}
      <div className="h-0.5 w-full bg-gradient-to-r from-[var(--spirit-teal)] via-[var(--spirit-pink)] to-[var(--spirit-teal)]" />
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

          {/* Pages publiques — Spirit n'expose ni « Prestations » ni les liens
              de réservation (parcours retiré de ce site). */}
          <nav aria-label="Pied de page — pages">
            <h2 className="spirit-eyebrow">Navigation</h2>
            <ul className="mt-4 space-y-3">
              {siteConfig.nav
                .filter((item) => item.href !== "/prestations" && !item.href.startsWith("/reservation"))
                .map((item) => (
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

          {/* Contact — coordonnées réelles uniquement. Porte l'ancre #contact
              (destination du lien « Contact » de la navigation), rattachée aux
              coordonnées existantes après le retrait du bloc final redondant. */}
          <div id={SPIRIT_SECTIONS.contact} data-spirit-anchor className="scroll-mt-24">
            <h2 className="spirit-eyebrow">Contact</h2>
            {/* Coordonnées complètes et vérifiées. Le tél. utilise un lien
                tel:+33699901303 (via toTelHref, repli sur le numéro vérifié).
                Adresse en <address> sémantique (non justifiée, alignée à gauche). */}
            <ul className="mt-4 space-y-3 text-sm text-[color:var(--spirit-muted)]">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--spirit-teal)]" aria-hidden="true" />
                <address className="not-italic leading-relaxed">
                  <span className="block text-white/90">
                    {SPIRIT_BUSINESS.alternateName} – {SPIRIT_BUSINESS.name}
                  </span>
                  <span className="block">{SPIRIT_BUSINESS.streetAddress}</span>
                  <span className="block">
                    {SPIRIT_BUSINESS.postalCode} {SPIRIT_BUSINESS.addressLocality}
                  </span>
                </address>
              </li>
              {phone && (
                <li>
                  <a
                    href={toTelHref(phoneRaw ?? phone) ?? `tel:${SPIRIT_BUSINESS.phone}`}
                    className="flex items-start gap-2 transition-colors hover:text-white"
                  >
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
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-[color:var(--spirit-muted)]">
          <p>
            &copy; {year} {brandName}. Tous droits réservés.
          </p>
          {/* Signature discrète. DetailFlow renvoie à son site officiel ;
              SiteAlpha reste du texte (aucune URL officielle configurée). */}
          <p className="mt-2 text-xs text-[color:var(--spirit-muted)]/70">
            Site créé par{" "}
            {siteConfig.seo.url ? (
              <a
                href={siteConfig.seo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 transition-colors hover:text-white hover:underline"
              >
                DetailFlow
              </a>
            ) : (
              "DetailFlow"
            )}{" "}
            &middot; Géré par SiteAlpha
          </p>
        </div>
      </div>
    </footer>
  )
}
