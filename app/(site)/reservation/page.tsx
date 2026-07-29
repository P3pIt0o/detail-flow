import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { BookingWizard } from "@/components/booking/booking-wizard"
import {
  getServices,
  getCategories,
  getVehicleTypes,
  getOptions,
  getServicePrices,
  getSettings,
} from "@/lib/booking/queries"

export const metadata: Metadata = {
  title: "Réservation en ligne",
  description:
    "Réservez votre prestation de detailing en quelques clics : choix du service, du véhicule, des options, de la date et du créneau.",
}

// Données de référence en direct de la base : toujours à jour.
export const dynamic = "force-dynamic"

export default async function ReservationPage() {
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

  return (
    <>
      <PageHeader
        eyebrow="Réservation"
        title="Réservez votre rendez-vous"
        description="Composez votre prestation, choisissez un créneau et confirmez en quelques minutes."
      />
      <section className="border-t border-border bg-background py-12 md:py-16">
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
