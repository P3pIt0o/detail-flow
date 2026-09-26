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
  Globe,
  CalendarCheck,
  BarChart3,
  UserPlus,
} from "lucide-react"
import { buildAdminNav, type AdminNavIcon } from "@/lib/admin/nav"
import type { OnboardingIntentValue } from "@/lib/onboarding/intent"

// Mappe la clé d'icône (pure, définie dans lib/admin/nav) vers le composant
// lucide correspondant. Garde la logique de menu testable sans JSX.
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

export function AdminSidebar({
  adminName,
  isSuperAdmin = false,
  customSiteKey = null,
  onboardingIntent = null,
}: {
  adminName: string
  isSuperAdmin?: boolean
  customSiteKey?: string | null
  onboardingIntent?: OnboardingIntentValue | null
}) {
  // Le menu s'adapte DURABLEMENT au parcours choisi (entrée « web » : Ma
  // réservation / Mon site / Page publique). Modules métier communs inchangés.
  const navItems = buildAdminNav({ intent: onboardingIntent, customSiteKey })
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
        {navItems.map(({ href, label, icon }) => {
          const Icon = NAV_ICONS[icon]
          return (
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
          )
        })}

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
            {/* Accès technique au Boîtier : masqué du menu normal, conservé pour
                le super-admin (aucune route/donnée supprimée). */}
            <Link
              href={withTenant("/admin/boitier")}
              onClick={() => setOpen(false)}
              aria-current={isActive("/admin/boitier") ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive("/admin/boitier")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Cpu className="size-4 shrink-0" aria-hidden="true" />
              Boîtier
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
