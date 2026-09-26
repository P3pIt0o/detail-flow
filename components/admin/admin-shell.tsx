"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { CopyLinkButton } from "@/components/admin/copy-link-button"
import { PwaInstallHint } from "@/components/admin/pwa-install-hint"
import type { AdminNavGroup, AdminNavIcon, AdminNavItem } from "@/lib/admin/nav"
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Inbox,
  FileText,
  Users,
  Sparkles,
  Settings,
  LogOut,
  X,
  ShieldCheck,
  Cpu,
  Package,
  Globe,
  CalendarCheck,
  PanelLeftClose,
  PanelLeftOpen,
  MoreHorizontal,
  ExternalLink,
  BarChart3,
  UserPlus,
} from "lucide-react"

// Clé d'icône (pure, définie dans lib/admin/nav) → composant lucide.
const NAV_ICONS: Record<AdminNavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  reservations: ClipboardList,
  demandes: Inbox,
  leads: UserPlus,
  factures: FileText,
  clients: Users,
  prestations: Sparkles,
  produits: Package,
  analyse: BarChart3,
  reservationLink: CalendarCheck,
  web: Globe,
  settings: Settings,
}

type SimpleItem = { href: string; label: string; Icon: React.ComponentType<{ className?: string }> }

const COLLAPSE_KEY = "df_admin_sidebar_collapsed_v1"

export function AdminShell({
  brandName,
  companyName,
  adminName,
  isSuperAdmin = false,
  groups,
  primaryMobile,
  publicUrl,
  children,
}: {
  brandName: string
  companyName: string
  adminName: string
  isSuperAdmin?: boolean
  groups: AdminNavGroup[]
  primaryMobile: AdminNavItem[]
  publicUrl: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1")
    } catch {
      /* ignore */
    }
  }, [])

  // Ferme la feuille « Plus » à chaque navigation.
  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  // En aperçu (sans sous-domaine), le tenant est porté par `?tenant=`. On le
  // conserve à chaque navigation interne. En production (sous-domaines), absent.
  const tenantParam = searchParams.get("tenant")
  const withTenant = (href: string) => (tenantParam ? `${href}?tenant=${tenantParam}` : href)

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/admin/login")
    router.refresh()
  }

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin"
    return pathname.startsWith(href)
  }

  // Entrées super-admin (jamais affichées aux utilisateurs classiques).
  const superItems: SimpleItem[] = [
    { href: "/super-admin", label: "Super-admin", Icon: ShieldCheck },
    { href: "/admin/boitier", label: "Boîtier", Icon: Cpu },
  ]

  // Entrées « Plus » (mobile) = tout ce qui n'est pas dans la barre du bas.
  const primaryHrefs = new Set(primaryMobile.map((i) => i.href))
  const moreItems: SimpleItem[] = groups
    .flatMap((g) => g.items)
    .filter((i) => !primaryHrefs.has(i.href))
    .map((i) => ({ href: i.href, label: i.label, Icon: NAV_ICONS[i.icon] }))

  /* --------------------------- Sidebar desktop --------------------------- */
  const desktopSidebar = (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("flex items-center gap-2 px-4 py-4", collapsed && "justify-center px-2")}>
        {!collapsed && (
          <span className="truncate text-lg font-bold tracking-tight text-foreground">{brandName}</span>
        )}
        {!collapsed && (
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Pro
          </span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Déplier le menu" : "Réduire le menu"}
          className={cn(
            "ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "ml-0",
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4" aria-label="Navigation principale">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            {!collapsed ? (
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            ) : (
              <div className="mx-2 mb-1 border-t border-border" aria-hidden="true" />
            )}
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.icon]
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={withTenant(item.href)}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-2",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              )
            })}
          </div>
        ))}

        {isSuperAdmin && (
          <div className="flex flex-col gap-1">
            {!collapsed ? (
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Administration DetailFlow
              </p>
            ) : (
              <div className="mx-2 mb-1 border-t border-border" aria-hidden="true" />
            )}
            {superItems.map(({ href, label, Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={withTenant(href)}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-2",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      <div className="mt-auto border-t border-border p-3">
        {!collapsed && (
          <>
            <p className="truncate px-2 text-[11px] text-muted-foreground">Connecté en tant que</p>
            <p className="truncate px-2 pb-2 text-sm font-medium text-foreground">{adminName}</p>
          </>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          title={collapsed ? "Se déconnecter" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-2",
          )}
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          {!collapsed && "Se déconnecter"}
        </button>
      </div>
    </aside>
  )

  /* ------------------------------- Header -------------------------------- */
  const header = (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground sm:text-base">{companyName}</p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">Votre activité aujourd&apos;hui</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <CopyLinkButton url={publicUrl} />
        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Voir mon site"
            title="Voir mon site"
            className="hidden size-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </header>
  )

  /* --------------------------- Bottom nav mobile ------------------------- */
  const bottomNav = (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {primaryMobile.map((item) => {
        const Icon = NAV_ICONS[item.icon]
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={withTenant(item.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="max-w-full truncate px-1">{item.label}</span>
          </Link>
        )
      })}
      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        className={cn(
          "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors",
          moreOpen ? "text-primary" : "text-muted-foreground",
        )}
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
        <span>Plus</span>
      </button>
    </nav>
  )

  /* --------------------------- Feuille « Plus » -------------------------- */
  const moreSheet = moreOpen ? (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Plus d'options">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => setMoreOpen(false)}
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 max-h-[85svh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Menu</p>
          <button
            type="button"
            onClick={() => setMoreOpen(false)}
            aria-label="Fermer"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mb-3">
          <CopyLinkButton url={publicUrl} className="w-full" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {moreItems.map(({ href, label, Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={withTenant(href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="leading-tight text-pretty">{label}</span>
              </Link>
            )
          })}
          {publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background p-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="size-5" aria-hidden="true" />
              <span className="leading-tight text-pretty">Voir mon site</span>
            </a>
          ) : null}
        </div>

        {isSuperAdmin && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Administration DetailFlow
            </p>
            <div className="grid grid-cols-3 gap-2">
              {superItems.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={withTenant(href)}
                  className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background p-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Icon className="size-5" aria-hidden="true" />
                  <span className="leading-tight text-pretty">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-border pt-3">
          <p className="truncate px-1 text-[11px] text-muted-foreground">Connecté en tant que</p>
          <p className="truncate px-1 pb-2 text-sm font-medium text-foreground">{adminName}</p>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="flex min-h-svh bg-background">
      {desktopSidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <main className="flex-1 overflow-x-hidden px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <PwaInstallHint />
          {children}
        </main>
      </div>
      {bottomNav}
      {moreSheet}
    </div>
  )
}
