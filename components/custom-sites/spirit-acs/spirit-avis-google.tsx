/**
 * Section « Avis » de Spirit ACS — variante SOURCE GOOGLE.
 *
 * Réutilise TEL QUEL le composant partagé `GoogleReviewsSection` (aucune
 * duplication, aucun fork) : mêmes garanties de conformité Google (attribution,
 * liens vers les avis, mention de traduction, note de pertinence non
 * exhaustive). Les données arrivent déjà résolues et nettoyées par
 * `resolveTenantReviews` — ici, AUCUN appel réseau, AUCUNE clé API.
 *
 * Cette section n'est rendue par la page que lorsqu'il existe réellement des
 * données Google exploitables (note et/ou avis) : aucun avis inventé, aucun
 * espace vide. L'habillage sombre Spirit est appliqué via le remap de tokens
 * scopé `.spirit-reviews-google` (voir spirit.css), comme les autres
 * composants DetailFlow réutilisés par Spirit.
 */

import { GoogleReviewsSection } from "@/components/reviews/google-reviews-section"
import type { GooglePlaceDetails } from "@/lib/reviews/google-places"
import { SpiritSentences } from "./spirit-sentences"
import { SPIRIT_SECTIONS } from "./tokens"

type SpiritAvisGoogleProps = {
  title: string
  intro: string | null
  details: GooglePlaceDetails
}

export function SpiritAvisGoogle({ title, intro, details }: SpiritAvisGoogleProps) {
  return (
    <div
      id={SPIRIT_SECTIONS.avis}
      data-spirit-anchor
      className="spirit-reviews-google bg-[var(--spirit-navy-2)]"
    >
      <GoogleReviewsSection
        details={details}
        appearance={{
          title,
          // Une phrase par ligne (présentation) : `reviews.intro` non réécrit.
          subtitle: intro ? <SpiritSentences text={intro} /> : undefined,
          columns: 3,
          maxItems: 6,
          // Le fond navy est porté par le conteneur d'ancre ci-dessus : la
          // section réutilisée reste transparente (pas de double bordure/fond).
          className: "bg-transparent",
          cardClassName:
            "flex h-full min-w-0 flex-col rounded-2xl border border-white/10 bg-[var(--spirit-navy-3)] p-6",
        }}
      />
    </div>
  )
}
