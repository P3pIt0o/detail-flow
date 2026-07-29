"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

// Longueur minimale par défaut de Better Auth (emailAndPassword non surchargé
// dans lib/auth.ts). On la reflète côté client pour un retour immédiat ;
// la validation fait toujours autorité côté serveur.
const MIN_PASSWORD_LENGTH = 8

export function SecuritySettings() {
  const router = useRouter()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setCurrent("")
    setNext("")
    setConfirm("")
  }

  function submit() {
    setMsg(null)

    // Validations locales (jamais de mot de passe journalisé).
    if (!current || !next || !confirm) {
      setMsg({ type: "err", text: "Veuillez remplir tous les champs." })
      return
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setMsg({ type: "err", text: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` })
      return
    }
    if (next !== confirm) {
      setMsg({ type: "err", text: "Les deux nouveaux mots de passe ne correspondent pas." })
      return
    }
    if (next === current) {
      setMsg({ type: "err", text: "Le nouveau mot de passe doit être différent de l'actuel." })
      return
    }

    startTransition(async () => {
      // Fonction officielle Better Auth : vérifie le mot de passe actuel,
      // applique les règles serveur et met à jour le compte connecté.
      // revokeOtherSessions: false → on conserve la session courante.
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: false,
      })

      if (error) {
        // Message clair sans révéler de détail sensible.
        const text =
          error.code === "INVALID_PASSWORD" || error.status === 400
            ? "Le mot de passe actuel est incorrect."
            : (error.message ?? "Impossible de modifier le mot de passe.")
        setMsg({ type: "err", text })
        return
      }

      reset()
      setMsg({ type: "ok", text: "Mot de passe modifié. Votre session reste active." })
      // Si Better Auth avait invalidé la session, on redirigerait vers /admin/login.
      // Ici la session est conservée ; on rafraîchit simplement l'état serveur.
      router.refresh()
    })
  }

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Sécurité</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Modifiez le mot de passe de votre compte. Vous devez saisir votre mot de passe actuel pour confirmer votre
          identité.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="currentPassword">Mot de passe actuel</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="newPassword">Nouveau mot de passe</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmer le nouveau mot de passe</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Modification…" : "Modifier le mot de passe"}
        </Button>
        {msg && (
          <span className={msg.type === "ok" ? "text-sm text-primary" : "text-sm text-destructive"} role="status">
            {msg.text}
          </span>
        )}
      </div>
    </Card>
  )
}
