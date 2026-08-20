import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveFeature, type LicenseContext, type ResolvedOverride } from "@/lib/licensing/resolver"
import type { LicensePlan } from "@/lib/licensing/types"

/**
 * Étape 2B — Lot 2 : branchement de hasFeature() sur la feature `sms`.
 *
 * Partie A : tests PURS sur le resolver central (`resolveFeature`) — l'entrée
 * exacte que `hasFeature()` délègue. Aucune écriture DB, aucun réseau.
 *
 * Matrice de référence (registre central) pour `sms` :
 *   FREE = false, ESSENTIAL = false, PRO = false, BUSINESS = true, FOUNDER = true.
 *
 * Partie B : tests STRUCTURELS garantissant que les chemins serveur réels
 * (actions, cron, sendSms) branchent bien le contrôle, qu'aucun downgrade ne
 * supprime de config/crédit, et que la route centrale sms-test n'est pas gatée.
 */

const NOW = new Date("2026-01-15T12:00:00Z")

function ctx(plan: LicensePlan | null, overrides: ResolvedOverride[] = []): LicenseContext {
  return { plan, generation: plan == null ? null : "LIFETIME_V1", overrides }
}

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

describe("2B lot 2 — SMS : LEGACY (licensePlan = NULL) inchangé", () => {
  it("autorise sms en LEGACY", () => {
    expect(resolveFeature(ctx(null), "sms", NOW)).toBe(true)
  })
})

describe("2B lot 2 — SMS : matrice des plans explicites", () => {
  it("BUSINESS et FOUNDER autorisent sms", () => {
    expect(resolveFeature(ctx("BUSINESS"), "sms", NOW)).toBe(true)
    expect(resolveFeature(ctx("FOUNDER"), "sms", NOW)).toBe(true)
  })

  it("FREE / ESSENTIAL / PRO refusent sms", () => {
    expect(resolveFeature(ctx("FREE"), "sms", NOW)).toBe(false)
    expect(resolveFeature(ctx("ESSENTIAL"), "sms", NOW)).toBe(false)
    expect(resolveFeature(ctx("PRO"), "sms", NOW)).toBe(false)
  })
})

describe("2B lot 2 — SMS : override commercial et fail-closed", () => {
  it("un override ENABLED non expiré accorde sms même sur un plan sans sms", () => {
    const ov: ResolvedOverride = { featureKey: "sms", state: "ENABLED", expiresAt: null }
    expect(resolveFeature(ctx("PRO", [ov]), "sms", NOW)).toBe(true)
  })

  it("un override DISABLED retire sms même sur BUSINESS", () => {
    const ov: ResolvedOverride = { featureKey: "sms", state: "DISABLED", expiresAt: null }
    expect(resolveFeature(ctx("BUSINESS", [ov]), "sms", NOW)).toBe(false)
  })

  it("plan explicite inconnu (forgé) => fail closed", () => {
    expect(resolveFeature(ctx("SUBSCRIPTION_V2" as unknown as LicensePlan), "sms", NOW)).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  Partie B — garanties STRUCTURELLES sur les chemins serveur réels           */
/* -------------------------------------------------------------------------- */

describe("2B lot 2 — SMS : chemins serveur protégés", () => {
  const smsActions = read("app/admin/(dashboard)/parametres/sms-actions.ts")
  const cron = read("app/api/cron/reminders/route.ts")
  const send = read("lib/sms/send.ts")
  const smsTest = read("app/api/admin/sms-test/route.ts")

  it("saveSmsReminderSettings : contrôle sms uniquement à l'activation (enabled)", () => {
    // Le gate exige input.enabled ET l'absence de feature -> pas de blocage à la désactivation.
    expect(smsActions).toMatch(/input\.enabled\s*&&\s*!\(await canUseFeature\(tenant\.id,\s*"sms"\)\)/)
  })

  it("createRechargeRequest : contrôle sms avant tout insert", () => {
    // canUseFeature("sms") apparaît AVANT la première insertion smsRechargeRequests.
    const idxCheck = smsActions.indexOf('canUseFeature(tenant.id, "sms")', smsActions.indexOf("createRechargeRequest"))
    const idxInsert = smsActions.indexOf("insert(smsRechargeRequests)")
    expect(idxCheck).toBeGreaterThan(-1)
    expect(idxInsert).toBeGreaterThan(idxCheck)
  })

  it("cron : la feature sms est vérifiée UNE fois par companyId (pas par booking)", () => {
    // Le contrôle porte sur enabledSettings (par entreprise) et non dans la boucle des bookings.
    expect(cron).toMatch(/enabledSettings\.map\(\(s\)\s*=>\s*canUseFeature\(s\.companyId,\s*"sms"\)\)/)
    // Aucun appel canUseFeature à l'intérieur de la boucle "for (const b of dueSms)".
    const loopStart = cron.indexOf("for (const b of dueSms)")
    expect(loopStart).toBeGreaterThan(-1)
    const loopBody = cron.slice(loopStart)
    expect(loopBody).not.toMatch(/canUseFeature/)
  })

  it("cron : les rappels EMAIL ne sont pas soumis à la feature sms", () => {
    // Le bloc email (sendReminderEmail / reminderSentAt) précède tout contrôle sms.
    const idxEmail = cron.indexOf("sendReminderEmail")
    const idxSmsCheck = cron.indexOf('canUseFeature(s.companyId, "sms")')
    expect(idxEmail).toBeGreaterThan(-1)
    expect(idxSmsCheck).toBeGreaterThan(idxEmail)
  })

  it("sendSms : défense en profondeur uniquement quand companyId est fourni", () => {
    expect(send).toMatch(/args\.companyId\s*!=\s*null\s*&&\s*!\(await canUseFeature\(args\.companyId,\s*"sms"\)\)/)
  })

  it("sms-test : route centrale sans companyId, jamais gatée par une licence tenant", () => {
    // La route n'importe pas le moteur de licence et n'appelle jamais canUseFeature.
    expect(smsTest).not.toMatch(/canUseFeature|hasFeature/)
    // sendSms y est appelé SANS companyId (donc défense en profondeur non déclenchée).
    expect(smsTest).toMatch(/sendSms\(\{\s*to,\s*message:/)
  })
})

describe("2B lot 2 — SMS : downgrade ne supprime rien", () => {
  const smsActions = read("app/admin/(dashboard)/parametres/sms-actions.ts")
  const cron = read("app/api/cron/reminders/route.ts")
  const send = read("lib/sms/send.ts")

  it("aucun chemin de contrôle licence n'exécute de delete SMS", () => {
    // Les fichiers ne contiennent aucune suppression de crédits / sous-compte / settings SMS.
    for (const src of [smsActions, cron, send]) {
      expect(src).not.toMatch(/delete\(\s*smsCredits\s*\)/)
      expect(src).not.toMatch(/delete\(\s*smsRechargeRequests\s*\)/)
    }
  })

  it("le refus d'activation renvoie un message licence sans écrire les réglages", () => {
    // Le retour de blocage précède ensureSettingsRow / db.update(settings).
    const idxGate = smsActions.indexOf("FEATURE_LOCKED_MESSAGE")
    const idxWrite = smsActions.indexOf("ensureSettingsRow(tenant.id)")
    expect(idxGate).toBeGreaterThan(-1)
    expect(idxWrite).toBeGreaterThan(idxGate)
  })
})
