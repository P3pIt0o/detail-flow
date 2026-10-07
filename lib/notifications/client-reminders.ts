/**
 * Rappel EMAIL HISTORIQUE AU CLIENT (J+1), exécuté par /api/cron/reminders.
 *
 * À NE PAS CONFONDRE avec le LOT D (/api/cron/notifications) :
 *  - ici : email au CLIENT, la veille du RDV, idempotence via bookings.reminderSentAt ;
 *  - LOT D : email au PROFESSIONNEL (1 h / 2 h / 24 h avant) + demande d'avis
 *    au client après completed_at, idempotence via notification_outbox.
 * Destinataires différents => jamais deux emails identiques au même destinataire.
 *
 * Fichier PUR (dépendances injectées). Droit `email_reminders` évalué UNE fois
 * par companyId ; sans droit : aucun email, aucun reminderSentAt.
 */

export type ClientReminderCandidate = { id: number; companyId: number }

export type ClientReminderDeps = {
  listDue: () => Promise<ClientReminderCandidate[]>
  canUseFeature: (companyId: number, key: "email_reminders") => Promise<boolean>
  sendReminder: (bookingId: number) => Promise<boolean>
  /** Doit être scopé (id ET companyId) et ne poser reminderSentAt que s'il est encore null. */
  markSent: (bookingId: number, companyId: number) => Promise<void>
}

export type ClientReminderResult = {
  candidates: number
  sent: number
  failed: number
  skippedUnlicensed: number
}

export async function processClientEmailReminders(deps: ClientReminderDeps): Promise<ClientReminderResult> {
  const due = await deps.listDue()
  const result: ClientReminderResult = { candidates: due.length, sent: 0, failed: 0, skippedUnlicensed: 0 }
  const licenceByCompany = new Map<number, Promise<boolean>>()

  for (const row of due) {
    let licence = licenceByCompany.get(row.companyId)
    if (!licence) {
      licence = deps.canUseFeature(row.companyId, "email_reminders").catch(() => false)
      licenceByCompany.set(row.companyId, licence)
    }
    if (!(await licence)) {
      result.skippedUnlicensed += 1
      continue
    }
    const ok = await deps.sendReminder(row.id).catch(() => false)
    if (!ok) {
      result.failed += 1
      continue
    }
    await deps.markSent(row.id, row.companyId)
    result.sent += 1
  }
  return result
}
