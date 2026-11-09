import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"

// L40 — mot de passe oublié : vrai flux Better Auth, base en mémoire, Resend simulé.
const sendEmail = vi.hoisted(() => vi.fn())
vi.mock("@/lib/email/send", () => ({ sendEmail }))
vi.mock("@/lib/booking/queries", () => ({ getSettings: async () => null }))

import { authOptions } from "@/lib/auth"

const BASE = "http://localhost:3000"
const EMAIL = "pro@example.fr"
const OLD = "ancien-mdp-123"
const NEW = "nouveau-mdp-456"

function makeAuth() {
  const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] }
  const auth = betterAuth({ ...authOptions, baseURL: BASE, database: memoryAdapter(db) })
  return { auth, db }
}

type Auth = ReturnType<typeof makeAuth>["auth"]

async function createVerifiedUser(auth: Auth, db: Record<string, Record<string, unknown>[]>) {
  await auth.api.signUpEmail({ body: { email: EMAIL, password: OLD, name: "Pro" } })
  for (const u of db.user) u.emailVerified = true
  sendEmail.mockClear()
}

async function signIn(auth: Auth, password: string) {
  const res = await auth.api.signInEmail({ body: { email: EMAIL, password }, asResponse: true })
  return { status: res.status, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] }
}

async function requestReset(auth: Auth, email: string) {
  const res = await auth.handler(
    new Request(`${BASE}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, redirectTo: "/admin/reinitialiser" }),
    }),
  )
  return { status: res.status, body: await res.text() }
}

function lastResetToken() {
  const url: string = sendEmail.mock.calls.at(-1)![0].html.match(/href="([^"]+reset-password[^"]+)"/)[1]
  return { url: url.replace(/&amp;/g, "&"), token: url.split("/reset-password/")[1].split("?")[0] }
}

beforeEach(() => {
  sendEmail.mockReset()
  sendEmail.mockResolvedValue({ ok: true, id: "simulé" })
})
afterEach(() => vi.useRealTimers())

describe("L40 config", () => {
  it("jeton 1 h, sessions révoquées, envoi branché", () => {
    expect(authOptions.emailAndPassword.resetPasswordTokenExpiresIn).toBe(3600)
    expect(authOptions.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true)
    expect(typeof authOptions.emailAndPassword.sendResetPassword).toBe("function")
  })
})

describe("L40 C1 — demande", () => {
  it("compte existant : un email, bon destinataire, bon objet, lien vers /admin/reinitialiser ; inconnu : même réponse, aucun envoi", async () => {
    const { auth, db } = makeAuth()
    await createVerifiedUser(auth, db)

    const known = await requestReset(auth, EMAIL)
    expect(known.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const arg = sendEmail.mock.calls[0][0]
    expect(arg.to).toBe(EMAIL)
    expect(arg.subject).toBe("Réinitialisez votre mot de passe DetailFlow")
    expect(arg.html).toContain("/reset-password/")
    expect(arg.html).toContain("callbackURL=%2Fadmin%2Freinitialiser")

    sendEmail.mockClear()
    const unknown = await requestReset(auth, "inconnu@example.fr")
    expect(unknown.status).toBe(200)
    expect(unknown.body).toBe(known.body)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("C1 bis : Resend qui lève une erreur → réponse 200 identique", async () => {
    const { auth, db } = makeAuth()
    await createVerifiedUser(auth, db)
    const unknown = await requestReset(auth, "inconnu@example.fr")
    sendEmail.mockRejectedValue(new Error("Resend en panne"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const known = await requestReset(auth, EMAIL)
    spy.mockRestore()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(known.status).toBe(200)
    expect(known.body).toBe(unknown.body)
  })
})

describe("L40 C2 — jeton à usage unique et expirant", () => {
  it("jeton déjà utilisé → INVALID_TOKEN", async () => {
    const { auth, db } = makeAuth()
    await createVerifiedUser(auth, db)
    await requestReset(auth, EMAIL)
    const { token } = lastResetToken()
    await auth.api.resetPassword({ body: { token, newPassword: NEW } })
    await expect(auth.api.resetPassword({ body: { token, newPassword: "encore-autre-789" } })).rejects.toMatchObject({
      body: { code: "INVALID_TOKEN" },
    })
  })

  it("jeton expiré (+1 h 1 s) → INVALID_TOKEN au POST, redirection ?error=INVALID_TOKEN au GET", async () => {
    const { auth, db } = makeAuth()
    await createVerifiedUser(auth, db)
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-08T10:00:00Z"))
    await requestReset(auth, EMAIL)
    const { url, token } = lastResetToken()

    // Encore valide : le GET renvoie vers la page avec le jeton.
    const ok = await auth.handler(new Request(url))
    expect(ok.headers.get("location")).toContain(`/admin/reinitialiser?token=${token}`)

    vi.setSystemTime(new Date("2026-11-08T11:00:01Z"))
    const expired = await auth.handler(new Request(url))
    expect(expired.headers.get("location")).toContain("/admin/reinitialiser?error=INVALID_TOKEN")
    await expect(auth.api.resetPassword({ body: { token, newPassword: NEW } })).rejects.toMatchObject({
      body: { code: "INVALID_TOKEN" },
    })
  })

  it("mot de passe de 7 caractères refusé (même règle que l'inscription)", async () => {
    const { auth, db } = makeAuth()
    await createVerifiedUser(auth, db)
    await requestReset(auth, EMAIL)
    const { token } = lastResetToken()
    await expect(auth.api.resetPassword({ body: { token, newPassword: "1234567" } })).rejects.toMatchObject({
      body: { code: "PASSWORD_TOO_SHORT" },
    })
  })
})

describe("L40 C3 — sessions révoquées", () => {
  it("les deux anciennes sessions tombent ; ancien mot de passe refusé, nouveau accepté", async () => {
    const { auth, db } = makeAuth()
    await createVerifiedUser(auth, db)
    const s1 = await signIn(auth, OLD)
    const s2 = await signIn(auth, OLD)
    for (const s of [s1, s2]) {
      expect(await auth.api.getSession({ headers: new Headers({ cookie: s.cookie }) })).not.toBeNull()
    }

    await requestReset(auth, EMAIL)
    await auth.api.resetPassword({ body: { token: lastResetToken().token, newPassword: NEW } })

    for (const s of [s1, s2]) {
      expect(await auth.api.getSession({ headers: new Headers({ cookie: s.cookie }) })).toBeNull()
    }
    expect((await signIn(auth, OLD)).status).toBe(401)
    expect((await signIn(auth, NEW)).status).toBe(200)
  })
})
