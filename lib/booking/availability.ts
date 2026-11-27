/**
 * ============================================================================
 *  MOTEUR DE DISPONIBILITÉ (100 % SERVEUR)
 * ============================================================================
 *  Génère les créneaux de début possibles pour une date et une durée données,
 *  en tenant compte :
 *    - des horaires d'ouverture du jour
 *    - des périodes de vacances / indisponibilités (time_off)
 *    - de la capacité maximale de véhicules par jour
 *    - de la durée totale de la prestation + temps tampon
 *    - des réservations existantes (anti-double réservation)
 *    - du délai de réservation minimum (préavis)
 * ============================================================================
 */

import "server-only"
import {
  getSettings,
  getBusinessHours,
  getTimeOff,
  getActiveBookingsForDate,
  countVehiclesForDate,
} from "./queries"
import { requireCompanyId } from "@/lib/tenant"
import { getExternalBusyForDate } from "@/lib/calendar-sync/store"
import { timeToMinutes, minutesToTime, computeSlotStarts, parseFixedStarts } from "./slot-times"

export { timeToMinutes, minutesToTime }

export type AvailabilityResult = {
  date: string
  available: boolean
  /** Raison d'indisponibilité pour la journée entière. */
  reason?: "closed" | "time_off" | "full" | "past" | "no_duration"
  /** Motif public personnalisé (ex. "Complet") pour un blocage journée entière. */
  publicLabel?: string
  /** Créneaux de début proposés ("HH:MM"). */
  slots: string[]
}

type AvailabilityBase = [
  Awaited<ReturnType<typeof getSettings>>,
  Awaited<ReturnType<typeof getBusinessHours>>,
  Awaited<ReturnType<typeof getTimeOff>>,
]

/**
 * L84 — contexte d'UNE recherche (un seul professionnel, une seule requête) : réglages,
 * horaires et congés lus une seule fois, à la première date réellement calculée.
 * Ne jamais le conserver ni le partager entre recherches ou entre professionnels.
 */
export type AvailabilityContext = { load: () => Promise<AvailabilityBase> }

export function createAvailabilityContext(): AvailabilityContext {
  let base: Promise<AvailabilityBase> | null = null
  return {
    load: () => (base ??= Promise.all([getSettings(), getBusinessHours(), getTimeOff()])),
  }
}

/**
 * Calcule les créneaux disponibles pour une date.
 * @param dateStr  Date au format "YYYY-MM-DD".
 * @param durationMin Durée totale de la prestation (véhicules + options).
 * @param vehicleCount Nombre de véhicules demandés (capacité journalière).
 * @param context Facultatif (L84) : réglages/horaires/congés partagés au sein d'une seule recherche.
 */
export async function getAvailability(
  dateStr: string,
  durationMin: number,
  vehicleCount = 1,
  context?: AvailabilityContext,
): Promise<AvailabilityResult> {
  const empty = (reason: AvailabilityResult["reason"]): AvailabilityResult => ({
    date: dateStr,
    available: false,
    reason,
    slots: [],
  })

  if (!durationMin || durationMin <= 0) return empty("no_duration")

  const [[settings, hours, timeOffRanges], existing, alreadyBooked] = await Promise.all([
    context ? context.load() : Promise.all([getSettings(), getBusinessHours(), getTimeOff()]),
    getActiveBookingsForDate(dateStr),
    countVehiclesForDate(dateStr),
  ])

  const day = new Date(dateStr + "T00:00:00")
  const now = new Date()

  // 1. Date passée ?
  const endOfDay = new Date(dateStr + "T23:59:59")
  if (endOfDay < now) return empty("past")

  // 2. Capacité journalière atteinte ?
  if (alreadyBooked + vehicleCount > settings.maxVehiclesPerDay) return empty("full")

  // 3. Vacances / indisponibilités ?
  //    - Blocage journée entière (startTime/endTime absents) => jour fermé.
  //    - Blocage sur plage horaire => seuls les créneaux chevauchant sont exclus.
  const dayBlocks = timeOffRanges.filter((r) => dateStr >= r.startDate && dateStr <= r.endDate)
  const fullDayBlock = dayBlocks.find((r) => !r.startTime || !r.endTime)
  if (fullDayBlock) {
    // Propage le motif public personnalisé ("Complet", "Indisponible"…) s'il existe.
    const publicLabel = fullDayBlock.publicLabel?.trim() || undefined
    return { ...empty("time_off"), publicLabel }
  }
  // Blocages de l'agenda du téléphone (lecture base seule, jamais de réseau).
  const external = await getExternalBusyForDate(await requireCompanyId(), dateStr)
  if (external.fullDay) return empty("time_off")
  const blockedRanges = dayBlocks
    .filter((r) => r.startTime && r.endTime)
    .map((r) => ({ start: timeToMinutes(r.startTime as string), end: timeToMinutes(r.endTime as string) }))
    .concat(external.ranges)

  // 4. Ouvert ce jour-là ?
  const dow = day.getDay() // 0 = dimanche ... 6 = samedi
  const todayHours = hours.find((h) => h.dayOfWeek === dow)
  if (!todayHours || !todayHours.isOpen) return empty("closed")

  const open = timeToMinutes(todayHours.openTime)
  const close = timeToMinutes(todayHours.closeTime)
  const buffer = settings.bufferMin
  const step = settings.slotIntervalMin

  // Préavis minimum : premier départ possible.
  const minStartFromNotice =
    day.toDateString() <= now.toDateString() || dateStr === toDateStr(now)
      ? minutesSinceMidnight(new Date(now.getTime() + settings.minNoticeHours * 3600_000), dateStr)
      : 0

  // Intervalles déjà occupés (avec tampon), en minutes.
  const busy = existing.map((b) => ({
    start: timeToMinutes(b.startTime),
    end: timeToMinutes(b.endTime),
  }))

  // Heures fixes du jour si définies, sinon pas global (logique pure : slot-times.ts).
  const slots = computeSlotStarts({
    open,
    close,
    durationMin,
    step,
    buffer,
    minStartFromNotice,
    busy,
    blockedRanges,
    fixedStarts: parseFixedStarts(todayHours.fixedStartTimes),
  })

  if (!slots.length) return empty("full")
  return { date: dateStr, available: true, slots }
}

/** Renvoie le nombre de minutes depuis minuit pour `d`, borné à la date visée. */
function minutesSinceMidnight(d: Date, targetDate: string): number {
  if (toDateStr(d) < targetDate) return 0 // le préavis tombe avant la date visée
  if (toDateStr(d) > targetDate) return 24 * 60 // toute la journée est trop tôt
  return d.getHours() * 60 + d.getMinutes()
}

/** Date locale au format "YYYY-MM-DD". */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
