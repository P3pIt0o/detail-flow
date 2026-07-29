"use client"

import { useState, useTransition } from "react"
import { MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  convertToActiveAction,
  extendBetaAction,
  setStatusAction,
  removeDemoDataAction,
} from "@/app/super-admin/actions"

/**
 * Menu d'actions par entreprise (super-admin).
 * Chaque action appelle un Server Action (protégé par requireSuperAdmin) puis
 * rafraîchit la liste via revalidatePath.
 */
export function CompanyRowActions({ companyId, status }: { companyId: number; status: string }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setMsg(null)
    startTransition(async () => {
      const res = await fn()
      setMsg(res.ok ? (res.message ?? "Fait.") : (res.error ?? "Erreur."))
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {msg && <span className="hidden text-xs text-muted-foreground lg:inline">{msg}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
          disabled={pending}
          aria-label="Actions"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {status === "BETA" && (
            <DropdownMenuItem
              onClick={() => run(() => convertToActiveAction(companyId), "Convertir cette entreprise beta en cliente active ?")}
            >
              Convertir en active
            </DropdownMenuItem>
          )}
          {status === "BETA" && (
            <DropdownMenuItem onClick={() => run(() => extendBetaAction(companyId, 30))}>
              Prolonger la beta (+30 j)
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => run(() => removeDemoDataAction(companyId), "Supprimer toutes les données de démonstration ? (le catalogue et les réglages sont conservés)")}
          >
            Supprimer les données démo
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {status !== "SUSPENDED" && (
            <DropdownMenuItem
              onClick={() => run(() => setStatusAction(companyId, "SUSPENDED"), "Suspendre cette entreprise ? Son site et son admin seront inaccessibles.")}
            >
              Suspendre
            </DropdownMenuItem>
          )}
          {status === "SUSPENDED" && (
            <DropdownMenuItem onClick={() => run(() => setStatusAction(companyId, "ACTIVE"))}>
              Réactiver
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => run(() => setStatusAction(companyId, "ARCHIVED"), "Archiver cette entreprise ? Les données sont conservées mais l'accès est coupé.")}
          >
            Archiver
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
