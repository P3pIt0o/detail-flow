"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { decideCustomRequest } from "@/app/(site)/demande/[token]/actions"

type DecisionResult = { status: "idle" | "success" | "error"; message?: string; decision?: "accepted" | "declined" }
const initial: DecisionResult = { status: "idle" }

/**
 * Boutons Accepter / Refuser côté client. Le token (secret du lien) est envoyé
 * en champ caché ; il constitue la seule autorisation nécessaire.
 * `initialIntent` pré-sélectionne l'action quand l'email pointe déjà vers
 * ?intent=accept|refuse, mais l'utilisateur confirme toujours par un clic.
 */
export function CustomRequestDecision({
  token,
  initialIntent,
}: {
  token: string
  initialIntent?: "accepted" | "declined"
}) {
  const [state, formAction, pending] = useActionState(decideCustomRequest, initial)
  const [choice, setChoice] = useState<"accepted" | "declined" | null>(initialIntent ?? null)

  if (state.status === "success") {
    const accepted = state.decision === "accepted"
    return (
      <div
        className={`mt-6 flex items-start gap-3 rounded-xl border p-5 ${
          accepted ? "border-primary/40 bg-primary/10" : "border-border bg-muted/40"
        }`}
      >
        {accepted ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        )}
        <div className="text-sm">
          <p className="font-semibold text-foreground">{accepted ? "Proposition acceptée" : "Réponse enregistrée"}</p>
          <p className="mt-1 text-muted-foreground">{state.message}</p>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decision" value={choice ?? ""} />

      {state.status === "error" && (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          onClick={() => setChoice("accepted")}
          disabled={pending}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {pending && choice === "accepted" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Accepter la proposition
        </button>
        <button
          type="submit"
          onClick={() => setChoice("declined")}
          disabled={pending}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          {pending && choice === "declined" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Refuser
        </button>
      </div>
    </form>
  )
}
