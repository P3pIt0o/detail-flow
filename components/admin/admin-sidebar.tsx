"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { siteConfig } from "@/config/site"
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
  Menu,
  X,
  ShieldCheck,
  Cpu,
  Package,
} from "lucide-react"

const NAV = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/calendrier", label: "Calendrier", icon: CalendarDays },
  { href: "/admin/reservations", label: "Réservations", icon: ClipboardList },
  { href: "/admin/demandes", label: "Demandes", icon: Inbox },
  { href: "/admin/factures", label: "Factures", icon: FileText },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/prestations", label: "Prestations", icon: Sparkles },
  { href: "/admin/produits", label: "Produits", icon: Package },
  { href: "/admin/boitier", label: "Boîtier", icon: Cpu },
  { href: "/admin/parametres", label: "Paramètres", icon: Settings },
]

export function AdminSidebar({
  adminName,
  isSuperAdmin = false,
}: {
  adminName: string
  isSuperAdmin?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  // En aperçu (sans sous-domaine), le tenant est porté par `?tenant=`. On le
  // conserve à chaque navigation pour rester sur la même entreprise. En
  // production (sous-domaines), ce paramètre est absent : aucun effet.
  const tenantParam = searchParams.get("tenant")
  const withTenant = (href: string) => (tenantParam ? `${href}?tenant=${tenantParam}` : href)

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/admin/login")
    router.refresh()
  }

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin"
    return pathname.startsWith(href)
  }

  const navContent = (
    <>
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-lg font-bold tracking-tight text-foreground">
          {siteConfig.brand.name}
        </span>
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          Pro
        </span>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Navigation dashboard">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={withTenant(href)}
            onClick={() => setOpen(false)}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        ))}

        {isSuperAdmin && (
          <>
            <div className="my-3 border-t border-border" aria-hidden="true" />
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Plateforme
            </p>
            <Link
              href={withTenant("/super-admin")}
              onClick={() => setOpen(false)}
              aria-current={isActive("/super-admin") ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive("/super-admin")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
              Super-admin
            </Link>
          </>
        )}
      </nav>

      <div className="mt-auto border-t border-border pt-4">
        <p className="truncate px-3 text-xs text-muted-foreground">Connecté en tant que</p>
        <p className="truncate px-3 pb-2 text-sm font-medium text-foreground">{adminName}</p>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Se déconnecter
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Barre mobile */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <span className="text-base font-bold text-foreground">{siteConfig.brand.name} Pro</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="rounded-md p-2 text-foreground hover:bg-muted"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card p-4 lg:flex">
        {navContent}
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-card p-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
              className="absolute right-3 top-3 rounded-md p-2 text-foreground hover:bg-muted"
            >
              <X className="size-5" />
            </button>
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}
