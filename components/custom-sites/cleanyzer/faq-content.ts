/**
 * FAQ CLEANYZER — contenu (module PUR, importable côté serveur).
 * Réponses STRICTEMENT fondées sur le cahier (tarifs §5-8, déplacement §9).
 * Affichée par `CleanyzerFaq` (faq.tsx) ET balisée en FAQPage sur l'accueil :
 * une seule source, donc balisage = contenu visible.
 *
 * Aucun tarif, horaire ni règle de déplacement n'est écrit en dur : tout est
 * lu dans `content.ts` (barème de Tom), source unique.
 */

import { INTERIEUR_FORMULAS, TEXTILE_ITEMS, TRAVEL, travelFee, type Formula } from "./content"

export type FaqEntry = { q: string; a: string }

function formula(key: string): Formula {
  const f = INTERIEUR_FORMULAS.find((x) => x.key === key)
  if (!f) throw new Error(`[cleanyzer] formule intérieure inconnue : ${key}`)
  return f
}

function textile(key: string): string {
  const t = TEXTILE_ITEMS.find((x) => x.key === key)
  if (!t) throw new Error(`[cleanyzer] article textile inconnu : ${key}`)
  return t.priceLabel
}

const ECO = formula("eco")
const PREMIUM = formula("premium")
const EXCELLENCE = formula("excellence")
const EXAMPLE_EXTRA_KM = 5

// Réponses directes (utile SEO/GEO, cahier §19) — chaque chiffre vient de content.ts.
export const CLZ_FAQ: FaqEntry[] = [
  {
    q: "Combien coûte un nettoyage intérieur de voiture à Annecy ?",
    a: `La formule Éco démarre à ${ECO.prices.citadine} € pour une citadine (${ECO.prices.berline} € berline, ${ECO.prices.suv} € SUV). La formule Premium débute à ${PREMIUM.prices.citadine} € et l'Excellence à ${EXCELLENCE.prices.citadine} €. La formule Diamond est entièrement sur mesure.`,
  },
  {
    q: "Intervenez-vous vraiment à domicile ?",
    a: `Oui. CLEANYZER se déplace chez vous à Annecy et alentours, du ${TRAVEL.daysLabel.toLowerCase()}, de ${TRAVEL.hoursLabel}.`,
  },
  {
    q: "Quelle zone est couverte et y a-t-il des frais de déplacement ?",
    a: `${TRAVEL.includedKmOneWay} km à l'aller depuis Choisy, près d'Annecy, sont inclus (soit ${TRAVEL.includedKmRoundTrip} km aller-retour). Au-delà, le déplacement est facturé ${TRAVEL.pricePerExtraKm} € par kilomètre supplémentaire parcouru. Par exemple, ${EXAMPLE_EXTRA_KM} km de plus à l'aller représentent ${travelFee(TRAVEL.includedKmOneWay + EXAMPLE_EXTRA_KM)} € aller-retour.`,
  },
  {
    q: "Proposez-vous le nettoyage de canapé et de textile ?",
    a: `Oui. Le nettoyage textile comprend aspiration complète, shampoing, désinfection et traitement des odeurs. Un canapé 2/3 places est à ${textile("canape-2-3")}, un canapé 3/4 places à ${textile("canape-3-4")}, et un canapé 5 places et plus ${textile("canape-5")}. Le textile passe par une demande personnalisée.`,
  },
  {
    q: "Comment se passe la réservation d'un nettoyage auto ?",
    a: "Un parcours guidé en quelques étapes : intérieur ou extérieur, type de véhicule, formule, options, adresse, puis date et créneau. Le total se met à jour en direct et le récapitulatif reprend tout avant validation.",
  },
  {
    q: "Qu'est-ce que la formule Diamond ?",
    a: "C'est une prestation entièrement personnalisée selon le véhicule, son état et vos besoins. Son tarif est établi sur mesure : aucune estimation automatique, une demande adaptée est créée.",
  },
]
