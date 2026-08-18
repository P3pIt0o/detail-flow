import type React from "react"
import Link from "next/link"
import { requireSuperAdmin } from "@/lib/admin"
import { ShieldCheck } from "lucide-react"

export const metadata = {
  title: "Super-administration — DetailFlow",
  robots: { index: false, follow: false },
}

// Dépend de la session : rendu dynamique.
export const dynamic = "force-dynamic"

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  // Garde plateforme : seul un compte user.superAdmin passe (sinon 404 neutre).
  const admin = await requireSuperAdmin()

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/super-admin" className="flex items-center gap-2 font-semibold text-foreground">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            DetailFlow · Super-admin
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/super-admin/paiements"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Paiements
            </Link>
            <span className="hidden text-sm text-muted-foreground sm:inline">{admin.email}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
