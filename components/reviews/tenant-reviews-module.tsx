import "server-only"

import type { ReactNode } from "react"
import type { Review } from "@/config/content"
import { ReviewCard } from "@/components/review-card"
import { Reveal } from "@/components/ui/reveal"
import { resolveRequestTenant } from "@/lib/tenant"
import { resolveTenantReviews } from "@/lib/reviews/public"
import { GoogleReviewsSection, type TenantReviewsAppearance } from "./google-reviews-section"

export type { TenantReviewsAppearance }

/** Classes de colonnes STATIQUES (grille manuelle par défaut). */
const COLUMN_CLASSES: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
}

/**
 * MODULE D'AVIS PARTAGÉ ET RÉUTILISABLE.
 *
 * Point d'entrée unique décidant de la SOURCE d'avis d'un tenant (manuel vs
 * Google) et déléguant le rendu. Intégrable :
 *   - aux sites standards DetailFlow ;
 *   - aux sites 100 % personnalisés (en passant `companyId` + `manualReviews`
 *     issus du contrat de données, et une `appearance` sur mesure).
 *
 * La logique de récupération, de sécurité (clé serveur) et de sélection de la
 * source reste CENTRALISÉE dans `lib/reviews/*`. Ce composant ne fait que
 * choisir quoi afficher.
 *
 * ISOLATION : si `companyId` n'est pas fourni, il est résolu côté serveur via
 * `resolveRequestTenant()` (hôte / appartenance) — jamais depuis le navigateur.
 *
 * Une panne Google ne casse jamais le rendu : la section est simplement masquée
 * côté public (le détail de l'erreur reste réservé à l'admin).
 */
export async function TenantReviewsModule({
  companyId,
  manualReviews,
  appearance,
  renderManual,
}: {
  /** Tenant résolu côté serveur (sites personnalisés). Sinon auto-résolu. */
  companyId?: number
  /** Avis manuels déjà chargés (contrat des sites personnalisés). */
  manualReviews?: Review[]
  /** Personnalisation visuelle (surtout pour les sites personnalisés). */
  appearance?: TenantReviewsAppearance
  /**
   * Rendu manuel sur mesure. Permet aux sites standards de CONSERVER EXACTEMENT
   * leur mise en page manuelle actuelle. Si absent, une grille par défaut
   * themée est utilisée.
   */
  renderManual?: (reviews: Review[]) => ReactNode
}) {
  let cid = companyId
  if (cid == null) {
    const tenant = await resolveRequestTenant()
    if (!tenant) return null
    cid = tenant.id
  }

  const resolved = await resolveTenantReviews(cid, { manualReviews })

  // --- Source Google ---------------------------------------------------------
  if (resolved.source === "google") {
    if (resolved.data) {
      return <GoogleReviewsSection details={resolved.data} appearance={appearance} />
    }
    // Panne / non configuré / place invalide : masquer proprement côté public.
    return null
  }

  // --- Source manuelle (défaut) ---------------------------------------------
  const list = resolved.reviews
  if (renderManual) return <>{renderManual(list)}</>

  if (list.length === 0) return null
  const columns = appearance?.columns ?? 3
  const maxItems = appearance?.maxItems
  const shown = typeof maxItems === "number" ? list.slice(0, maxItems) : list

  return (
    <section className={appearance?.className ?? "border-y border-border bg-card/30"}>
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        {(appearance?.title || appearance?.subtitle) && (
          <div className={appearance?.headerClassName ?? "flex flex-col items-center gap-3 text-center"}>
            {appearance?.title && (
              <h2 className="text-balance text-3xl font-bold text-foreground sm:text-4xl">{appearance.title}</h2>
            )}
            {appearance?.subtitle && (
              <p className="max-w-2xl text-pretty text-muted-foreground">{appearance.subtitle}</p>
            )}
          </div>
        )}
        <div className={`mt-10 grid gap-6 ${COLUMN_CLASSES[columns]}`}>
          {shown.map((review, i) => (
            <Reveal key={review.id} delay={Math.min(i, 2) * 0.08}>
              <ReviewCard review={review} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
