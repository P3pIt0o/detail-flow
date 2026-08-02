"use client"

import { useState, useTransition } from "react"
import { LifeBuoy } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { sendSupportReport } from "@/app/admin/(dashboard)/parametres/support-actions"

/**
 * Onglet Support : envoie un rapport à support@detailflow.fr.
 *
 * Les informations techniques disponibles uniquement côté navigateur (URL,
 * user-agent, plateforme) sont collectées automatiquement au moment de l'envoi.
 * Le contexte tenant / entreprise / utilisateur / date est ajouté côté serveur.
 */
export function SupportForm() {
  const [description, setDescription] = useState("")
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setMsg(null)
    const payload = {
      description,
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      platform:
        typeof navigator !== "undefined"
          ? // navigator.platform est déprécié mais reste le plus dispo ; repli userAgentData.
            (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
            navigator.platform ||
            ""
          : "",
    }
    startTransition(async () => {
      const res = await sendSupportReport(payload)
      if (res.ok) {
        setMsg({ type: "ok", text: "Rapport envoyé. Notre équipe vous répondra par email." })
        setDescription("")
      } else {
        setMsg({ type: "err", text: res.error ?? "Erreur lors de l'envoi." })
      }
    })
  }

  return (
    <Card className="max-w-2xl space-y-5 p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LifeBuoy className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Assistance</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Un bug, une question, une suggestion ? Envoyez un rapport à notre équipe. Les informations techniques
            (page, navigateur, appareil, date) sont jointes automatiquement pour accélérer le diagnostic.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="supportDescription">Description du problème</Label>
        <Textarea
          id="supportDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Décrivez ce qui ne fonctionne pas, la page concernée et les étapes pour reproduire le problème…"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending || description.trim().length < 5}>
          {pending ? "Envoi…" : "Envoyer le rapport"}
        </Button>
        {msg && (
          <span className={msg.type === "ok" ? "text-sm text-primary" : "text-sm text-destructive"}>
            {msg.text}
          </span>
        )}
      </div>
    </Card>
  )
}
