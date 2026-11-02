import { describe, expect, it } from "vitest"
import { checkDbSecrets } from "../scripts/ci-db-guard.mjs"

/**
 * L34 — garde-fou des bases de test de la CI : refus immédiat si une adresse
 * vise la production (`long-mud`) ou si les deux bases sont sur le même hôte.
 * Aucun message ne révèle une adresse, un utilisateur ou un mot de passe.
 */

// Adresses FACTICES, assemblées par morceaux (aucune adresse avec identifiants en clair dans le dépôt).
const pg = (user: string, pass: string, host: string, db: string) => ["postgresql:/", "/", user, ":", pass, "@", host, "/", db].join("")
const DEV = pg("dev_user", "S3cretDev", "ep-dev-123.eu-central-1.aws.neon.tech", "neondb?sslmode=require")
const TEST = pg("test_user", "S3cretTest", "ep-test-456.eu-central-1.aws.neon.tech", "testdb?sslmode=require")
const PROD = pg("prod", "S3cretProd", "ep-long-mud-789.eu-central-1.aws.neon.tech", "neondb")

const env = (db?: string, subs?: string) => ({
  DATABASE_URL: db ?? "",
  CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL: subs ?? "",
})

const leaks = (msg: string) =>
  ["S3cret", "dev_user", "test_user", "prod:", "ep-dev", "ep-test", "ep-long-mud", "neon.tech", "postgresql://"].filter((s) =>
    msg.includes(s),
  )

describe("checkDbSecrets", () => {
  it("deux bases distinctes → ok", () => {
    expect(checkDbSecrets(env(DEV, TEST)).status).toBe("ok")
  })

  it("aucun secret (PR de fork) → ignoré et signalé", () => {
    const r = checkDbSecrets(env())
    expect(r.status).toBe("skip")
    expect(r.message).toMatch(/ignorés/)
  })

  it.each([
    ["seulement la base dev", env(DEV)],
    ["seulement la base de test", env(undefined, TEST)],
  ])("%s → échec (configuration incomplète)", (_l, e) => {
    const r = checkDbSecrets(e)
    expect(r.status).toBe("error")
    expect(r.message).toMatch(/incomplète/)
  })

  it.each([
    ["base dev = production", env(PROD, TEST)],
    ["base de test = production", env(DEV, PROD)],
    ["long-mud en majuscules", env(DEV, PROD.replace("long-mud", "LONG-MUD"))],
  ])("%s → échec immédiat", (_l, e) => {
    const r = checkDbSecrets(e)
    expect(r.status).toBe("error")
    expect(r.message).toMatch(/production/)
  })

  it("les deux sur le même hôte → échec immédiat", () => {
    const sameHost = TEST.replace("ep-test-456", "ep-dev-123")
    const r = checkDbSecrets(env(DEV, sameHost))
    expect(r.status).toBe("error")
    expect(r.message).toMatch(/même hôte/)
  })

  it("adresse illisible → échec", () => {
    expect(checkDbSecrets(env("pas une url", TEST)).status).toBe("error")
  })

  it("C4 — aucun message ne révèle une adresse ni un identifiant", () => {
    const cases = [env(DEV, TEST), env(), env(DEV), env(PROD, TEST), env(DEV, DEV), env("pas une url avec S3cret", TEST)]
    for (const e of cases) expect(leaks(checkDbSecrets(e).message)).toEqual([])
  })
})
