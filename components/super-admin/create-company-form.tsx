"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Check, Copy, ExternalLink } from "lucide-react"
import { createCompanyAction } from "@/app/super-admin/actions"
import { normalizeSlug, tenantPublicUrl, tenantAdminUrl } from "@/lib/tenant-shared"

/**
 * Copie du texte dans le presse-papiers de façon robuste.
 * L'API Clipboard est bloquée dans certaines iframes (permissions policy) :
 * on retombe alors sur un textarea masqué + execCommand("copy").
 */
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Ignore et bascule sur le repli ci-dessous.
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = value
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** Petit bouton "copier" réutilisable. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(value)
        if (!ok) return
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
      aria-label="Copier"
    >
      {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
    </button>
  )
}

/** Bouton "tout copier" : livre l'ensemble des accès en un seul bloc partageable. */
function CopyRecapButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(value)
        if (!ok) return
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
    >
      {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
      {copied ? "Récapitulatif copié" : "Copier le récapitulatif complet"}
    </button>
  )
}

function RecapRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate font-medium text-foreground underline underline-offset-2"
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <p className="truncate font-mono text-sm font-medium text-foreground">{value}</p>
        )}
      </div>
      <CopyButton value={value} />
    </div>
  )
}

export function CreateCompanyForm({ rootDomain }: { rootDomain: string | null }) {
  const [state, formAction, pending] = useActionState(createCompanyAction, null)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)

  // Auto-suggestion du slug depuis le nom tant que l'utilisateur ne l'a pas édité.
  useEffect(() => {
    if (!slugEdited) setSlug(normalizeSlug(name))
  }, [name, slugEdited])

  // Écran de récapitulatif après création réussie.
  if (state?.ok && state.result) {
    const r = state.result
    const publicUrl = tenantPublicUrl(r.slug, rootDomain ?? undefined)
    const adminUrl = tenantAdminUrl(r.slug, rootDomain ?? undefined)
    // Bloc de livraison prêt à transmettre au client en un seul copier-coller.
    const shareBlock = [
      "Votre espace DetailFlow est prêt.",
      "",
      `Site public : ${publicUrl}`,
      `Administration : ${adminUrl}`,
      `Identifiant : ${r.ownerEmail}`,
      ...(r.ownerCreated && r.tempPassword
        ? [`Mot de passe temporaire : ${r.tempPassword}`, "(à changer après la première connexion)"]
        : []),
    ].join("\n")
    return (
      <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">Démonstration prête</h2>
            <p className="text-sm text-muted-foreground">L&apos;entreprise a été provisionnée.</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <RecapRow label="Site public" value={publicUrl} href={publicUrl} />
          <RecapRow label="Administration" value={adminUrl} href={adminUrl} />
          <RecapRow label="Email du propriétaire" value={r.ownerEmail} />
          {r.ownerCreated && r.tempPassword ? (
            <RecapRow label="Mot de passe temporaire (à communiquer une seule fois)" value={r.tempPassword} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Un compte existait déjà pour cet email : il a été rattaché comme propriétaire (aucun
              nouveau mot de passe généré).
            </p>
          )}
        </div>

        {r.ownerCreated && r.tempPassword && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Communiquez ce mot de passe temporaire de façon sécurisée. Le propriétaire pourra le
            changer après sa première connexion.
          </p>
        )}

        <CopyRecapButton value={shareBlock} />

        <div className="flex gap-3">
          <Link href="/super-admin" className={buttonVariants({ variant: "secondary" })}>
            Retour à la liste
          </Link>
          <a href={publicUrl} target="_blank" rel="noreferrer" className={buttonVariants()}>
            Ouvrir le site
          </a>
        </div>
      </div>
    )
  }

  const previewUrl = slug ? tenantPublicUrl(slug, rootDomain ?? undefined) : ""

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nom de l&apos;entreprise</Label>
        <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Sous-domaine (slug)</Label>
        <Input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => {
            setSlugEdited(true)
            setSlug(normalizeSlug(e.target.value))
          }}
          required
          minLength={3}
        />
        {previewUrl && (
          <p className="text-xs text-muted-foreground">
            URL : <span className="font-mono text-foreground">{previewUrl}</span>
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ownerName">Nom du propriétaire</Label>
          <Input id="ownerName" name="ownerName" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ownerEmail">Email du propriétaire</Label>
          <Input id="ownerEmail" name="ownerEmail" type="email" required />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="city">Ville (optionnel)</Label>
          <Input id="city" name="city" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="betaDays">Durée beta (jours)</Label>
          <Input id="betaDays" name="betaDays" type="number" min={1} defaultValue={30} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="brandPrimary">Couleur principale (optionnel)</Label>
        <Input id="brandPrimary" name="brandPrimary" placeholder="#0ea5e9" />
      </div>

      <label className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
        <span>
          <span className="block font-medium text-foreground">Générer des données de démonstration</span>
          <span className="block text-xs text-muted-foreground">
            Prestations, tarifs, options et réservations d&apos;exemple (marquées démo).
          </span>
        </span>
        <Switch name="withDemo" defaultChecked />
      </label>

      {state && !state.ok && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Création en cours..." : "Créer l'entreprise"}
      </Button>
    </form>
  )
}
