/**
 * Contenu narratif de l'étape "partners". Enveloppe la logique partagée
 * `BetaPartners` (réutilisée aussi par le rendu statique) sans en dupliquer
 * la logique anti-invention de données.
 */

import { BetaPartners } from "./beta-partners"

export function ScenePartners() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <BetaPartners />
    </div>
  )
}
