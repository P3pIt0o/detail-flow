import { describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/lib/auth-client", () => ({ authClient: {} }))

import {
  INVALID_LINK_MESSAGE,
  REQUEST_SENT_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
  MISMATCH_MESSAGE,
  ForgotPasswordForm,
  ResetRequestSent,
  ResetPasswordForm,
  requestResetMessage,
  resetErrorMessage,
  validateNewPassword,
} from "@/components/admin/password-reset-forms"
import { AdminAuthForm } from "@/components/admin/admin-auth-form"
import { resetPasswordEmail } from "@/lib/email/templates"

describe("L40 messages", () => {
  it("demande : message unique quel que soit le résultat, sauf 429", () => {
    expect(REQUEST_SENT_MESSAGE).toBe("Si un compte existe pour cette adresse, vous allez recevoir un email.")
    expect(requestResetMessage(null)).toBe(REQUEST_SENT_MESSAGE)
    expect(requestResetMessage({ status: 400, code: "USER_NOT_FOUND" })).toBe(REQUEST_SENT_MESSAGE)
    expect(requestResetMessage({ status: 500, message: "network" })).toBe(REQUEST_SENT_MESSAGE)
    expect(requestResetMessage({ status: 429 })).toBe("Trop de demandes. Réessayez dans une minute.")
  })

  it("réinitialisation : jeton invalide, longueur, 429, défaut", () => {
    expect(resetErrorMessage({ code: "INVALID_TOKEN" })).toBe(INVALID_LINK_MESSAGE)
    expect(resetErrorMessage({ status: 429 })).toBe(TOO_MANY_REQUESTS_MESSAGE)
    expect(resetErrorMessage({ code: "PASSWORD_TOO_SHORT" })).toMatch(/8 caractères/)
    expect(resetErrorMessage({ message: "x" })).toMatch(/Impossible/)
  })

  it("formulaire : confirmation différente et 7 caractères refusés", () => {
    expect(validateNewPassword("abcdefgh", "abcdefgi")).toBe(MISMATCH_MESSAGE)
    expect(validateNewPassword("1234567", "1234567")).toMatch(/8 caractères/)
    expect(validateNewPassword("12345678", "12345678")).toBeNull()
  })
})

describe("L40 rendu", () => {
  it.each([
    { token: null, error: "INVALID_TOKEN" },
    { token: null, error: null },
    { token: "abc", error: "INVALID_TOKEN" },
  ])("lien invalide %o → message + lien Refaire une demande", (props) => {
    const html = renderToStaticMarkup(createElement(ResetPasswordForm, props))
    expect(html).toContain("Ce lien n&#x27;est plus valide (expiré ou déjà utilisé).")
    expect(html).toContain('href="/admin/mot-de-passe-oublie"')
    expect(html).toContain("Refaire une demande")
    // Aperçu validé : bouton secondaire + pied « Retour à la connexion ».
    expect(html).toContain("bg-secondary")
    expect(html).toContain('href="/admin/login"')
    expect(html).toContain("Retour à la connexion")
  })

  it("jeton présent → formulaire nouveau mot de passe + confirmation, textes de l'aperçu", () => {
    const html = renderToStaticMarkup(createElement(ResetPasswordForm, { token: "abc", error: null }))
    expect(html).toContain('id="confirmPassword"')
    expect(html).toContain('minLength="8"')
    expect(html).toContain("Choisissez un nouveau mot de passe")
    expect(html).toContain("8 caractères minimum.")
    expect(html).toContain("Enregistrer le mot de passe")
    expect(html).not.toContain("Modifier le mot de passe")
  })

  it("demande : formulaire email puis vue de confirmation sans formulaire", () => {
    const form = renderToStaticMarkup(createElement(ForgotPasswordForm))
    expect(form).toContain('type="email"')
    expect(form).toContain("Envoyer le lien")
    const sent = renderToStaticMarkup(createElement(ResetRequestSent))
    expect(sent).toContain("Vérifiez votre boîte de réception")
    expect(sent).toContain(REQUEST_SENT_MESSAGE)
    expect(sent).toContain('href="/admin/login"')
    expect(sent).toContain("Retour à la connexion")
    expect(sent).not.toContain("<form")
    expect(sent).not.toContain("<button")
  })

  it("connexion : lien Mot de passe oublié et message après réinitialisation", () => {
    const html = renderToStaticMarkup(
      createElement(AdminAuthForm, { mode: "login", notice: "Mot de passe modifié, vous pouvez vous connecter." }),
    )
    expect(html).toContain('href="/admin/mot-de-passe-oublie"')
    expect(html).toContain("Mot de passe oublié ?")
    expect(html).toContain("Mot de passe modifié, vous pouvez vous connecter.")
    const signup = renderToStaticMarkup(createElement(AdminAuthForm, { mode: "signup" }))
    expect(signup).not.toContain("Mot de passe oublié ?")
  })
})

describe("L40 email", () => {
  it("objet, bouton, expiration, URL échappée", () => {
    const { subject, html } = resetPasswordEmail({
      url: 'https://x.fr/api/auth/reset-password/t?callbackURL=%2Fa&x="<b>',
      name: "<Jo>",
      businessName: "DetailFlow",
    })
    expect(subject).toBe("Réinitialisez votre mot de passe DetailFlow")
    expect(html).toContain("Choisir un nouveau mot de passe")
    expect(html).toContain("vous avez demandé à changer le mot de passe de votre espace professionnel DetailFlow.")
    expect(html).toContain("Ce lien expire dans 1 heure.")
    expect(html).toContain("ignorez cet email.")
    expect(html).toContain("&amp;x=&quot;&lt;b&gt;")
    expect(html).not.toContain("<Jo>")
  })
})
