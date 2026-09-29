/**
 * MODE MAINTENANCE — VITRINE MARKETING DETAILFLOW (domaine racine uniquement)
 * ============================================================================
 *
 * PÉRIMÈTRE STRICT : ce drapeau ne concerne QUE la page vitrine principale de
 * DetailFlow, servie sous `app/marketing/*` (detailflow.fr / www, ou l'aperçu
 * sans `?tenant=`). Il n'a AUCUN effet sur :
 *   - les sites des tenants (groupe `(site)`, `/p/<slug>`, sous-domaines) ;
 *   - les pages `?tenant=` ;
 *   - les espaces d'administration (`/admin`, `/super-admin`) ;
 *   - les réservations, paiements, API, webhooks, authentification ;
 *   - les domaines personnalisés des clients.
 * Le middleware ne réécrit vers `/marketing` que pour le domaine racine ; ces
 * routes ne passent donc jamais par l'écran de maintenance.
 *
 * TEMPORAIRE & NON DESTRUCTIF : aucun contenu marketing n'est supprimé du code.
 * La landing complète reste en place dans `app/marketing/page.tsx` ; elle est
 * simplement court-circuitée tant que ce drapeau est actif.
 *
 * RÉTABLISSEMENT : passer `FLAG` à `false` (ou définir la variable
 * d'environnement `MARKETING_MAINTENANCE=false`) restaure instantanément la
 * vitrine, sans autre modification.
 */

// ← Passer à `false` pour rétablir la vitrine marketing.
const FLAG = true

/**
 * Vrai si la vitrine marketing doit afficher l'écran de maintenance.
 *
 * En développement (aperçu v0 / local), la maintenance est ignorée afin de
 * pouvoir relire la nouvelle landing. Les déploiements (preview + production)
 * restent gouvernés par `FLAG` / `MARKETING_MAINTENANCE`.
 */
export const MARKETING_MAINTENANCE_ENABLED: boolean =
  process.env.NODE_ENV === "development"
    ? false
    : process.env.MARKETING_MAINTENANCE === "false"
      ? false
      : FLAG
