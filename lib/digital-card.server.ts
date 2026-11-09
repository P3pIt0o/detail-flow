import "server-only"

import { getCurrentTenant, tenantAcceptsBookings } from "@/lib/tenant"
import { getPublicContact } from "@/lib/public-contact"
import { getLocationConfig } from "@/lib/booking/location"
import { formatWorkshopAddress, isWorkshopAddressComplete } from "@/lib/booking/location-shared"
import { resolveTenantReviewLink } from "@/lib/notifications/review-resolver"
import { humanReservationUrl, humanSiteUrl } from "@/lib/admin/public-link"
import { tenantPublicPathUrl } from "@/lib/tenant-shared"
import { resolveDashboardIntent } from "@/lib/onboarding/intent"
import { resolveSiteContent } from "@/lib/site-content"
import {
  buildCardActions,
  buildVCard,
  cardLine,
  resolveDigitalCard,
  type CardAction,
  type DigitalCardSettings,
} from "@/lib/digital-card"

export type PublicDigitalCard = {
  slug: string
  name: string
  line: string | null
  logoSrc: string | null
  card: DigitalCardSettings
  actions: CardAction[]
  vcard: string
}

/**
 * Données de la carte digitale du tenant de la REQUÊTE (en-tête middleware, jamais une
 * valeur client). `null` → 404 : tenant inconnu/archivé/suspendu ou carte désactivée.
 */
export async function loadPublicDigitalCard(): Promise<PublicDigitalCard | null> {
  const tenant = await getCurrentTenant()
  if (!tenant || tenant.status === "SUSPENDED" || tenant.status === "ARCHIVED") return null
  const card = resolveDigitalCard((tenant.siteContent as { digitalCard?: unknown } | null)?.digitalCard, tenant.brandPrimary)
  if (!card.enabled) return null

  const [contact, location, reviewLink] = await Promise.all([
    getPublicContact(),
    getLocationConfig(tenant.id),
    resolveTenantReviewLink(tenant.id).catch(() => null),
  ])

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const isSpirit = tenant.customSiteKey === "spirit-acs"
  const intent = resolveDashboardIntent({ persisted: tenant.onboardingIntent, customSiteKey: tenant.customSiteKey })
  // Adresse publiée seulement pour un atelier complet : un detailer mobile ne publie pas son domicile.
  const workshop = location.workshopEnabled && isWorkshopAddressComplete(location) ? location : null
  const name = contact.name ?? tenant.name
  const line = cardLine(resolveSiteContent(tenant.siteContent).footer.tagline, contact.city)
  const website = contact.website ?? (intent === "booking_only" ? null : humanSiteUrl(tenant.slug, root))

  return {
    slug: tenant.slug,
    name,
    line,
    logoSrc: tenant.logoUrl ? `/api/company-logo?company=${encodeURIComponent(tenant.slug)}` : null,
    card,
    actions: buildCardActions({
      reservationUrl: tenantAcceptsBookings(tenant) && !isSpirit ? humanReservationUrl(tenant.slug, root) : null,
      phone: contact.phone,
      address: workshop ? formatWorkshopAddress(workshop) : null,
      reviewLink,
      contactUrl: tenantPublicPathUrl("/carte/contact", tenant.slug, root),
    }),
    vcard: buildVCard({
      name,
      phone: contact.phone,
      email: contact.email,
      website,
      address: workshop
        ? { street: workshop.workshopAddress, postalCode: workshop.workshopPostalCode, city: workshop.workshopCity }
        : null,
    }),
  }
}
