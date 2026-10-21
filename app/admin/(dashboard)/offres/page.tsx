import type { Metadata } from "next"
import { requireCompanyMember } from "@/lib/admin"
import { getAdminOptions, getAdminServices } from "@/lib/admin/catalog-queries"
import { usesLegacyBookingWizard } from "@/lib/company/publication-shared"
import { OffersManager } from "@/components/admin/offres/offers-manager"
import { listOffers } from "./actions"

export const metadata: Metadata = { title: "Offres & réductions" }

/**
 * L21 — Offres & réductions. Tenant et rôle issus de la SESSION uniquement.
 * Lecture : tout membre ; écriture : OWNER / ADMIN (contrôle serveur dans
 * ./actions.ts, l'interface ne fait que masquer les boutons).
 */
export default async function OffresPage() {
  const { tenant, role } = await requireCompanyMember()

  if (usesLegacyBookingWizard(tenant.customSiteKey)) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Offres &amp; réductions</h1>
        <p className="text-sm text-muted-foreground">
          Les offres automatiques ne sont pas disponibles pour votre parcours de réservation personnalisé.
        </p>
      </div>
    )
  }

  const [lists, services, options] = await Promise.all([listOffers(), getAdminServices(tenant.id), getAdminOptions(tenant.id)])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">Offres &amp; réductions</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Réductions appliquées automatiquement à la réservation, équivalences entre prestations et compléments suggérés à vos clients.
        </p>
      </div>
      <OffersManager
        lists={lists}
        canEdit={role === "OWNER" || role === "ADMIN"}
        timeZone={tenant.timezone ?? "Europe/Paris"}
        services={services.map((s) => ({ id: s.id, name: s.name, priceCents: s.basePriceCents }))}
        options={options.map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents }))}
      />
    </div>
  )
}
