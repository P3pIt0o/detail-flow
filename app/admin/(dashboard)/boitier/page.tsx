import type { Metadata } from "next"
import { requireAdmin } from "@/lib/admin"
import { BoitierPanel } from "@/components/admin/boitier/boitier-panel"

export const metadata: Metadata = { title: "Boîtier" }
export const dynamic = "force-dynamic"

export default async function BoitierPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Boîtier</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Gérez le boîtier connecté de votre entreprise. Interface prête ; la
          communication avec l&apos;appareil sera activée prochainement.
        </p>
      </div>
      <BoitierPanel />
    </div>
  )
}
