"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { CalendarDays, FileText, Plus, UserPlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { withTenant } from "@/lib/tenant-link"
import type { MainNavItem } from "@/lib/admin/nav"
import { NAV_ICONS } from "@/components/admin/nav-icons"

/**
 * Barre d'onglets du téléphone (< lg) : 4 entrées + bouton « + » central qui ouvre
 * une feuille Nouveau client / Agenda / Factures.
 */
export function MobileTabBar({ items }: { items: readonly MainNavItem[] }) {
  const pathname = usePathname()
  const tenantParam = useSearchParams().get("tenant")
  const [open, setOpen] = useState(false)
  const firstAction = useRef<HTMLAnchorElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const opener = trigger.current
    firstAction.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false)
      // Piège de focus de la feuille modale : Tab boucle sur ses actions.
      if (e.key !== "Tab" || !sheet.current) return
      const focusable = sheet.current.querySelectorAll<HTMLElement>("a[href], button")
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault()
        ;(e.shiftKey ? last : first)?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      opener?.focus()
    }
  }, [open])

  // « Plus » reste allumé sur tous les écrans qui ne sont pas les 3 autres onglets.
  const under = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`)
  const others = items.filter((i) => i.href !== "/admin/plus")
  const isActive = (href: string) => (href === "/admin/plus" ? !others.some((i) => under(i.href)) : under(href))

  const tab = (item: MainNavItem) => {
    const Icon = NAV_ICONS[item.icon]
    const active = isActive(item.href)
    return (
      <Link
        key={item.href}
        href={withTenant(item.href, tenantParam)}
        aria-current={active ? "page" : undefined}
        className={cn(
          // basis-auto : « Aujourd'hui » ne tient pas en parts égales à 360 px.
          "flex min-h-14 min-w-0 flex-1 basis-auto flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
        <span className="max-w-full truncate px-0.5">{item.label}</span>
      </Link>
    )
  }

  const actionClass = "flex min-h-14 w-full items-center gap-4 border-b border-border px-1 text-base font-semibold text-foreground"

  return (
    <>
      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex min-w-0 flex-1">{items.slice(0, 2).map(tab)}</div>
        <div className="flex w-[72px] shrink-0 items-start justify-center">
          <button
            ref={trigger}
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="Nouveau"
            className="-mt-5 flex size-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <Plus className="size-7" aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-w-0 flex-1">{items.slice(2).map(tab)}</div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Nouveau">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={sheet}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
            <Link
              ref={firstAction}
              href={withTenant("/admin/clients/new", tenantParam)}
              onClick={() => setOpen(false)}
              className={actionClass}
            >
              <UserPlus className="size-6 shrink-0" aria-hidden="true" />
              Nouveau client
            </Link>
            <Link href={withTenant("/admin/calendrier", tenantParam)} onClick={() => setOpen(false)} className={actionClass}>
              <CalendarDays className="size-6 shrink-0" aria-hidden="true" />
              Agenda
            </Link>
            <Link
              href={withTenant("/admin/factures", tenantParam)}
              onClick={() => setOpen(false)}
              className={cn(actionClass, "border-b-0")}
            >
              <FileText className="size-6 shrink-0" aria-hidden="true" />
              Factures / encaisser
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
              Fermer
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
