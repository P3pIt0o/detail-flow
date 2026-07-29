"use client"

import { useState } from "react"
import Link from "next/link"
import { Building2, ExternalLink, Home, ShieldCheck, X, Wrench } from "lucide-react"

export type DevTenant = {
  slug: string
  name: string
  status: string
}

/**
 * Panneau de navigation flottant réservé au DÉVELOPPEMENT.
 * Rendu uniquement quand NODE_ENV !== "production" (voir DevNavPanel), donc
 * éliminé du build de production. Sert à sauter rapidement entre la vitrine,
 * le super-admin et les sites des entreprises de démo pendant le dev.
 */
export function DevNavPanelClient({ tenants }: { tenants: DevTenant[] }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] flex size-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur transition-transform hover:scale-105"
        aria-label="Ouvrir le panneau de navigation dev"
      >
        <Wrench className="size-5" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card/95 text-card-foreground shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Wrench className="size-4 text-primary" aria-hidden="true" />
          Navigation dev
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Fermer le panneau"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <nav className="flex flex-col p-2">
        <DevLink href="/marketing" icon={<Home className="size-4" aria-hidden="true" />}>
          Vitrine SaaS
        </DevLink>
        <DevLink href="/super-admin" icon={<ShieldCheck className="size-4" aria-hidden="true" />}>
          Super-admin
        </DevLink>

        <div className="mt-2 px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Entreprises de démo
        </div>

        {tenants.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">Aucune entreprise pour l&apos;instant.</p>
        ) : (
          tenants.map((t) => (
            <DevLink
              key={t.slug}
              href={`/?tenant=${t.slug}`}
              icon={<Building2 className="size-4" aria-hidden="true" />}
              badge={t.status}
            >
              {t.name}
            </DevLink>
          ))
        )}
      </nav>

      <p className="border-t border-border px-4 py-2 text-[11px] leading-snug text-muted-foreground">
        Visible en développement uniquement. Absent du build de production.
      </p>
    </div>
  )
}

function DevLink({
  href,
  icon,
  badge,
  children,
}: {
  href: string
  icon: React.ReactNode
  badge?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
    >
      <span className="text-muted-foreground group-hover:text-foreground">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {badge ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          {badge}
        </span>
      ) : null}
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
    </Link>
  )
}
