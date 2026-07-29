import { afterAll, describe, expect, it } from "vitest"
import { Pool } from "pg"
import { auth } from "@/lib/auth"

// Test ciblé : un utilisateur CONNECTÉ peut remplacer son propre mot de passe
// existant via la fonction officielle Better Auth (auth.api.changePassword),
// sans recréer le compte ni créer un second mot de passe.
//
// Gated sur DATABASE_URL comme les autres tests d'intégration.
const HAS_DB = Boolean(process.env.DATABASE_URL)
const d = HAS_DB ? describe : describe.skip

const OLD_PASSWORD = "MotDePasseInitial!2026"
const NEW_PASSWORD = "NouveauMotDePasse!2026"
const EMAIL = `chgpwd-${Date.now()}@detailflow.test`

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function cleanup() {
  const u = await pool.query('SELECT id FROM "user" WHERE email = $1', [EMAIL])
  const id = u.rows[0]?.id
  if (!id) return
  await pool.query('DELETE FROM session WHERE "userId" = $1', [id])
  await pool.query('DELETE FROM account WHERE "userId" = $1', [id])
  await pool.query('DELETE FROM "user" WHERE id = $1', [id])
}

afterAll(async () => {
  await cleanup()
  await pool.end()
})

d("changement de mot de passe (compte connecté)", () => {
  it("remplace le mot de passe existant et n'accepte plus que le nouveau", async () => {
    // 1) Compte jetable AVEC mot de passe (simule le propriétaire du tenant).
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: OLD_PASSWORD, name: "Chg Pwd" },
    })

    // Marque l'email comme vérifié pour pouvoir ouvrir une session (le flux
    // d'inscription reste inchangé ; on contourne juste l'email en test).
    await pool.query('UPDATE "user" SET "emailVerified" = true WHERE email = $1', [EMAIL])

    // 2) Session de l'utilisateur (on récupère le cookie de session).
    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email: EMAIL, password: OLD_PASSWORD },
      returnHeaders: true,
    })
    const setCookie = signInHeaders.get("set-cookie") ?? ""
    expect(setCookie).toContain("session")
    const sessionHeaders = new Headers({ cookie: setCookie })

    // Un seul enregistrement de credentials avant le changement.
    const uid = (await pool.query('SELECT id FROM "user" WHERE email = $1', [EMAIL])).rows[0].id
    const accountsBefore = await pool.query(
      "SELECT count(*)::int n FROM account WHERE \"userId\" = $1 AND \"providerId\" = 'credential'",
      [uid],
    )
    expect(accountsBefore.rows[0].n).toBe(1)

    // 3) Changement de mot de passe par l'utilisateur connecté.
    await auth.api.changePassword({
      body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: false },
      headers: sessionHeaders,
    })

    // 4) Le nouveau mot de passe fonctionne.
    const okNew = await auth.api.signInEmail({ body: { email: EMAIL, password: NEW_PASSWORD } })
    expect(okNew.user?.email).toBe(EMAIL)

    // 5) L'ancien mot de passe est refusé.
    await expect(
      auth.api.signInEmail({ body: { email: EMAIL, password: OLD_PASSWORD } }),
    ).rejects.toBeTruthy()

    // 6) Toujours UN SEUL enregistrement de credentials (pas de second mot de passe,
    //    pas de recréation de compte).
    const accountsAfter = await pool.query(
      "SELECT count(*)::int n FROM account WHERE \"userId\" = $1 AND \"providerId\" = 'credential'",
      [uid],
    )
    expect(accountsAfter.rows[0].n).toBe(1)
  })

  it("refuse le changement si le mot de passe actuel est incorrect", async () => {
    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email: EMAIL, password: NEW_PASSWORD },
      returnHeaders: true,
    })
    const sessionHeaders = new Headers({ cookie: signInHeaders.get("set-cookie") ?? "" })

    await expect(
      auth.api.changePassword({
        body: { currentPassword: "MauvaisMotDePasse!", newPassword: "EncoreUnAutre!2026", revokeOtherSessions: false },
        headers: sessionHeaders,
      }),
    ).rejects.toBeTruthy()
  })
})
