"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, MailCheck } from "lucide-react"
import { siteConfig } from "@/config/site"

/**
 * Formulaire d'authentification du dashboard.
 * - mode "signup" : inscription publique (nom, email, mot de passe + confirmation).
 *   L'email doit ensuite être confirmé via le lien reçu.
 * - mode "login"  : connexion d'un administrateur existant.
 */
export function AdminAuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter()
  const isSignup = mode === "signup"

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Écran "vérifiez votre email" après une inscription réussie.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  // Cas connexion avec email non confirmé : on propose de renvoyer le lien.
  const [needsVerification, setNeedsVerification] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNeedsVerification(false)

    if (isSignup && password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.")
      return
    }

    setLoading(true)

    if (isSignup) {
      const { error } = await authClient.signUp.email({
        email,
        password,
        name,
        callbackURL: "/admin",
      })
      setLoading(false)
      if (error) {
        setError(error.message ?? "Impossible de créer le compte.")
        return
      }
      // Compte créé : un email de confirmation a été envoyé.
      setPendingEmail(email)
      return
    }

    const { error } = await authClient.signIn.email({ email, password })
    setLoading(false)
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED" || error.status === 403) {
        setNeedsVerification(true)
        setError("Votre email n'est pas encore confirmé. Vérifiez votre boîte de réception.")
        return
      }
      setError("Email ou mot de passe incorrect.")
      return
    }
    router.push("/admin")
    router.refresh()
  }

  async function resendVerification(targetEmail: string) {
    setResent(false)
    setError(null)
    const { error } = await authClient.sendVerificationEmail({
      email: targetEmail,
      callbackURL: "/admin",
    })
    if (error) {
      setError("Impossible de renvoyer l'email pour le moment.")
      return
    }
    setResent(true)
  }

  // Écran de confirmation post-inscription.
  if (pendingEmail) {
    return (
      <AuthShell
        icon={<MailCheck className="size-6" aria-hidden="true" />}
        title="Confirmez votre email"
        subtitle={`Un lien de confirmation a été envoyé à ${pendingEmail}. Cliquez dessus pour activer votre compte, puis connectez-vous.`}
      >
        <div className="flex flex-col gap-3">
          <Button variant="secondary" onClick={() => resendVerification(pendingEmail)} className="w-full">
            Renvoyer l&apos;email
          </Button>
          {resent && (
            <p className="text-sm text-primary" role="status">
              Email renvoyé.
            </p>
          )}
          <Link
            href="/admin/login"
            className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Retour à la connexion
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      icon={<Lock className="size-6" aria-hidden="true" />}
      title={isSignup ? "Créer un compte pro" : `Espace pro — ${siteConfig.brand.name}`}
      subtitle={
        isSignup
          ? "Inscrivez-vous pour gérer les réservations. Votre email sera à confirmer."
          : "Connectez-vous pour gérer vos réservations."
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isSignup && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
        )}
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
        </div>
        {isSignup && (
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
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {needsVerification && (
          <div className="flex flex-col gap-2">
            <Button type="button" variant="secondary" onClick={() => resendVerification(email)}>
              Renvoyer l&apos;email de confirmation
            </Button>
            {resent && (
              <p className="text-sm text-primary" role="status">
                Email renvoyé.
              </p>
            )}
          </div>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading
            ? "Veuillez patienter..."
            : isSignup
              ? "Créer le compte"
              : "Se connecter"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isSignup ? (
          <>
            Vous avez déjà un compte ?{" "}
            <Link href="/admin/login" className="text-foreground underline underline-offset-4">
              Se connecter
            </Link>
          </>
        ) : (
          <>
            Pas encore de compte ?{" "}
            <Link href="/admin/signup" className="text-foreground underline underline-offset-4">
              Créer un compte
            </Link>
          </>
        )}
      </p>
    </AuthShell>
  )
}

/** Enveloppe visuelle commune (carte centrée). */
function AuthShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  )
}
