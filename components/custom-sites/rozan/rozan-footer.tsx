/**
 * Pied de page Rozan — section sombre premium, coordonnées réelles, zones et
 * liens de prestations (maillage interne SEO). Aucune donnée inventée : nom,
 * email, téléphone et réseaux proviennent de l'identité Rozan.
 */

import Link from "next/link"
import { Phone, Mail, MapPin } from "lucide-react"
import { InstagramIcon, FacebookIcon, TiktokIcon } from "@/components/icons/social-icons"
import { ROZAN_SECTIONS } from "./tokens"
import { ROZAN_BRAND, ROZAN_SERVICES, ROZAN_ZONES } from "./content"

export function RozanFooter() {
  const year = new Date().getFullYear()
  const activeServices = ROZAN_SERVICES.filter((s) => s.active)

  return (
    <footer className="rozan-footer bg-[var(--rozan-ink)] text-[var(--rozan-on-dark)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
          {/* Marque */}
          <div>
            <span className="rozan-title text-2xl text-white">
              {ROZAN_BRAND.shortName}
              <span className="text-[var(--rozan-accent)]">.</span>
            </span>
            <p className="mt-4 max-w-xs text-pretty text-sm leading-relaxed text-[var(--rozan-on-dark-muted)]">
              {ROZAN_BRAND.tagline} Nettoyage professionnel à domicile, autonome en eau et en électricité.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {[
                { label: "Instagram", href: ROZAN_BRAND.socials.instagram, Icon: InstagramIcon },
                { label: "Facebook", href: ROZAN_BRAND.socials.facebook, Icon: FacebookIcon },
                { label: "TikTok", href: ROZAN_BRAND.socials.tiktok, Icon: TiktokIcon },
              ].map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition-colors hover:border-[var(--rozan-accent)] hover:text-[var(--rozan-accent)]"
                >
                  <Icon className="size-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* Prestations */}
          <nav aria-label="Prestations">
            <h3 className="rozan-eyebrow">Prestations</h3>
            <ul className="mt-4 space-y-2.5">
              {activeServices.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/prestations/${s.slug}`}
                    className="text-sm text-[var(--rozan-on-dark-muted)] transition-colors hover:text-white"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Zones */}
          <nav aria-label="Zones d'intervention">
            <h3 className="rozan-eyebrow">Zones</h3>
            <ul className="mt-4 space-y-2.5">
              {[...ROZAN_ZONES.france.cities.slice(0, 4), ...ROZAN_ZONES.suisse.cities.slice(0, 3)].map((city) => (
                <li key={city} className="text-sm text-[var(--rozan-on-dark-muted)]">
                  {city}
                </li>
              ))}
              <li className="text-sm text-[var(--rozan-accent)]">Pays de Gex &amp; Genève</li>
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h3 className="rozan-eyebrow">Contact</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a href={`tel:${ROZAN_BRAND.phoneRaw}`} className="flex items-center gap-2.5 text-sm text-white transition-colors hover:text-[var(--rozan-accent)]">
                  <Phone className="size-4 flex-none text-[var(--rozan-accent)]" aria-hidden="true" />
                  {ROZAN_BRAND.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${ROZAN_BRAND.email}`} className="flex items-center gap-2.5 break-all text-sm text-[var(--rozan-on-dark-muted)] transition-colors hover:text-white">
                  <Mail className="size-4 flex-none text-[var(--rozan-accent)]" aria-hidden="true" />
                  {ROZAN_BRAND.email}
                </a>
              </li>
              <li className="flex items-center gap-2.5 text-sm text-[var(--rozan-on-dark-muted)]">
                <MapPin className="size-4 flex-none text-[var(--rozan-accent)]" aria-hidden="true" />
                {ROZAN_BRAND.regionLabel}
              </li>
            </ul>
            <a
              href={`#${ROZAN_SECTIONS.devis}`}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[var(--rozan-accent)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--rozan-accent-strong)]"
            >
              Obtenir mon devis
            </a>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-[var(--rozan-on-dark-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {ROZAN_BRAND.name}. Tous droits réservés.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/mentions-legales" className="transition-colors hover:text-white">Mentions légales</Link>
            <Link href="/confidentialite" className="transition-colors hover:text-white">Confidentialité</Link>
            <Link href="/cgv" className="transition-colors hover:text-white">CGV</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
