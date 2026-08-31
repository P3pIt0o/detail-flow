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
 * Fenêtre de garde ANTI-RÉTROACTIF (brief : « aucun envoi rétroactif massif »).
 *
 * Une notification n'est envoyable que si son instant d'envoi théorique est
 * atteint MAIS pas dépassé de plus de `MAX_SEND_LATENESS_MS`. Si la fenêtre a
 * été manquée (fonctionnalité activée trop tard, cron indisponible longtemps,
 * import d'anciennes données…), on NE rattrape PAS : la tâche est marquée
 * « ignorée » plutôt qu'envoyée en retard.
 */
export const MAX_SEND_LATENESS_MS = 2 * HOUR_MS

/**
 * L'instant `now` est-il dans la fenêtre d'envoi de `sendAt` ?
 *  - trop tôt (`now < sendAt`)  => pas encore dû ;
 *  - à l'heure (`sendAt <= now <= sendAt + grace`) => envoyable ;
 *  - trop tard (`now > sendAt + grace`) => fenêtre manquée (ne pas rattraper).
 */
export type SendWindow = "early" | "due" | "missed"
export function sendWindowState(now: Date, sendAt: Date, graceMs = MAX_SEND_LATENESS_MS): SendWindow {
  const t = now.getTime()
  const s = sendAt.getTime()
  if (t < s) return "early"
  if (t <= s + graceMs) return "due"
  return "missed"
}

/**
 * Convertit une date locale tenant (`YYYY-MM-DD` + `HH:MM`) exprimée dans un
 * fuseau IANA en instant absolu (UTC `Date`).
 *
 * `bookings.date` (type date) et `bookings.startTime` (texte "HH:MM") décrivent
 * une heure LOCALE au tenant, sans offset. Pour calculer un instant d'envoi
 * correct (et le comparer à `now`), il faut résoudre l'offset du fuseau À CETTE
 * DATE (gère été/hiver). Technique standard : on formate un instant candidat
 * dans le fuseau cible, on mesure l'écart, puis on corrige (double passe pour
 * les bords de changement d'heure). Renvoie `null` si les entrées sont
 * invalides (jamais d'instant faux silencieux).
 */
export function tenantLocalToInstant(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date | null {
  if (typeof dateStr !== "string" || typeof timeStr !== "string") return null
  const dm = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const tm = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!dm || !tm) return null
  const [, ys, mos, ds] = dm
  const [, hs, mis] = tm
  const y = Number(ys)
  const mo = Number(mos)
  const d = Number(ds)
  const h = Number(hs)
  const mi = Number(mis)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null

  const naiveUTC = Date.UTC(y, mo - 1, d, h, mi, 0)

  // Offset (ms) du fuseau au voisinage d'un instant donné : différence entre
  // l'heure murale affichée dans ce fuseau et l'instant UTC réel.
  const offsetAt = (instant: number): number => {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    const parts = dtf.formatToParts(new Date(instant))
    const map: Record<string, string> = {}
    for (const p of parts) map[p.type] = p.value
    const asUTC = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second),
    )
    return asUTC - instant
  }

  try {
    // Double passe : la 1ʳᵉ estimation peut tomber du mauvais côté d'un
    // changement d'heure ; la 2ᵉ corrige avec l'offset au bon instant.
    const off1 = offsetAt(naiveUTC)
    const ts1 = naiveUTC - off1
    const off2 = offsetAt(ts1)
    const ts2 = naiveUTC - off2
    return new Date(ts2)
  } catch {
    return null
  }
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
