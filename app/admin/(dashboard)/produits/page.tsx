import type { Metadata } from "next"
import { requireAdmin } from "@/lib/admin"
import { getProductPurchases } from "@/lib/admin/queries"
import { ProductPurchasesTable } from "@/components/admin/product-purchases-table"
import { requireCompanyId } from "@/lib/tenant"
import { canUseFeature } from "@/lib/licensing/enforce"

export const metadata: Metadata = { title: "Produits" }
export const dynamic = "force-dynamic"

export default async function ProduitsPage() {
  await requireAdmin()
  // companyId résolu côté serveur (isolation + évaluation des droits).
  const companyId = await requireCompanyId()
  // Feature expense_management. LEGACY (licensePlan = NULL) => autorisé.
  const canExpenses = await canUseFeature(companyId, "expense_management")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Produits / Consommables</h1>
        <p className="text-sm text-muted-foreground">
          Enregistrez vos achats de produits utilisés pour vos prestations (shampoing, polish, céramique…).
        </p>
      </div>

      {canExpenses ? (
        // Ne charge les dépenses QUE si la feature est incluse (aucun calcul
        // premium inutile). La sécurité d'écriture reste dans les Server Actions.
        <ProductPurchasesTable purchases={await getProductPurchases(companyId)} />
      ) : (
        // Page verrouillée proprement (préférée à un 404 dans l'admin). Aucune
        // donnée supprimée : les dépenses historiques réapparaissent à la
        // réactivation de la feature.
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Cette fonctionnalité n&apos;est pas incluse dans votre licence.</p>
        </div>
      )}
    </div>
  )
}
