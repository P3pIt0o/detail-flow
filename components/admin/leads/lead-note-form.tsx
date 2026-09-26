"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addLeadNoteAction } from "@/app/admin/(dashboard)/leads/actions"

/**
 * Ajout d'une note interne (jamais envoyée au prospect). Les notes s'empilent
 * dans l'historique (aucun écrasement). Enter+Ctrl/⌘ pour envoyer, avec garde
 * IME (composition CJK).
 */
export function LeadNoteForm({ leadId }: { leadId: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  function submit() {
    const message = ref.current?.value.trim() ?? ""
    if (!message) {
      setError("La note est vide.")
      return
    }
    setError(null)
    const fd = new FormData()
    fd.set("leadId", String(leadId))
    fd.set("message", message)
    startTransition(async () => {
      const res = await addLeadNoteAction(fd)
      if (!res.ok) setError(res.error)
      else {
        if (ref.current) ref.current.value = ""
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="lead-note" className="sr-only">
        Ajouter une note
      </label>
      <textarea
        id="lead-note"
        ref={ref}
        rows={3}
        placeholder="Ajouter une note (échange téléphonique, précision du besoin…)"
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            (e.metaKey || e.ctrlKey) &&
            !e.nativeEvent.isComposing &&
            e.keyCode !== 229
          ) {
            e.preventDefault()
            submit()
          }
        }}
        className="min-h-20 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        {error ? <p className="text-sm text-destructive">{error}</p> : <span />}
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Ajout…" : "Ajouter la note"}
        </button>
      </div>
    </div>
  )
}
