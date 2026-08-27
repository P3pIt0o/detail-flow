"use client"

import { useState, useTransition } from "react"
import { MoreHorizontal, AlertTriangle, Loader2, Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  convertToActiveAction,
  extendBetaAction,
  setStatusAction,
  removeDemoDataAction,
  endBetaAction,
  deleteCompanyAction,
  setCustomSiteKeyAction,
} from "@/app/super-admin/actions"

/**
 * Menu d'actions par entreprise (super-admin).
 * Chaque action appelle un Server Action (protégé par requireSuperAdmin) puis
 * rafraîchit la liste via revalidatePath.
 */
export function CompanyRowActions({
  companyId,
  companyName,
  status,
  customSiteKey,
  customSiteOptions,
}: {
  companyId: number
  companyName: string
  status: string
  /** Clé actuelle du site public (null = site standard). */
  customSiteKey: string | null
  /** Sites personnalisés enregistrés (métadonnées uniquement). Vide au Lot 1. */
  customSiteOptions: Array<{ key: string; name: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

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
          {status === "BETA" && (
            <DropdownMenuItem
              onClick={() => run(() => endBetaAction(companyId), "Terminer la beta maintenant ? Les nouvelles réservations seront désactivées.")}
            >
              Terminer la beta
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
            onClick={() => run(() => setStatusAction(companyId, "ARCHIVED"), "Archiver cette entreprise ? Les données sont conservées mais l'accès est coupé.")}
          >
            Archiver
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Site public : attribuer/retirer un site personnalisé. Chaque item
              appelle setCustomSiteKeyAction (validée côté serveur). La liste des
              sites provient du registre : elle affichera automatiquement les
              futures clés (aucune valeur codée en dur ici). */}
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Site public</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => run(() => setCustomSiteKeyAction(companyId, null))}>
            <Check className={`size-4 ${customSiteKey == null ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
            Site standard
          </DropdownMenuItem>
          {customSiteOptions.map((opt) => (
            <DropdownMenuItem key={opt.key} onClick={() => run(() => setCustomSiteKeyAction(companyId, opt.key))}>
              <Check className={`size-4 ${customSiteKey === opt.key ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
              {opt.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
            Supprimer définitivement
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {deleteOpen && (
        <DeleteCompanyDialog
          companyId={companyId}
          companyName={companyName}
          onClose={() => setDeleteOpen(false)}
          onDeleted={(m) => {
            setDeleteOpen(false)
            setMsg(m)
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Modale de suppression définitive : avertissement + saisie exacte du nom.   */
/* -------------------------------------------------------------------------- */

function DeleteCompanyDialog({
  companyId,
  companyName,
  onClose,
  onDeleted,
}: {
  companyId: number
  companyName: string
  onClose: () => void
  onDeleted: (message: string) => void
}) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // La saisie doit correspondre EXACTEMENT au nom de l'entreprise.
  const matches = value.trim() === companyName.trim()

  function confirmDelete() {
    if (!matches || pending) return
    setError(null)
    startTransition(async () => {
      const res = await deleteCompanyAction(companyId, value)
      if (res.ok) onDeleted(res.message)
      else setError(res.error)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-company-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-6 text-left shadow-xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="delete-company-title" className="text-base font-semibold text-foreground">
              Supprimer définitivement l&apos;entreprise
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cette action est <strong className="text-destructive">irréversible</strong>. Toutes les données de{" "}
              <strong className="text-foreground">{companyName}</strong> seront définitivement supprimées : compte(s)
              utilisateur, clients, prestations, réservations, devis, factures, paiements, réglages, images et fichiers.
              L&apos;URL du site deviendra inaccessible (404). Aucune récupération ne sera possible.
            </p>
          </div>
        </div>

        <label htmlFor="delete-company-input" className="mt-4 block text-sm font-medium text-foreground">
          Pour confirmer, tapez exactement{" "}
          <span className="font-mono text-destructive">{companyName}</span>
        </label>
        <input
          id="delete-company-input"
          type="text"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) confirmDelete()
          }}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-destructive focus:ring-1 focus:ring-destructive"
          placeholder={companyName}
          aria-invalid={!matches && value.length > 0}
        />

        {error && (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={!matches || pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Supprimer définitivement
          </button>
        </div>
      </div>
    </div>
  )
}
