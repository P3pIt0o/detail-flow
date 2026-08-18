import type React from "react"
import { requireCompanyMember } from "@/lib/admin"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { PwaInstallHint } from "@/components/admin/pwa-install-hint"

export const metadata = {
  title: "Espace pro",
  robots: { index: false, follow: false },
}

/**
 * Layout protégé du dashboard.
 * requireAdmin() redirige vers /admin/login si aucune session valide.
 * Les pages /admin/login et /admin/setup sont hors de ce groupe (non protégées).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCompanyMember()

  return (
    <div className="flex min-h-svh flex-col bg-background lg:flex-row">
      <AdminSidebar
        adminName={ctx.user.name || ctx.user.email}
        isSuperAdmin={ctx.isSuperAdmin}
      />
      <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
        <PwaInstallHint />
        {children}
      </main>
    </div>
  )
}
