import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicationFlags } from "@/lib/company/publication"
import { isEmbedBlocked, usesLegacyBookingWizard } from "@/lib/company/publication-shared"
import { PageHeader } from "@/components/layout/page-header"
import { BookingWizard } from "@/components/booking/booking-wizard"
import { EmbedFrameSync } from "@/components/booking/embed-frame-sync"
import {
  getServices,
  getCategories,
  getVehicleTypes,
  getOptions,
  getServicePrices,
  getSettings,
} from "@/lib/booking/queries"
import { BookingV2 } from "@/components/booking-v2/booking-v2"
import { headers } from "next/headers"
import { publicSiteHref } from "@/lib/public-site-links"
import { resolvePublicRequestTenant, resolveRequestTenant } from "@/lib/tenant"
import { isOnlineBookingOpen } from "@/lib/booking/online-booking-access"
import { BookingUnavailable } from "@/components/booking/booking-unavailable"
import { getCompanyPaymentConfig } from "@/lib/payments/queries"
import { canUseFeature } from "@/lib/licensing/enforce"
import { resolvePaymentPlan, type PaymentPlan } from "@/lib/booking/v2"
import { getLocationConfig } from "@/lib/booking/location"
import { DEFAULT_LOCATION_CONFIG, toPublicLocation } from "@/lib/booking/location-shared"

/** Mêmes conditions que `createBookingAction` pour décider d'un paiement en ligne. */
async function resolveTenantPaymentPlan(settings: { depositType: string; depositValue: number }): Promise<PaymentPlan> {
  const tenant = await resolveRequestTenant()
  const [config, canPay] = tenant
    ? await Promise.all([getCompanyPaymentConfig(tenant.id), canUseFeature(tenant.id, "online_payments")])
    : [null, false]
  const mode = config?.paymentMode ?? "none"
  return resolvePaymentPlan({
    paymentsReady: canPay && Boolean(config?.paymentsEnabled) && Boolean(config?.canCollect) && mode !== "none",
    mode,
    depositType: settings.depositType,
    depositValue: settings.depositValue,
  })
}

export const metadata: Metadata = {
  title: "Réservation en ligne",
  description:
    "Réservez votre prestation de detailing en quelques clics : choix du service, du véhicule, des options, de la date et du créneau.",
}

// Données de référence en direct de la base : toujours à jour.
export const dynamic = "force-dynamic"

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string; view?: string }>
}) {
  // Mode embarqué (widget sur site externe) : on masque le chrome du site et
  // l'en-tête de page pour n'afficher que le moteur, et on synchronise la
  // hauteur avec le site hôte. Le moteur lui-même est STRICTEMENT le même.
  const { embed, view } = await searchParams
  const isEmbed = embed === "1"

  const requestTenant = await resolvePublicRequestTenant()
  if (!requestTenant && (await headers()).get("x-tenant-slug")?.trim()) notFound()

  // Contrôle serveur AVANT tout chargement de BookingV2 : tenant désactivé
  // (bookingMode DISABLED, suspendu, licence sans online_booking) → aucun
  // tunnel servi. Les tunnels historiques (Spirit ACS, Rozan) sont exclus.
  if (
    requestTenant &&
    !usesLegacyBookingWizard(requestTenant.customSiteKey) &&
    !isOnlineBookingOpen(requestTenant, await canUseFeature(requestTenant.id, "online_booking"))
  ) {
    return <BookingUnavailable embed={isEmbed} />
  }

  if (
    isEmbed &&
    requestTenant &&
    isEmbedBlocked(requestTenant.customSiteKey, requestTenant.status, await getPublicationFlags(requestTenant.id))
  ) {
    notFound()
  }

  const [services, categories, vehicleTypes, options, prices, settings] = await Promise.all([
    getServices(),
    getCategories(),
    getVehicleTypes(),
    getOptions(),
    getServicePrices(),
    getSettings(),
  ])

  // Table de correspondance tarifaire pour l'aperçu client (recalcul serveur à la validation).
  const priceMap: Record<string, { priceCents: number; durationMin: number }> = {}
  for (const p of prices) {
    priceMap[`${p.serviceId}-${p.vehicleTypeId}`] = { priceCents: p.priceCents, durationMin: p.durationMin }
  }

  // Booking V2 = tunnel STANDARD (site + widget). Seuls Spirit ACS et Rozan
  // conservent le tunnel historique, choisi par customSiteKey (jamais par
  // l'état de publication du site).
  if (!usesLegacyBookingWizard(requestTenant?.customSiteKey) && !settings.vacationMode) {
    // Même configuration de lieu pour le site standard ET le widget (?embed=1).
    const tenant = await resolveRequestTenant()
    const location = toPublicLocation(tenant ? await getLocationConfig(tenant.id) : DEFAULT_LOCATION_CONFIG)
    return (
      <>
        {isEmbed && (
          <>
            <script
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('df-embed')" }}
            />
            <EmbedFrameSync />
          </>
        )}
        {view === "both" && (
          <nav aria-label="Choix du service" className={`flex flex-wrap gap-2 px-4 ${isEmbed ? "pt-6" : "pt-24"}`}>
            <span aria-current="page" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Réserver une prestation
            </span>
            <a
              href={publicSiteHref("formules", {
                tenantKind: (await headers()).get("x-tenant-kind"),
                tenantSlug: requestTenant?.slug,
                embed: isEmbed,
                view,
              })} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">
              Formules d&apos;entretien
            </a>
          </nav>
        )}
        {/* Cleanyzer only: the standard Navbar is `fixed` (h-16), so BookingV2 must start below it. */}
        <section
          className={
            isEmbed
              ? "bg-background py-6"
              : requestTenant?.customSiteKey?.trim() === "cleanyzer"
                ? "bg-background pb-16 pt-24 md:pb-20 md:pt-28"
                : "bg-background pb-6 pt-8 md:pt-12"
          }
        >
          <BookingV2
            services={services}
            vehicleTypes={vehicleTypes}
            options={options}
            priceMap={priceMap}
            depositType={settings.depositType}
            depositValue={settings.depositValue}
            roundTrip={settings.roundTrip}
            freeDistanceKm={Number.parseFloat(settings.freeDistanceKm)}
            paymentPlan={await resolveTenantPaymentPlan(settings)}
            maxVehicles={settings.maxVehiclesPerDay}
            location={location}
            embed={isEmbed}
          />
        </section>
      </>
    )
  }

  return (
    <>
      {isEmbed ? (
        <>
          {/* Anti-flash : masque le chrome du site AVANT le premier rendu, puis
              EmbedFrameSync gère la hauteur et le nettoyage. */}
          <script
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('df-embed')" }}
          />
          <EmbedFrameSync />
        </>
      ) : (
        <PageHeader
          eyebrow="Réservation"
          title="Réservez votre rendez-vous"
          description="Composez votre prestation, choisissez un créneau et confirmez en quelques minutes."
        />
      )}
      <section className={isEmbed ? "bg-background py-6" : "border-t border-border bg-background py-12 md:py-16"}>
        <div className="mx-auto max-w-6xl px-4">
          {settings.vacationMode ? (
            <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center">
              <h2 className="text-xl font-semibold text-balance">Réservations momentanément fermées</h2>
              <p className="mt-3 text-pretty text-muted-foreground leading-relaxed">
                {settings.vacationMessage?.trim()
                  ? settings.vacationMessage
                  : "Nous sommes actuellement en congés. La réservation en ligne rouvrira très bientôt. Merci de votre compréhension."}
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Pour toute demande, contactez-nous via la page contact.
              </p>
            </div>
          ) : (
            <BookingWizard
              services={services}
              categories={categories}
              vehicleTypes={vehicleTypes}
              options={options}
              priceMap={priceMap}
              depositType={settings.depositType}
              depositValue={settings.depositValue}
              roundTrip={settings.roundTrip}
              freeDistanceKm={Number.parseFloat(settings.freeDistanceKm)}
            />
          )}
        </div>
      </section>
    </>
  )
}
