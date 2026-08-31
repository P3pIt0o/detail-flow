/**
 * Calculs d'ordonnancement des notifications (LOT D #4).
 *
 * Fichier PUR (aucun import serveur/DB). Toutes les dates manipulées sont des
 * instants absolus (UTC via `Date`). L'affichage dans le fuseau du tenant est
 * géré séparément par `formatInTenantTimeZone`.
 *
 * Le rendez-vous est stocké dans `bookings.startTime` comme instant absolu
 * (timestamp) : les calculs d'offset sont donc de simples soustractions en ms,
 * insensibles aux changements d'heure (l'instant absolu ne bouge pas).
 */

/** Décalages autorisés pour le rappel pro (heures avant le RDV). */
export const REMINDER_OFFSET_CHOICES = [1, 2, 24] as const
export type ReminderOffsetHours = (typeof REMINDER_OFFSET_CHOICES)[number]
export const DEFAULT_REMINDER_OFFSET_HOURS: ReminderOffsetHours = 2

/** Décalages autorisés pour la demande d'avis (heures après réalisation). */
export const REVIEW_OFFSET_CHOICES = [2, 24] as const
export type ReviewOffsetHours = (typeof REVIEW_OFFSET_CHOICES)[number]
export const DEFAULT_REVIEW_OFFSET_HOURS: ReviewOffsetHours = 2

const HOUR_MS = 60 * 60 * 1000

export function normalizeReminderOffset(value: unknown): ReminderOffsetHours {
  const n = typeof value === "number" ? value : Number(value)
  return (REMINDER_OFFSET_CHOICES as readonly number[]).includes(n)
    ? (n as ReminderOffsetHours)
    : DEFAULT_REMINDER_OFFSET_HOURS
}

export function normalizeReviewOffset(value: unknown): ReviewOffsetHours {
  const n = typeof value === "number" ? value : Number(value)
  return (REVIEW_OFFSET_CHOICES as readonly number[]).includes(n)
    ? (n as ReviewOffsetHours)
    : DEFAULT_REVIEW_OFFSET_HOURS
}

/** Instant d'envoi théorique d'un rappel : `offset` heures AVANT le RDV. */
export function reminderSendAt(startTime: Date, offsetHours: number): Date {
  return new Date(startTime.getTime() - offsetHours * HOUR_MS)
}

/** Instant d'envoi théorique d'une demande d'avis : `offset` heures APRÈS réalisation. */
export function reviewSendAt(completedAt: Date, offsetHours: number): Date {
  return new Date(completedAt.getTime() + offsetHours * HOUR_MS)
}

/**
 * Un rappel est-il ENVOYABLE à l'instant `now` ?
 *
 * Règles du brief :
 *  - on n'envoie jamais un rappel APRÈS le début du RDV (`now < startTime`) ;
 *  - l'instant d'envoi théorique doit être atteint (`now >= sendAt`) ;
 *  - garde-fou « réservation tardive » : si le RDV est si proche que l'instant
 *    d'envoi est déjà passé au moment de la programmation, on N'envoie PAS de
 *    rappel (évite confirmation + rappel simultanés). Ce cas est décidé à la
 *    programmation via `shouldScheduleReminder`.
 */
export function isReminderDue(now: Date, sendAt: Date, startTime: Date): boolean {
  return now.getTime() >= sendAt.getTime() && now.getTime() < startTime.getTime()
}

/**
 * Faut-il programmer un rappel à la création/confirmation d'une réservation ?
 *
 * Évite le doublon « confirmation + rappel » pour les réservations créées peu
 * avant le RDV : si l'instant d'envoi théorique est déjà dépassé (ou dans une
 * fenêtre de garde `minLeadMinutes`) au moment de la programmation, on ne
 * programme pas de rappel.
 */
export function shouldScheduleReminder(
  now: Date,
  startTime: Date,
  offsetHours: number,
  minLeadMinutes = 0,
): boolean {
  if (startTime.getTime() <= now.getTime()) return false // RDV déjà commencé/passé
  const sendAt = reminderSendAt(startTime, offsetHours)
  return sendAt.getTime() >= now.getTime() + minLeadMinutes * 60 * 1000
}

/**
 * Formate un instant dans le fuseau du tenant (affichage humain FR).
 * S'appuie sur `Intl` (fuseau IANA, ex. "Europe/Paris") : gère nativement les
 * changements d'heure été/hiver.
 */
export function formatInTenantTimeZone(
  instant: Date,
  timeZone: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(
    "fr-FR",
    opts ?? {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    },
  ).format(instant)
}
