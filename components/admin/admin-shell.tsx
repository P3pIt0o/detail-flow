"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Cpu, ExternalLink, LogOut, PanelLeftClose, PanelLeftOpen, ShieldCheck } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { CopyLinkButton } from "@/components/admin/copy-link-button"
import { PwaInstallHint } from "@/components/admin/pwa-install-hint"
import { WidgetActionButton } from "@/components/admin/widget-action-button"
import type { WidgetPrimaryAction } from "@/lib/admin/primary-action"
import { withTenant } from "@/lib/tenant-link"
import type { MainNavItem, PlusGroup, PlusItem } from "@/lib/admin/nav"
import { MobileTabBar } from "@/components/admin/mobile-tab-bar"
import { NAV_ICONS } from "@/components/admin/nav-icons"

type SimpleItem = { href: string; label: string; Icon: React.ComponentType<{ className?: string }> }

const COLLAPSE_KEY = "df_admin_sidebar_collapsed_v1"

export function AdminShell({
  brandName,
  companyName,
  adminName,
  isSuperAdmin = false,
  mainNav,
  groups,
  publicUrl,
  widgetAction = null,
  children,
}: {
  widgetAction?: WidgetPrimaryAction | null
  brandName: string
  companyName: string
  adminName: string
  isSuperAdmin?: boolean
  mainNav: MainNavItem[]
  groups: PlusGroup[]
  publicUrl: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1")
    } catch {
      /* ignore */
    }
  }, [])

  // En aperçu (sans sous-domaine), le tenant est porté par `?tenant=`. On le
  // conserve à chaque navigation interne via le helper central withTenant (qui
  // gère aussi les URLs possédant déjà `?status=`, `?due=`, etc.). En production
  // (sous-domaines), tenantParam est absent : aucun effet.
  const tenantParam = searchParams.get("tenant")

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
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  // Entrées super-admin (jamais affichées aux utilisateurs classiques).
  const superItems: SimpleItem[] = [
    { href: "/super-admin", label: "Super-admin", Icon: ShieldCheck },
    { href: "/admin/boitier", label: "Boîtier", Icon: Cpu },
  ]

  // Certaines entrées visent un onglet des Paramètres (`?tab=`) : l'onglet fait
  // partie de l'état actif, et « Tous les réglages » ne s'allume pas en même temps.
  const tabParam = searchParams.get("tab")
  const linkedTabs = new Set(groups.flatMap((g) => g.items.map((i) => i.href.split("?tab=")[1])).filter(Boolean))
  function isItemActive(href: string) {
    const [path, tab] = href.split("?tab=")
    if (tab) return pathname === path && tabParam === tab
    if (path === "/admin/parametres" && tabParam && linkedTabs.has(tabParam)) return false
    return isActive(path)
  }

  function sidebarLink(item: PlusItem | MainNavItem) {
    const Icon = NAV_ICONS[item.icon]
    const download = "download" in item && item.download
    const active = !download && isItemActive(item.href)
    const props = {
      "aria-current": active ? ("page" as const) : undefined,
      title: collapsed ? item.label : undefined,
      className: cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-2",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ),
    }
    const content = (
      <>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
      </>
    )
    // Téléchargement (export) : lien classique, jamais de navigation client.
    return download ? (
      <a key={item.href} href={withTenant(item.href, tenantParam)} {...props}>
        {content}
      </a>
    ) : (
      <Link key={item.href} href={withTenant(item.href, tenantParam)} {...props}>
        {content}
      </Link>
    )
  }

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
        {/* « Plus » n'a pas lieu d'être ici : ses rubriques sont affichées en entier. */}
        <div className="flex flex-col gap-1">{mainNav.filter((i) => i.href !== "/admin/plus").map(sidebarLink)}</div>

        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            {!collapsed ? (
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            ) : (
              <div className="mx-2 mb-1 border-t border-border" aria-hidden="true" />
            )}
            {group.items.map(sidebarLink)}
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
                  href={withTenant(href, tenantParam)}
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
        {widgetAction ? (
          <WidgetActionButton action={widgetAction} />
        ) : (
          // L96 : sur mobile, l'accueil « Aujourd'hui » n'affiche pas « Copier mon lien »
          // (le partage est dans l'écran lui-même quand il est utile).
          <div className="max-lg:group-has-[[data-today-home]]/shell:hidden">
            <CopyLinkButton url={publicUrl} />
          </div>
        )}
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

  /* ----------------- Bloc compte de la page « Plus » (mobile) ------------ */
  // Lien public, super-admin et déconnexion : sur ordinateur, ils sont dans
  // l'en-tête et le menu latéral.
  const mobileRowClass =
    "flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
  const mobileAccount =
    pathname === "/admin/plus" ? (
      <div className="mt-4 flex flex-col gap-2 lg:hidden">
        {widgetAction ? (
          <WidgetActionButton action={widgetAction} className="w-full" />
        ) : (
          <CopyLinkButton url={publicUrl} className="w-full" />
        )}
        {publicUrl ? (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={mobileRowClass}>
            <ExternalLink className="size-5 shrink-0" aria-hidden="true" />
            Voir mon site
          </a>
        ) : null}
        {isSuperAdmin &&
          superItems.map(({ href, label, Icon }) => (
            <Link key={href} href={withTenant(href, tenantParam)} className={mobileRowClass}>
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          ))}
        <div className="mt-2 border-t border-border pt-3">
          <p className="truncate px-1 text-[11px] text-muted-foreground">Connecté en tant que</p>
          <p className="truncate px-1 pb-2 text-sm font-medium text-foreground">{adminName}</p>
          <button type="button" onClick={handleSignOut} className={mobileRowClass}>
            <LogOut className="size-5 shrink-0" aria-hidden="true" />
            Se déconnecter
          </button>
        </div>
      </div>
    ) : null

  return (
    <div className="group/shell flex min-h-svh bg-background">
      {desktopSidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <main className="flex-1 overflow-x-hidden px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <PwaInstallHint />
          {children}
          {mobileAccount}
        </main>
      </div>
      <MobileTabBar items={mainNav} />
    </div>
  )
}
