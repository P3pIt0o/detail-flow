/**
 * ============================================================================
 *  COUCHE PUBLIQUE COMMUNE — TYPES (source de vérité des surfaces publiques)
 * ============================================================================
 *
 *  Cette couche est l'ABSTRACTION partagée qui décrira, à terme, les surfaces
 *  publiques de N'IMPORTE QUEL tenant DetailFlow :
 *    navigation · accueil (cartes) · pages SEO · maillage interne · sitemap ·
 *    configurateur · mode de conversion.
 *
 *  Elle ne contient QUE des types (aucune dépendance DB / serveur / next-font)
 *  et peut donc être importée partout (sitemap, route [service], composants).
 *
 *  SÉPARATION CONCEPTUELLE VOLONTAIRE (cf. cahier des charges) :
 *    - PRESTATION MÉTIER  → vit dans DetailFlow (services / prix / durée /
 *      options / disponibilité). Cette couche N'en est PAS une copie : elle y
 *      RÉFÉRENCE via `serviceRef` (à câbler plus tard pour les tenants
 *      standards). Rien n'est recalculé ici.
 *    - PAGE PUBLIQUE / SEO → ce qui est décrit ici (publiée ? slug, title, H1,
 *      contenu, présence en navigation, carte d'accueil…).
 *    - MODE DE CONVERSION → propriété PAR PAGE (`conversionMode`), résolue vers
 *      un moteur EXISTANT par `lib/public-site/conversion.ts`. Jamais couplée
 *      en dur à un formulaire.
 *
 *  IMPORTANT : « prestation visible » (métier) ≠ « page SEO publiée ». Un tenant
 *  peut exposer une prestation sans landing dédiée, et inversement. Les deux
 *  notions restent distinctes dans ce modèle.
 * ============================================================================
 */

/**
 * Modes de conversion d'une page/prestation. Ce sont des CONCEPTS d'architecture
 * (union TypeScript) et NON des valeurs écrites en base : aucune migration n'est
 * introduite par ce type. Ils s'appuient sur des moteurs DÉJÀ présents dans le
 * dépôt (cf. `lib/public-site/conversion.ts`) :
 *   - `quote_request`  → moteur « demandes personnalisées » (custom_requests).
 *                        Parcours Spirit ACS par défaut.
 *   - `booking`        → moteur de réservation existant, sans paiement.
 *   - `booking_deposit`→ moteur de réservation existant + acompte Stripe.
 *   - `booking_full`   → moteur de réservation existant + paiement intégral.
 *
 *  Spirit ACS n'utilise aujourd'hui que `quote_request`. Les autres modes sont
 *  déclarés pour que la future V2 des sites standards puisse les résoudre SANS
 *  reconstruire cette couche.
 */
export type ConversionMode = "quote_request" | "booking" | "booking_deposit" | "booking_full"

/**
 * Référence FAIBLE vers la prestation métier DetailFlow. Volontairement laxe
 * pour cette phase : Spirit ACS pilote son contenu par slug éditorial et n'a
 * pas besoin d'un identifiant `services.id`. Pour les tenants standards (futur),
 * `serviceId` permettra de consommer prix/durée/options/disponibilité côté
 * moteur existant, sans jamais les dupliquer ici.
 */
export interface PublicServiceRef {
  /** Identifiant de la prestation métier (tenants standards, futur). */
  serviceId?: number | null
  /** Repère éditorial local (ex. slug Spirit), quand aucun `serviceId`. */
  editorialKey?: string | null
}

/** Page SEO dédiée à une prestation, décrite pour toutes les surfaces publiques. */
export interface PublicServicePage {
  /** Segment d'URL sous /prestations (ex. « protection-ceramique »). */
  slug: string
  /** Page indexable et rendue publiquement ? (≠ prestation métier visible). */
  published: boolean
  /** Apparaît dans la navigation du site ? */
  inNavigation: boolean
  /** Libellé court utilisé en navigation / fil d'Ariane. */
  navLabel: string

  /* --- Carte d'accueil (maillage interne depuis la home) --- */
  cardTitle: string
  /** Accroche brève sous le titre de la carte (repli : `cardTitle`). */
  cardTagline?: string | null
  cardText: string
  image: string | null
  imageAlt: string | null

  /* --- SEO --- */
  metaTitle: string
  metaDescription: string
  h1: string
  breadcrumbLabel: string

  /* --- Conversion (par page) --- */
  conversionMode: ConversionMode
  /** Référence métier optionnelle (voir `PublicServiceRef`). */
  serviceRef?: PublicServiceRef

  /* --- Sitemap --- */
  sitemapPriority: number
}

/** Page statique publique non-prestation (accueil, avis, contact…). */
export interface PublicStaticPage {
  /** Chemin relatif tenant-aware (ex. « / », « /avis »). */
  path: string
  sitemapPriority: number
}

/**
 * CATALOGUE PUBLIC d'un tenant : la SEULE source de vérité des surfaces
 * publiques. Toutes les surfaces (nav, accueil, [service], sitemap, maillage,
 * configurateur) doivent le consommer via les sélecteurs de `provider.ts`
 * plutôt que de maintenir leurs propres listes.
 */
export interface PublicSiteCatalog {
  /** Slug du tenant propriétaire de ce catalogue. */
  tenantSlug: string
  /** Pages statiques publiques (hors prestations). */
  staticPages: PublicStaticPage[]
  /** Pages SEO de prestations. */
  servicePages: PublicServicePage[]
}
