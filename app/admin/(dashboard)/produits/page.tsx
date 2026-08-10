import type { Metadata } from "next"
import { requireAdmin } from "@/lib/admin"
import { getProductPurchases } from "@/lib/admin/queries"
import { ProductPurchasesTable } from "@/components/admin/product-purchases-table"

export const metadata: Metadata = { title: "Produits" }
export const dynamic = "force-dynamic"

export default async function ProduitsPage() {
  await requireAdmin()
  const purchases = await getProductPurchases()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Produits / Consommables</h1>
        <p className="text-sm text-muted-foreground">
          Enregistrez vos achats de produits utilisés pour vos prestations (shampoing, polish, céramique…).
        </p>
      </div>
      <ProductPurchasesTable purchases={purchases} />
    </div>
  )
}
