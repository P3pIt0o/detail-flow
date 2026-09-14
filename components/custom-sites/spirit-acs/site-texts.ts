/**
 * ============================================================================
 *  TEXTES ÉDITORIAUX ADMINISTRABLES — SPIRIT ACS UNIQUEMENT (module PUR)
 * ============================================================================
 *
 *  Module TypeScript PUR : aucun accès base de données, aucun import React,
 *  aucune dépendance serveur. Il définit, pour le seul tenant « spirit-acs » :
 *
 *   - la LISTE BLANCHE exacte des textes modifiables (id stable → emplacement
 *     de stockage + longueur maximale) ;
 *   - les FALLBACKS EXACTS (repris des sources réelles : `SPIRIT_SERVICES`,
 *     `SPIRIT_ZONE_TEXT`, et les constantes ci-dessous consommées AUSSI par les
 *     composants — jamais de texte dupliqué) ;
 *   - un RÉSOLVEUR PUR override → fallback, champ par champ, défensif ;
 *   - le SCHÉMA du formulaire d'administration (présentation).
 *
 *  PRINCIPE : un override valide (chaîne non vide) est affiché ; sinon le texte
 *  du code est utilisé À L'IDENTIQUE. Une valeur absente / vide / d'un mauvais
 *  type retombe TOUJOURS sur le fallback sans planter. La base ne contient que
 *  les valeurs réellement personnalisées (aucun seed des défauts).
 *
 *  Isolation : ces textes vivent sous `companies.siteContent.spiritAcs` (et,
 *  pour les champs déjà existants, à leur emplacement historique). Aucune
 *  migration, aucune nouvelle table/colonne.
 * ============================================================================
 */

import { SPIRIT_SERVICES, SPIRIT_ZONE_TEXT } from "./seo-content"

/** Clé technique du seul tenant concerné. */
export const SPIRIT_SITE_TEXTS_KEY = "spirit-acs"

/* -------------------------------------------------------------------------- */
/*  FALLBACKS PARTAGÉS (source unique consommée par les composants)           */
/* -------------------------------------------------------------------------- */

/** Sous-titre du hero — repli EXACT de `SpiritHero` (DEFAULTS.subtitle). */
export const SPIRIT_HERO_SUBTITLE_FALLBACK =
  "Nettoyage, polissage et protection, réalisés avec exigence."

/** Paragraphe d'introduction de « Nos prestations » — repli EXACT du composant. */
export const SPIRIT_SERVICES_INTRO_FALLBACK =
  "Spirit ACS propose à Lagny-sur-Marne et aux alentours des prestations de detailing automobile, nettoyage intérieur et extérieur, nettoyage textile, polissage, protection céramique, PPF, personnalisation, rénovation et entretien esthétique. Certaines prestations peuvent également être réalisées directement à votre domicile. Découvrez chaque service et trouvez la solution adaptée à votre véhicule ou à vos textiles."

/** Trois paragraphes « Qui sommes-nous ? » — repli EXACT (ex-`PARAGRAPHS`). */
export const SPIRIT_ABOUT_FALLBACKS = [
  "Spirit ACS est dirigé par Corentin Gisclon, passionné par l’entretien esthétique et la mise en valeur des véhicules.",
  "À Lagny-sur-Marne, il accompagne particuliers et professionnels pour leurs besoins en nettoyage automobile, polissage, protection céramique, PPF et detailing moto.",
  "Chaque véhicule est étudié avec attention afin de proposer une prestation adaptée à son état, à son usage et au résultat recherché. L’objectif est de réaliser un travail soigné, d’apporter des conseils clairs et de restituer un véhicule soigneusement mis en valeur.",
] as const

/** Zone d'intervention — repli EXACT (source unique : `SPIRIT_ZONE_TEXT`). */
export const SPIRIT_ZONE_TEXT_FALLBACK = SPIRIT_ZONE_TEXT

/** Flotte / professionnels — replis EXACTS (texte brut, sans typographie riche). */
export const SPIRIT_FLEET_HEADING_FALLBACK = "Vous gérez une flotte de véhicules ?"
export const SPIRIT_FLEET_TEXT_FALLBACK =
  "Entretien récurrent, remise en état avant restitution, préparation esthétique : décrivez votre besoin, nous vous répondons avec une proposition adaptée au nombre de véhicules."

/** Galerie photo — titre principal, repli EXACT du composant. */
export const SPIRIT_PHOTO_GALLERY_TITLE_FALLBACK = "Nos derniers passages à l'atelier"

/** Page /contact — replis EXACTS de l'en-tête. */
export const SPIRIT_CONTACT_HEADING_FALLBACK = "Parlons de votre véhicule"
export const SPIRIT_CONTACT_INTRO_FALLBACK =
  "Une question, une demande de devis ou une réservation ? Nous vous répondons rapidement."

/* -------------------------------------------------------------------------- */
/*  SLUGS AUTORISÉS (dérivés de la source de vérité `SPIRIT_SERVICES`)         */
/* -------------------------------------------------------------------------- */

/** Slugs des 7 pages de prestations réelles. */
export const SPIRIT_SERVICE_SLUGS: readonly string[] = SPIRIT_SERVICES.map((s) => s.slug)

/**
 * Slugs des 6 cartes commerciales de l'accueil : toutes les prestations SAUF
 * « protection-ceramique » (non autonome sur l'accueil, cf. `home-page`).
 */
export const SPIRIT_CARD_SLUGS: readonly string[] = SPIRIT_SERVICES.map((s) => s.slug).filter(
  (slug) => slug !== "protection-ceramique",
)

/** Accroche par défaut d'une carte (source unique : `SPIRIT_SERVICES.cardTagline`). */
export function spiritCardTaglineFallback(slug: string): string {
  return SPIRIT_SERVICES.find((s) => s.slug === slug)?.cardTagline ?? ""
}

/** Paragraphes d'introduction par défaut d'une page prestation (source unique). */
export function spiritServiceIntroFallback(slug: string): readonly string[] {
  return SPIRIT_SERVICES.find((s) => s.slug === slug)?.intro ?? []
}

/* -------------------------------------------------------------------------- */
/*  LISTE BLANCHE D'ÉCRITURE (SÉCURITÉ) — id → emplacement + longueur max      */
/* -------------------------------------------------------------------------- */

/**
 * Emplacement de stockage d'un champ :
 *  - `column` : colonne dédiée de `companies` (uniquement `heroSubtitle`) ;
 *  - `json`   : chemin imbriqué DANS `companies.siteContent` (jsonb).
 */
export type SpiritWriteLocation =
  | { kind: "column"; column: "heroSubtitle" }
  | { kind: "json"; path: string[] }

export type SpiritFieldSpec = {
  /** Longueur maximale acceptée (refus au-delà, jamais de troncature). */
  max: number
  /** Où écrire la valeur (jamais dérivé d'une entrée client). */
  location: SpiritWriteLocation
}

/**
 * LISTE BLANCHE EXACTE. Toute clé absente d'ici est rejetée par l'action
 * serveur. Les entrées par slug sont générées depuis `SPIRIT_SERVICES` : un
 * slug inconnu ou un paragraphe surnuméraire n'existe donc pas dans la table et
 * est automatiquement refusé.
 */
export const SPIRIT_TEXT_FIELDS: Record<string, SpiritFieldSpec> = (() => {
  const fields: Record<string, SpiritFieldSpec> = {
    // A — Hero (texte secondaire uniquement).
    heroSubtitle: { max: 400, location: { kind: "column", column: "heroSubtitle" } },
    // B — Introduction « Nos prestations ».
    servicesIntro: { max: 800, location: { kind: "json", path: ["spiritAcs", "home", "servicesIntro"] } },
    // D — Présentation (3 paragraphes).
    "about:1": { max: 800, location: { kind: "json", path: ["spiritAcs", "home", "about", "paragraph1"] } },
    "about:2": { max: 800, location: { kind: "json", path: ["spiritAcs", "home", "about", "paragraph2"] } },
    "about:3": { max: 800, location: { kind: "json", path: ["spiritAcs", "home", "about", "paragraph3"] } },
    // E — Zone d'intervention.
    zoneText: { max: 600, location: { kind: "json", path: ["spiritAcs", "home", "zoneText"] } },
    // F — Flotte / professionnels.
    fleetHeading: { max: 120, location: { kind: "json", path: ["spiritAcs", "home", "fleetHeading"] } },
    fleetText: { max: 600, location: { kind: "json", path: ["spiritAcs", "home", "fleetText"] } },
    // H — Galerie photo (titre).
    photoGalleryTitle: { max: 100, location: { kind: "json", path: ["spiritAcs", "home", "photoGalleryTitle"] } },
    // L — Page contact.
    contactHeading: { max: 120, location: { kind: "json", path: ["spiritAcs", "contact", "heading"] } },
    contactIntro: { max: 400, location: { kind: "json", path: ["spiritAcs", "contact", "intro"] } },
    // G / I / J / M — champs réutilisant leur emplacement historique.
    galleryTitle: { max: 100, location: { kind: "json", path: ["gallery", "title"] } },
    galleryIntro: { max: 400, location: { kind: "json", path: ["gallery", "intro"] } },
    reviewsTitle: { max: 100, location: { kind: "json", path: ["reviews", "title"] } },
    reviewsIntro: { max: 400, location: { kind: "json", path: ["reviews", "intro"] } },
    footerTagline: { max: 100, location: { kind: "json", path: ["footer", "tagline"] } },
    customRequestsTitle: { max: 120, location: { kind: "json", path: ["customRequests", "title"] } },
    customRequestsDescription: { max: 400, location: { kind: "json", path: ["customRequests", "description"] } },
  }

  // C — Accroches des 6 cartes (générées depuis la source de vérité).
  for (const slug of SPIRIT_CARD_SLUGS) {
    fields[`cardTagline:${slug}`] = {
      max: 180,
      location: { kind: "json", path: ["spiritAcs", "home", "serviceCardTaglines", slug] },
    }
  }

  // K — Paragraphes d'introduction des 7 pages prestations (nombre EXACT dérivé
  // de `SPIRIT_SERVICES` : un 3e paragraphe n'existe que là où il existe déjà).
  for (const slug of SPIRIT_SERVICE_SLUGS) {
    const count = spiritServiceIntroFallback(slug).length
    for (let i = 1; i <= count; i++) {
      fields[`service:${slug}:${i}`] = {
        max: 800,
        location: { kind: "json", path: ["spiritAcs", "services", slug, "intro", `paragraph${i}`] },
      }
    }
  }

  return fields
})()

/** Fallbacks STATIQUES (champs sous `spiritAcs` + hero). Les champs réutilisés
 *  (galerie/avis/footer/demandes) ont un fallback résolu côté serveur via leurs
 *  résolveurs existants. */
export const SPIRIT_STATIC_FALLBACKS: Record<string, string> = (() => {
  const map: Record<string, string> = {
    heroSubtitle: SPIRIT_HERO_SUBTITLE_FALLBACK,
    servicesIntro: SPIRIT_SERVICES_INTRO_FALLBACK,
    "about:1": SPIRIT_ABOUT_FALLBACKS[0],
    "about:2": SPIRIT_ABOUT_FALLBACKS[1],
    "about:3": SPIRIT_ABOUT_FALLBACKS[2],
    zoneText: SPIRIT_ZONE_TEXT_FALLBACK,
    fleetHeading: SPIRIT_FLEET_HEADING_FALLBACK,
    fleetText: SPIRIT_FLEET_TEXT_FALLBACK,
    photoGalleryTitle: SPIRIT_PHOTO_GALLERY_TITLE_FALLBACK,
    contactHeading: SPIRIT_CONTACT_HEADING_FALLBACK,
    contactIntro: SPIRIT_CONTACT_INTRO_FALLBACK,
  }
  for (const slug of SPIRIT_CARD_SLUGS) map[`cardTagline:${slug}`] = spiritCardTaglineFallback(slug)
  for (const slug of SPIRIT_SERVICE_SLUGS) {
    const intro = spiritServiceIntroFallback(slug)
    intro.forEach((p, i) => {
      map[`service:${slug}:${i + 1}`] = p
    })
  }
  return map
})()

/* -------------------------------------------------------------------------- */
/*  LECTURE DÉFENSIVE + RÉSOLVEUR PUR                                          */
/* -------------------------------------------------------------------------- */

/** Chaîne d'override VALIDE (non vide après trim) à un chemin, sinon undefined. */
export function readStringAtPath(root: unknown, path: string[]): string | undefined {
  let node: unknown = root
  for (const key of path) {
    if (node == null || typeof node !== "object") return undefined
    node = (node as Record<string, unknown>)[key]
  }
  if (typeof node !== "string") return undefined
  const trimmed = node.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Override effectif d'un champ (colonne ou json) depuis les données brutes. */
export function readSpiritOverride(
  fieldId: string,
  siteContent: unknown,
  heroSubtitle: string | null | undefined,
): string | undefined {
  const spec = SPIRIT_TEXT_FIELDS[fieldId]
  if (!spec) return undefined
  if (spec.location.kind === "column") {
    const v = (heroSubtitle ?? "").trim()
    return v.length > 0 ? v : undefined
  }
  return readStringAtPath(siteContent, spec.location.path)
}

/** Texte effectif visible sur le site pour les champs à fallback STATIQUE. */
export type SpiritEffectiveTexts = {
  servicesIntro: string
  /** slug → accroche effective (les 6 slugs de carte présents). */
  cardTaglines: Record<string, string>
  about: [string, string, string]
  zoneText: string
  /** Override seul (null = le composant garde son rendu par défaut À L'IDENTIQUE). */
  fleetHeading: string | null
  fleetText: string | null
  photoGalleryTitle: string
  /** slug → paragraphes d'introduction effectifs (les 7 slugs présents). */
  serviceIntros: Record<string, string[]>
  contactHeading: string
  contactIntro: string
}

/**
 * Résout les textes Spirit effectifs à partir du SEUL sous-arbre
 * `companies.siteContent.spiritAcs` (brut). Fonction pure et défensive : toute
 * valeur absente/invalide retombe sur le fallback. `heroSubtitle` (colonne
 * dédiée) reste géré par le flux hero existant et n'est donc pas inclus ici.
 */
export function resolveSpiritEffectiveTexts(spiritAcsRaw: unknown): SpiritEffectiveTexts {
  // On reconstruit un `siteContent`-like minimal pour réutiliser readStringAtPath.
  const root = { spiritAcs: spiritAcsRaw }

  const cardTaglines: Record<string, string> = {}
  for (const slug of SPIRIT_CARD_SLUGS) {
    cardTaglines[slug] =
      readStringAtPath(root, ["spiritAcs", "home", "serviceCardTaglines", slug]) ??
      spiritCardTaglineFallback(slug)
  }

  const serviceIntros: Record<string, string[]> = {}
  for (const slug of SPIRIT_SERVICE_SLUGS) {
    const fallback = spiritServiceIntroFallback(slug)
    serviceIntros[slug] = fallback.map(
      (p, i) => readStringAtPath(root, ["spiritAcs", "services", slug, "intro", `paragraph${i + 1}`]) ?? p,
    )
  }

  return {
    servicesIntro: readStringAtPath(root, ["spiritAcs", "home", "servicesIntro"]) ?? SPIRIT_SERVICES_INTRO_FALLBACK,
    cardTaglines,
    about: [
      readStringAtPath(root, ["spiritAcs", "home", "about", "paragraph1"]) ?? SPIRIT_ABOUT_FALLBACKS[0],
      readStringAtPath(root, ["spiritAcs", "home", "about", "paragraph2"]) ?? SPIRIT_ABOUT_FALLBACKS[1],
      readStringAtPath(root, ["spiritAcs", "home", "about", "paragraph3"]) ?? SPIRIT_ABOUT_FALLBACKS[2],
    ],
    zoneText: readStringAtPath(root, ["spiritAcs", "home", "zoneText"]) ?? SPIRIT_ZONE_TEXT_FALLBACK,
    fleetHeading: readStringAtPath(root, ["spiritAcs", "home", "fleetHeading"]) ?? null,
    fleetText: readStringAtPath(root, ["spiritAcs", "home", "fleetText"]) ?? null,
    photoGalleryTitle:
      readStringAtPath(root, ["spiritAcs", "home", "photoGalleryTitle"]) ?? SPIRIT_PHOTO_GALLERY_TITLE_FALLBACK,
    serviceIntros,
    contactHeading: readStringAtPath(root, ["spiritAcs", "contact", "heading"]) ?? SPIRIT_CONTACT_HEADING_FALLBACK,
    contactIntro: readStringAtPath(root, ["spiritAcs", "contact", "intro"]) ?? SPIRIT_CONTACT_INTRO_FALLBACK,
  }
}

/* -------------------------------------------------------------------------- */
/*  SCHÉMA DU FORMULAIRE D'ADMINISTRATION (présentation)                       */
/* -------------------------------------------------------------------------- */

export type SpiritTextFieldDef = {
  /** Id stable — DOIT exister dans `SPIRIT_TEXT_FIELDS`. */
  id: string
  label: string
  /** Où le texte apparaît sur le site (aide contextuelle). */
  help: string
  /** Zone de texte multi-lignes si vrai, champ simple sinon. */
  multiline: boolean
}

export type SpiritTextGroup = { title: string; fields: SpiritTextFieldDef[] }
export type SpiritTextSection = { id: string; title: string; groups: SpiritTextGroup[] }

/** Titre lisible d'une prestation (pour les libellés du formulaire). */
function serviceTitle(slug: string): string {
  return SPIRIT_SERVICES.find((s) => s.slug === slug)?.cardTitle ?? slug
}

/** Sections du formulaire « Textes du site » (ordre et regroupement §10). */
export const SPIRIT_TEXT_FORM_SECTIONS: SpiritTextSection[] = [
  {
    id: "accueil",
    title: "Accueil",
    groups: [
      {
        title: "Hero & introduction",
        fields: [
          { id: "heroSubtitle", label: "Texte secondaire du hero", help: "Sous le titre principal, en haut de l'accueil.", multiline: true },
          { id: "servicesIntro", label: "Introduction « Nos prestations »", help: "Paragraphe sous « Choisissez, puis demandez votre devis ».", multiline: true },
        ],
      },
      {
        title: "Accroches des cartes de prestations",
        fields: SPIRIT_CARD_SLUGS.map((slug) => ({
          id: `cardTagline:${slug}`,
          label: `Accroche — ${serviceTitle(slug)}`,
          help: "Texte court sous le titre de la carte, sur l'accueil.",
          multiline: false,
        })),
      },
    ],
  },
  {
    id: "presentation",
    title: "Présentation",
    groups: [
      {
        title: "Qui sommes-nous ?",
        fields: [
          { id: "about:1", label: "Paragraphe 1", help: "Section « Qui sommes-nous ? » de l'accueil.", multiline: true },
          { id: "about:2", label: "Paragraphe 2", help: "Section « Qui sommes-nous ? » de l'accueil.", multiline: true },
          { id: "about:3", label: "Paragraphe 3", help: "Section « Qui sommes-nous ? » de l'accueil.", multiline: true },
        ],
      },
      {
        title: "Zone d'intervention",
        fields: [
          { id: "zoneText", label: "Texte de la zone d'intervention", help: "Section « Zone d'intervention » de l'accueil.", multiline: true },
        ],
      },
      {
        title: "Professionnels & flottes",
        fields: [
          { id: "fleetHeading", label: "Titre", help: "Bandeau « flotte » de l'accueil.", multiline: false },
          { id: "fleetText", label: "Paragraphe", help: "Bandeau « flotte » de l'accueil.", multiline: true },
        ],
      },
    ],
  },
  {
    id: "prestations",
    title: "Pages de prestations",
    groups: SPIRIT_SERVICE_SLUGS.map((slug) => ({
      title: serviceTitle(slug),
      fields: spiritServiceIntroFallback(slug).map((_, i) => ({
        id: `service:${slug}:${i + 1}`,
        label: `Paragraphe ${i + 1}`,
        help: `Introduction de la page /prestations/${slug}.`,
        multiline: true,
      })),
    })),
  },
  {
    id: "realisations-avis",
    title: "Réalisations et avis",
    groups: [
      {
        title: "Galerie Avant / Après",
        fields: [
          { id: "galleryTitle", label: "Titre", help: "Section « Réalisations » (comparateur Avant/Après).", multiline: false },
          { id: "galleryIntro", label: "Introduction", help: "Section « Réalisations » (comparateur Avant/Après).", multiline: true },
        ],
      },
      {
        title: "Galerie photo",
        fields: [
          { id: "photoGalleryTitle", label: "Titre", help: "Section « Nos derniers passages à l'atelier ».", multiline: false },
        ],
      },
      {
        title: "Avis",
        fields: [
          { id: "reviewsTitle", label: "Titre", help: "Section des avis clients.", multiline: false },
          { id: "reviewsIntro", label: "Introduction", help: "Section des avis clients.", multiline: true },
        ],
      },
    ],
  },
  {
    id: "demande-devis",
    title: "Demande de devis",
    groups: [
      {
        title: "Bloc de demande",
        fields: [
          { id: "customRequestsTitle", label: "Titre", help: "Bloc « Demande de devis » de l'accueil.", multiline: false },
          { id: "customRequestsDescription", label: "Description", help: "Bloc « Demande de devis » de l'accueil.", multiline: true },
        ],
      },
    ],
  },
  {
    id: "contact-footer",
    title: "Contact et pied de page",
    groups: [
      {
        title: "Page contact",
        fields: [
          { id: "contactHeading", label: "Titre", help: "En-tête de la page /contact.", multiline: false },
          { id: "contactIntro", label: "Introduction", help: "En-tête de la page /contact.", multiline: true },
        ],
      },
      {
        title: "Pied de page",
        fields: [
          { id: "footerTagline", label: "Slogan", help: "Slogan affiché dans le pied de page.", multiline: false },
        ],
      },
    ],
  },
]

/** Valeur + méta d'un champ, transmises à l'admin (pré-remplissage + badge). */
export type SpiritTextFieldValue = {
  /** Valeur effective affichée sur le site (override ou fallback). */
  value: string
  /** Vrai si un override est enregistré (badge « Texte personnalisé »). */
  custom: boolean
  /** Longueur maximale (attribut maxLength + compteur). */
  max: number
}
