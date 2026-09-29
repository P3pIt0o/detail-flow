import "server-only"

import { getServices, getVehicleTypes, getBusinessHours, getSettings } from "@/lib/booking/queries"
import { getLocationConfig } from "@/lib/booking/location"
import { describeLocation, isWorkshopAddressComplete } from "@/lib/booking/location-shared"

export type SetupSectionId = "services" | "vehicles" | "hours" | "location" | "payment"

export type SetupSection = {
  id: SetupSectionId
  title: string
  question: string
  /** État actuel lisible sans ouvrir la section. */
  summary: string
  ready: boolean
  /** Action courte affichée quand l'élément manque. */
  todo: string
  /** Lien relatif (à passer dans withTenant côté appelant). */
  href: string
}

export type BookingSetupStatus = {
  sections: SetupSection[]
  missing: SetupSection[]
  ready: boolean
}

const DAY_SHORT = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."]
/** Ordre d'affichage lundi → dimanche. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** « Lun. – Sam. », « Lun., Mer., Ven. », etc. */
function summarizeOpenDays(openDays: number[]): string {
  const ordered = WEEK_ORDER.filter((d) => openDays.includes(d))
  if (ordered.length === 0) return "Aucun jour ouvert"
  if (ordered.length === 7) return "Tous les jours"
  const idx = ordered.map((d) => WEEK_ORDER.indexOf(d))
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (contiguous && ordered.length > 2) return `${DAY_SHORT[ordered[0]]} – ${DAY_SHORT[ordered[ordered.length - 1]]}`
  return ordered.map((d) => DAY_SHORT[d]).join(", ")
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/**
 * Photographie de la configuration de réservation d'un tenant, dérivée des
 * données RÉELLES (aucune case cochée à la main). `companyId` est résolu
 * côté serveur par l'appelant.
 */
export async function getBookingSetupStatus(companyId: number): Promise<BookingSetupStatus> {
  const [services, vehicleTypes, hours, settings, location] = await Promise.all([
    getServices(companyId),
    getVehicleTypes(companyId),
    getBusinessHours(companyId),
    getSettings(companyId),
    getLocationConfig(companyId),
  ])

  const openDays = hours.filter((h) => h.isOpen).map((h) => h.dayOfWeek)

  const mobileReady = !location.mobileEnabled || Boolean(settings.businessLat && settings.businessLng)
  const workshopReady = !location.workshopEnabled || isWorkshopAddressComplete(location)
  const locationReady = (location.mobileEnabled || location.workshopEnabled) && mobileReady && workshopReady

  const depositSummary =
    (settings.depositType === "percent" || settings.depositType === "percentage") && settings.depositValue > 0
      ? `Acompte de ${settings.depositValue} %`
      : settings.depositType === "fixed" && settings.depositValue > 0
        ? `Acompte de ${(settings.depositValue / 100).toLocaleString("fr-FR")} €`
        : "Paiement le jour du rendez-vous"

  const sections: SetupSection[] = [
    {
      id: "services",
      title: "Prestations",
      question: "Que proposez-vous ?",
      summary: services.length ? plural(services.length, "prestation disponible", "prestations disponibles") : "Aucune prestation",
      ready: services.length > 0,
      todo: "Ajouter vos prestations",
      href: "/admin/prestations",
    },
    {
      id: "vehicles",
      title: "Véhicules",
      question: "Quels véhicules acceptez-vous ?",
      summary: vehicleTypes.length ? plural(vehicleTypes.length, "catégorie", "catégories") : "Aucune catégorie",
      ready: vehicleTypes.length > 0,
      todo: "Choisir vos véhicules",
      href: "/admin/prestations",
    },
    {
      id: "hours",
      title: "Disponibilités",
      question: "Quand peut-on réserver ?",
      summary: summarizeOpenDays(openDays),
      ready: openDays.length > 0,
      todo: "Ajouter vos horaires",
      href: "/admin/parametres?tab=hours",
    },
    {
      id: "location",
      title: "Lieu",
      question: "Où réalisez-vous vos prestations ?",
      summary: describeLocation(location),
      ready: locationReady,
      todo: !workshopReady ? "Ajouter l'adresse de votre atelier" : "Indiquer votre adresse de départ",
      href: "/admin/parametres?tab=travel",
    },
    {
      id: "payment",
      title: "Paiement",
      question: "Comment souhaitez-vous être payé ?",
      summary: depositSummary,
      // Payer le jour du rendez-vous est un choix valide : jamais bloquant.
      ready: true,
      todo: "Choisir votre mode de paiement",
      href: "/admin/parametres?tab=planning",
    },
  ]

  const missing = sections.filter((s) => !s.ready)
  return { sections, missing, ready: missing.length === 0 }
}
