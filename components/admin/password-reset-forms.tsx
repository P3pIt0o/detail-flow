"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { KeyRound, MailCheck } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell } from "@/components/admin/admin-auth-form"

export const REQUEST_SENT_MESSAGE = "Si un compte existe pour cette adresse, vous allez recevoir un email."
export const TOO_MANY_REQUESTS_MESSAGE = "Trop de demandes. Réessayez dans une minute."
export const INVALID_LINK_MESSAGE = "Ce lien n'est plus valide (expiré ou déjà utilisé)."
export const MISMATCH_MESSAGE = "Les deux mots de passe ne correspondent pas."

type AuthError = { status?: number; code?: string; message?: string } | null | undefined

/** Message après une demande : identique quel que soit le résultat (pas d'énumération), sauf 429. */
export function requestResetMessage(error: AuthError): string {
  return error?.status === 429 ? TOO_MANY_REQUESTS_MESSAGE : REQUEST_SENT_MESSAGE
}

/** Message d'erreur du formulaire « nouveau mot de passe ». */
export function resetErrorMessage(error: AuthError): string {
  if (error?.status === 429) return TOO_MANY_REQUESTS_MESSAGE
  switch (error?.code) {
    case "INVALID_TOKEN":
      return INVALID_LINK_MESSAGE
    case "PASSWORD_TOO_SHORT":
      return "Le mot de passe doit contenir au moins 8 caractères."
    case "PASSWORD_TOO_LONG":
      return "Le mot de passe doit contenir au plus 128 caractères."
    default:
      return "Impossible de modifier le mot de passe pour le moment."
  }
}

/** Contrôle côté formulaire avant l'appel (la longueur est revérifiée par Better Auth). */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password !== confirm) return MISMATCH_MESSAGE
  if (password.length < 8) return resetErrorMessage({ code: "PASSWORD_TOO_SHORT" })
  return null
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    let error: AuthError = null
    try {
      ;({ error } = await authClient.requestPasswordReset({ email, redirectTo: "/admin/reinitialiser" }))
    } catch {
      // Erreur réseau : même message, rien n'est révélé.
    }
    setLoading(false)
    setMessage(requestResetMessage(error))
  }

  // Hors 429, le formulaire disparaît : pas de renvois répétés.
  if (message === REQUEST_SENT_MESSAGE) return <ResetRequestSent />

  return (
    <AuthShell
      icon={<KeyRound className="size-6" aria-hidden="true" />}
      title="Mot de passe oublié"
      subtitle="Saisissez l'email de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        {message && (
          <p className="text-sm text-primary" role="status">
            {message}
          </p>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Veuillez patienter..." : "Envoyer le lien"}
        </Button>
      </form>
      <BackToLogin />
    </AuthShell>
  )
}

function BackToLogin() {
  return (
    <p className="mt-6 text-center text-sm text-muted-foreground">
      <Link href="/admin/login" className="text-foreground underline underline-offset-4">
        Retour à la connexion
      </Link>
    </p>
  )
}

/** Vue après une demande acceptée (message identique, compte existant ou non). */
export function ResetRequestSent() {
  return (
    <AuthShell
      icon={<MailCheck className="size-6" aria-hidden="true" />}
      title="Vérifiez votre boîte de réception"
      subtitle={REQUEST_SENT_MESSAGE}
    >
      <BackToLogin />
    </AuthShell>
  )
}

/** État « lien invalide » : expiré, déjà utilisé ou absent. */
export function InvalidResetLink() {
  return (
    <AuthShell
      icon={<KeyRound className="size-6" aria-hidden="true" />}
      title="Lien invalide"
      subtitle={INVALID_LINK_MESSAGE}
    >
      <Button
        render={<Link href="/admin/mot-de-passe-oublie" />}
        nativeButton={false}
        variant="secondary"
        className="w-full"
      >
        Refaire une demande
      </Button>
      <BackToLogin />
    </AuthShell>
  )
}

export function ResetPasswordForm({ token, error }: { token: string | null; error: string | null }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(!token || Boolean(error))
  const [loading, setLoading] = useState(false)

  if (invalid || !token) return <InvalidResetLink />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const problem = validateNewPassword(password, confirmPassword)
    setFormError(problem)
    if (problem) return
    setLoading(true)
    let result: { error: AuthError }
    try {
      result = await authClient.resetPassword({ newPassword: password, token: token! })
    } catch {
      result = { error: { message: "network" } }
    }
    setLoading(false)
    if (result.error) {
      if (result.error.code === "INVALID_TOKEN") return setInvalid(true)
      return setFormError(resetErrorMessage(result.error))
    }
    router.push("/admin/login?reinitialise=1")
  }

  return (
    <AuthShell
      icon={<KeyRound className="size-6" aria-hidden="true" />}
      title="Choisissez un nouveau mot de passe"
      subtitle="8 caractères minimum."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Nouveau mot de passe</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword">Confirmez le mot de passe</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Veuillez patienter..." : "Enregistrer le mot de passe"}
        </Button>
      </form>
    </AuthShell>
  )
}
