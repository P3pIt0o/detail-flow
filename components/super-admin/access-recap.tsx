"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"

/**
 * Copie du texte dans le presse-papiers de façon robuste.
 * L'API Clipboard est bloquée dans certaines iframes (permissions policy) :
 * on retombe alors sur un textarea masqué + execCommand("copy").
 */
export async function copyToClipboard(value: string): Promise<boolean> {
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

/** Petit bouton "copier" réutilisable (icône seule). */
export function CopyButton({ value, label = "Copier" }: { value: string; label?: string }) {
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
      aria-label={label}
    >
      {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
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

export type AccessInfo = {
  companyName: string
  slug: string
  publicUrl: string
  adminUrl: string
  ownerEmail: string
  /** Mot de passe temporaire (connu uniquement à la création / réinitialisation). */
  tempPassword?: string | null
}

/** Construit le bloc texte "prêt à envoyer" (Instagram / WhatsApp). */
export function buildShareBlock(info: AccessInfo): string {
  return [
    "Votre espace DetailFlow est prêt.",
    "",
    `Entreprise : ${info.companyName}`,
    `Tenant : ${info.slug}`,
    `Site public : ${info.publicUrl}`,
    `Administration : ${info.adminUrl}`,
    `Email : ${info.ownerEmail}`,
    ...(info.tempPassword
      ? [`Mot de passe provisoire : ${info.tempPassword}`, "(à changer après la première connexion)"]
      : []),
  ].join("\n")
}

/**
 * Récapitulatif d'accès complet + bouton "Copier les accès".
 * Réutilisé à la création d'entreprise, à l'acceptation d'une demande beta et
 * dans les cartes du tableau de bord super-admin.
 */
export function AccessRecap({ info }: { info: AccessInfo }) {
  const [copied, setCopied] = useState(false)
  const shareBlock = buildShareBlock(info)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <RecapRow label="Entreprise" value={info.companyName} />
        <RecapRow label="Site public" value={info.publicUrl} href={info.publicUrl} />
        <RecapRow label="Administration" value={info.adminUrl} href={info.adminUrl} />
        <RecapRow label="Email" value={info.ownerEmail} />
        {info.tempPassword ? (
          <RecapRow label="Mot de passe provisoire (affiché une seule fois)" value={info.tempPassword} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Aucun mot de passe provisoire disponible ici. Utilisez « Réinitialiser le mot de passe » pour en générer un
            nouveau à communiquer.
          </p>
        )}
      </div>

      {info.tempPassword && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Communiquez ce mot de passe de façon sécurisée. Le propriétaire pourra le changer après sa première connexion.
        </p>
      )}

      <button
        type="button"
        onClick={async () => {
          const ok = await copyToClipboard(shareBlock)
          if (!ok) return
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        }}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
      >
        {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
        {copied ? "Accès copiés" : "Copier les accès"}
      </button>
    </div>
  )
}
