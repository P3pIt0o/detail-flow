import { sql } from "drizzle-orm"
import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  numeric,
  date,
  jsonb,
  unique,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core"

/* -------------------------------------------------------------------------- */
/*  Better Auth (comptes professionnels + espace client)                      */
/*  Colonnes en camelCase pour coller aux défauts de Better Auth. Ne pas      */
/*  renommer.                                                                  */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  // Super-administrateur de la plateforme DetailFlow (gère les entreprises).
  // Distinct de l'appartenance à une entreprise (company_members).
  superAdmin: boolean("superAdmin").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

/* -------------------------------------------------------------------------- */
/*  Multi-tenant : entreprises (tenants), membres et prospects beta           */
/* -------------------------------------------------------------------------- */

/**
 * Une entreprise de detailing = un tenant. Chaque entité métier porte un
 * `companyId` qui référence cette table. Le branding est prévu dès maintenant
 * (même partiellement utilisé) pour éviter une future migration.
 */
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Slug unique servant de sous-domaine : {slug}.detailflow.fr
  slug: text("slug").notNull().unique(),
  // BETA | ACTIVE | SUSPENDED | ARCHIVED
  status: text("status").notNull().default("BETA"),
  // Programme Beta Tester (accès complet, mention 30 jours dans les CGV).
  betaStartedAt: timestamp("betaStartedAt"),
  betaEndsAt: timestamp("betaEndsAt"),
  // Identité visuelle (future-proof)
  // logoUrl stocke le PATHNAME du logo dans le Blob privé (servi publiquement
  // via /api/company-logo?company={slug}), pas une URL directe.
  logoUrl: text("logoUrl"),
  faviconUrl: text("faviconUrl"),
  // Conditions Générales de Vente propres à l'entreprise (texte long, affiché
  // sur la page publique /cgv du tenant).
  cgv: text("cgv"),
  brandPrimary: text("brandPrimary"),
  brandSecondary: text("brandSecondary"),
  websiteUrl: text("websiteUrl"),
  socialLinks: jsonb("socialLinks"),
  // Contenu éditable des sections du site public (par entreprise), structure
  // générique typée (voir lib/site-content.ts). Null / champs absents = repli
  // sur les valeurs par défaut neutres. Évite une colonne par texte de section.
  siteContent: jsonb("siteContent"),
  // Contenu éditable du Hero de la vitrine (par entreprise). Null = fallback
  // neutre affiché par le composant Hero (aucun texte commercial en dur en base).
  heroTitle: text("heroTitle"),
  heroHighlight: text("heroHighlight"),
  heroSubtitle: text("heroSubtitle"),
  heroCtaPrimary: text("heroCtaPrimary"),
  heroCtaSecondary: text("heroCtaSecondary"),
  // Coordonnées
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postalCode"),
  country: text("country").notNull().default("FR"),
  // Locale
  timezone: text("timezone").notNull().default("Europe/Paris"),
  currency: text("currency").notNull().default("EUR"),
  locale: text("locale").notNull().default("fr"),
  // Comportement : DISABLED | DEMO | LIVE
  bookingMode: text("bookingMode").notNull().default("LIVE"),
  // Empêche l'indexation par les moteurs (démos)
  noindex: boolean("noindex").notNull().default(false),
  // Clé technique d'un site public ENTIÈREMENT personnalisé (ex. "spirit-acs").
  // NULL = site standard DetailFlow (comportement historique inchangé). Validée
  // UNIQUEMENT côté serveur contre le registre (lib/custom-sites). Une clé
  // inconnue ne casse jamais la prod : repli automatique sur le site standard.
  // Jamais attribuée automatiquement : réservée à une action super-admin.
  customSiteKey: text("customSiteKey"),
  /* -------------------------- Paiements en ligne --------------------------- */
  // Fournisseur de paiement du tenant (générique, extensible : "stripe" | "sumup"…).
  // Null = aucun provider connecté. Seul Stripe est implémenté en V1.
  paymentProvider: text("paymentProvider"),
  // Identifiant du compte connecté chez le provider (ex. Stripe `acct_...`).
  // Résolu UNIQUEMENT côté serveur : jamais un tenant ne peut utiliser le compte
  // d'un autre. Null tant que l'onboarding n'est pas fait.
  stripeAccountId: text("stripeAccountId"),
  // État de l'onboarding du compte connecté (miroir des flags Stripe).
  stripeChargesEnabled: boolean("stripeChargesEnabled").notNull().default(false),
  stripeDetailsSubmitted: boolean("stripeDetailsSubmitted").notNull().default(false),
  stripePayoutsEnabled: boolean("stripePayoutsEnabled").notNull().default(false),
  // Interrupteur d'activation des paiements en ligne (désactivé par défaut).
  // Désactiver n'efface rien : empêche seulement de NOUVEAUX paiements.
  paymentsEnabled: boolean("paymentsEnabled").notNull().default(false),
  // Mode de paiement demandé au client : "none" | "deposit" | "full".
  // Pour "deposit", le montant réutilise settings.depositType/depositValue.
  paymentMode: text("paymentMode").notNull().default("none"),
  // Override facultatif de la commission plateforme, en points de base (bps :
  // 300 = 3,00 %). Null = utiliser la commission globale (platform_settings).
  platformFeeBps: integer("platformFeeBps"),
  /* --------------------------- Licence commerciale ------------------------- */
  // Licence DetailFlow (moteur d'entitlements). DISTINCT de `status`
  // (BETA/ACTIVE/SUSPENDED/ARCHIVED), qui reste le cycle de vie opérationnel.
  // NULL = tenant historique en accès LEGACY : le resolver conserve son
  // comportement actuel (aucune coupure). Voir lib/licensing.
  // Valeurs : FREE | ESSENTIAL | PRO | BUSINESS | FOUNDER.
  licensePlan: text("licensePlan"),
  // Génération de droits figée à l'attribution. Valeur : LIFETIME_V1
  // (extensible plus tard à SUBSCRIPTION_V2, non implémenté).
  licenseGeneration: text("licenseGeneration"),
  // Traçabilité de l'attribution de la licence (super-admin uniquement).
  licenseAssignedAt: timestamp("licenseAssignedAt"),
  licenseAssignedByUserId: text("licenseAssignedByUserId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/**
 * Overrides de fonctionnalit����s par entreprise (gestes commerciaux, modules
 * achetés/offerts, essais temporaires, pilotes Founder…).
 *
 * Le moteur (lib/licensing) applique : droit du plan → override éventuel →
 * expiration éventuelle → droit effectif. Une seule ligne par
 * (companyId, featureKey) grâce à la contrainte unique. On ne stocke JAMAIS
 * l'état INHERIT : « revenir à INHERIT » supprime simplement la ligne.
 */
export const companyFeatureOverrides = pgTable(
  "company_feature_overrides",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Clé du registre central des features (validée côté serveur).
    featureKey: text("featureKey").notNull(),
    // ENABLED | DISABLED (INHERIT n'est jamais persisté : c'est l'absence de ligne).
    state: text("state").notNull(),
    // Origine : PURCHASED | GIFT | TRIAL | FOUNDER | COMMERCIAL_GESTURE | MANUAL.
    source: text("source").notNull().default("MANUAL"),
    // Essai temporaire : au-delà de cette date, l'override est ignoré (retour
    // au droit du plan). Aucune donnée métier n'est supprimée à l'expiration.
    expiresAt: timestamp("expiresAt"),
    // Note interne VISIBLE UNIQUEMENT du super-admin (affichée en texte brut).
    internalNote: text("internalNote"),
    createdByUserId: text("createdByUserId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqOverride: unique("company_feature_overrides_company_feature_unique").on(t.companyId, t.featureKey),
    byCompany: index("company_feature_overrides_companyId_idx").on(t.companyId),
  }),
)

/**
 * Journal d'audit léger des changements de licence/droits. Métadonnées NON
 * sensibles uniquement (jamais de secret/token). Rétention indéfinie.
 */
export const licenseAuditLog = pgTable(
  "license_audit_log",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId"),
    // LICENSE_CHANGED | FEATURE_ENABLED | FEATURE_DISABLED |
    // FEATURE_TRIAL_STARTED | FEATURE_OVERRIDE_REMOVED
    action: text("action").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("license_audit_log_companyId_idx").on(t.companyId),
  }),
)

/** Rattachement d'un utilisateur à une entreprise avec un rôle. */
export const companyMembers = pgTable(
  "company_members",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // OWNER | ADMIN | EMPLOYEE
    role: text("role").notNull().default("EMPLOYEE"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqMember: unique("company_members_company_user_unique").on(t.companyId, t.userId),
    byCompany: index("company_members_companyId_idx").on(t.companyId),
    byUser: index("company_members_userId_idx").on(t.userId),
  }),
)

/** Prospects du Programme Beta Tester (formulaire de la vitrine racine). */
export const betaLeads = pgTable("beta_leads", {
  id: serial("id").primaryKey(),
  businessName: text("businessName").notNull(),
  contactName: text("contactName").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  city: text("city"),
  message: text("message"),
  // new | contacted | converted | declined
  status: text("status").notNull().default("new"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/**
 * Clients enregistrés manuellement (carnet d'adresses de l'entreprise).
 * Source de vérité durable des clients, indépendante des réservations. La page
 * /admin/clients fusionne ces lignes avec les clients agrégés des réservations
 * (dédoublonnage par email puis téléphone). Isolé par `companyId`.
 */
export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    /* -------- Identité client B2C/B2B multi-pays (additif, nullable) --------
     * NULL = UNKNOWN / LEGACY / NON CONFIRMÉ (JAMAIS déduit B2C). Un nouveau
     * client choisit explicitement individual ou business. Quand une règle
     * réglementaire dépend du B2B/B2C, NULL produira REVIEW_REQUIRED (LOT 2B),
     * jamais une hypothèse silencieuse. Aucun backfill vers "individual".
     * Le pays DU CLIENT (et non du vendeur) détermine le schéma d'identifiant. */
    customerType: text("customerType"), // "individual" | "business" | null (=unknown/legacy)
    country: text("country"), // ISO 3166-1 alpha-2 (FR, BE, CH, ...)
    legalRegistrationNumber: text("legalRegistrationNumber"),
    legalRegistrationScheme: text("legalRegistrationScheme"),
    vatNumber: text("vatNumber"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("clients_companyId_idx").on(t.companyId),
  }),
)

/**
 * Galerie Avant / Après (réalisations) de l'entreprise. Chaque ligne stocke le
 * pathname des deux images (Blob privé), servies au public via une route
 * dédiée. Isolé par `companyId`, suppression en cascade avec l'entreprise.
 */
export const beforeAfterGallery = pgTable(
  "beforeAfterGallery",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    beforeImageUrl: text("beforeImageUrl").notNull(),
    afterImageUrl: text("afterImageUrl").notNull(),
    title: text("title"),
    description: text("description"),
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("beforeAfterGallery_companyId_idx").on(t.companyId),
  }),
)

/**
 * Avis clients de l'entreprise. Texte pur (aucune image / Blob). Chaque ligne
 * est isolée par `companyId` ; seule la colonne `visible` détermine l'affichage
 * sur la vitrine publique du tenant. Suppression en cascade avec l'entreprise.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    authorName: text("authorName").notNull(),
    vehicle: text("vehicle"),
    rating: integer("rating").notNull().default(5),
    text: text("text").notNull(),
    visible: boolean("visible").notNull().default(true),
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("reviews_companyId_idx").on(t.companyId),
  }),
)

/* -------------------------------------------------------------------------- */
/*  Données de référence (par entreprise). Montants en CENTIMES (integer).     */
/* -------------------------------------------------------------------------- */

/** Types de véhicules (citadine, berline, SUV, utilitaire...). */
export const vehicleTypes = pgTable(
  "vehicle_types",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    // Aide au choix côté client : exemples de véhicules (ex. "3008, Tiguan, Q3").
    // Facultatif : null = aucune aide affichée.
    examples: text("examples"),
    sortOrder: integer("sortOrder").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqSlug: unique("vehicle_types_company_slug_unique").on(t.companyId, t.slug),
    byCompany: index("vehicle_types_companyId_idx").on(t.companyId),
  }),
)

/** Catégories de prestations (extérieur, intérieur, protection...). */
export const serviceCategories = pgTable(
  "service_categories",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    sortOrder: integer("sortOrder").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqSlug: unique("service_categories_company_slug_unique").on(t.companyId, t.slug),
    byCompany: index("service_categories_companyId_idx").on(t.companyId),
  }),
)

/** Prestations. Le prix/durée de base sert de repli si aucun tarif véhicule. */
export const services = pgTable(
  "services",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    categoryId: integer("categoryId"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    image: text("image"),
    basePriceCents: integer("basePriceCents").notNull().default(0),
    durationMin: integer("durationMin").notNull().default(60),
    sortOrder: integer("sortOrder").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
    // NB : le badge « Mise en avant » (LOT C) est stocké dans les colonnes
    // additives `highlightKind` / `highlightLabel` (migration séparée). Elles
    // sont VOLONTAIREMENT absentes de ce schéma Drizzle pour ne pas casser les
    // `select()` complets tant que la migration n'est pas appliquée. Lecture /
    // écriture via lib/services/highlight-store.ts (tolérant à l'absence).
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqSlug: unique("services_company_slug_unique").on(t.companyId, t.slug),
    byCompany: index("services_companyId_idx").on(t.companyId),
  }),
)

/** Tarif et durée différenciés par type de véhicule (enfant de services). */
export const servicePrices = pgTable("service_prices", {
  id: serial("id").primaryKey(),
  serviceId: integer("serviceId").notNull(),
  vehicleTypeId: integer("vehicleTypeId").notNull(),
  priceCents: integer("priceCents").notNull().default(0),
  durationMin: integer("durationMin").notNull().default(60),
})

/** Options complémentaires (jantes, coffre, cuir, désinfection...). */
export const options = pgTable(
  "options",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    priceCents: integer("priceCents").notNull().default(0),
    durationMin: integer("durationMin").notNull().default(0),
    sortOrder: integer("sortOrder").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
  },
  (t) => ({
    uniqSlug: unique("options_company_slug_unique").on(t.companyId, t.slug),
    byCompany: index("options_companyId_idx").on(t.companyId),
  }),
)

/* -------------------------------------------------------------------------- */
/*  Paramètres métier (une ligne par entreprise)                              */
/* -------------------------------------------------------------------------- */

export const settings = pgTable(
  "settings",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Coordonnées professionnelles (utilisées dans les emails automatiques)
    businessName: text("businessName"),
    businessEmail: text("businessEmail"),
    businessPhone: text("businessPhone"),
    // Adresse de départ pour le calcul des frais de déplacement
    businessAddress: text("businessAddress"),
    businessLat: numeric("businessLat"),
    businessLng: numeric("businessLng"),
    // Frais de déplacement
    freeDistanceKm: numeric("freeDistanceKm").notNull().default("0"),
    pricePerKmCents: integer("pricePerKmCents").notNull().default(0),
    maxDistanceKm: numeric("maxDistanceKm").notNull().default("50"),
    roundTrip: boolean("roundTrip").notNull().default(true),
    // Planning
    maxVehiclesPerDay: integer("maxVehiclesPerDay").notNull().default(4),
    slotIntervalMin: integer("slotIntervalMin").notNull().default(30),
    bufferMin: integer("bufferMin").notNull().default(0),
    minNoticeHours: integer("minNoticeHours").notNull().default(24),
    // Acompte : "none" | "fixed" | "percent"
    depositType: text("depositType").notNull().default("none"),
    depositValue: integer("depositValue").notNull().default(0),
    // Moyens de paiement acceptés pour l'acompte (slugs séparés par des virgules,
    // ex. "transfer,wero"). Aucun fournisseur n'est imposé.
    depositMethods: text("depositMethods"),
    // Instructions de paiement affichées au client (IBAN, n° Wero, lien, etc.).
    depositInstructions: text("depositInstructions"),
    // Mode vacances : quand activé, la prise de réservation en ligne est suspendue.
    vacationMode: boolean("vacationMode").notNull().default(false),
    vacationMessage: text("vacationMessage"),
    /* ------------------------------ Rappels SMS ------------------------------ */
    // Préférences de rappel SMS (le solde vit dans la table sms_credits).
    smsRemindersEnabled: boolean("smsRemindersEnabled").notNull().default(false),
    // Délai avant le RDV, en heures : 24 ou 48.
    smsReminderOffsetHours: integer("smsReminderOffsetHours").notNull().default(24),
    // Message personnalisé (placeholders {prenom} {entreprise} {date} {heure}).
    smsReminderTemplate: text("smsReminderTemplate"),
    /* ------------------------------ Facturation ------------------------------ */
    invoiceLogoPathname: text("invoiceLogoPathname"),
    invoiceCompanyAddress: text("invoiceCompanyAddress"),
    invoiceSiret: text("invoiceSiret"),
    invoiceIban: text("invoiceIban"),
    invoiceBic: text("invoiceBic"),
    /* -------- Identité légale vendeur multi-pays (additif, nullable) --------
     * `invoiceSiret` historique est CONSERVÉ (rétrocompat). Les champs génériques
     * ci-dessous prennent le relais pour BE/CH/autres sans colonne par pays.
     * `legalRegistrationScheme` : FR_SIREN | FR_SIRET | BE_BCE | CH_UID | GENERIC. */
    legalRegistrationNumber: text("legalRegistrationNumber"),
    legalRegistrationScheme: text("legalRegistrationScheme"),
    vatNumber: text("vatNumber"),
    // Statut TVA déclaré par le pro : "subject" | "exempt" | "unknown" (défaut null).
    vatStatus: text("vatStatus"),
    legalForm: text("legalForm"),
    // Catégorie d'entreprise France (calendrier e-invoicing) : micro|pme|eti|ge|unknown.
    frBusinessCategory: text("frBusinessCategory"),
    // Devise de facturation par défaut CONFIRMÉE (ISO 4217). Null => NON confirmée.
    // `companies.currency` (default EUR historique) ne vaut PAS confirmation :
    // un tenant CH legacy peut avoir EUR par défaut sans l'avoir choisi.
    defaultCurrency: text("defaultCurrency"),
    /* Confirmation explicite du profil de facturation (pays + infos légales).
     * NULL => `companies.country` (default FR) et `companies.currency` (default
     * EUR) sont des valeurs HISTORIQUES, PAS un choix confirmé du pro. Tant que
     * NULL : ne jamais présenter le pays/devise comme configuration légale
     * confirmée. Renseigné quand le pro confirme réellement dans les paramètres. */
    billingProfileConfirmedAt: timestamp("billingProfileConfirmedAt"),
    vatEnabled: boolean("vatEnabled").notNull().default(false),
    vatRate: numeric("vatRate").notNull().default("20"),
    vatExemptNote: text("vatExemptNote").default("TVA non applicable, art. 293 B du CGI"),
    invoicePrefix: text("invoicePrefix").notNull().default("FAC"),
    invoiceCounter: integer("invoiceCounter").notNull().default(0),
    invoiceCounterYear: integer("invoiceCounterYear").notNull().default(0),
    /* -------- Numérotation INDÉPENDANTE des avoirs (additif) -----------------
     * Compteur propre aux avoirs, distinct des factures, réinitialisé par année.
     * Format : `${creditNotePrefix}-${année}-${NNNN}` (ex. AVO-2026-0001). */
    creditNotePrefix: text("creditNotePrefix").notNull().default("AVO"),
    creditNoteCounter: integer("creditNoteCounter").notNull().default(0),
    creditNoteCounterYear: integer("creditNoteCounterYear").notNull().default(0),
    invoiceDueDays: integer("invoiceDueDays").notNull().default(30),
    invoiceFooterNote: text("invoiceFooterNote"),
    invoiceLegalMentions: text("invoiceLegalMentions"),
    invoiceEmailSubject: text("invoiceEmailSubject"),
    invoiceEmailBody: text("invoiceEmailBody"),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqCompany: unique("settings_company_unique").on(t.companyId),
  }),
)

/** Horaires d'ouverture par jour (0 = dimanche ... 6 = samedi). */
export const businessHours = pgTable(
  "business_hours",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    dayOfWeek: integer("dayOfWeek").notNull(),
    isOpen: boolean("isOpen").notNull().default(true),
    openTime: text("openTime").notNull().default("09:00"),
    closeTime: text("closeTime").notNull().default("18:00"),
  },
  (t) => ({
    byCompany: index("business_hours_companyId_idx").on(t.companyId),
  }),
)

/** Périodes bloquées : vacances, jours fériés, indisponibilités. */
export const timeOff = pgTable(
  "time_off",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    startDate: date("startDate").notNull(),
    endDate: date("endDate").notNull(),
    // Plage horaire optionnelle ("HH:MM"). NULL/NULL = indisponibilité journée entière.
    startTime: text("startTime"),
    endTime: text("endTime"),
    // Affichage public : "Complet" | "Indisponible" (défaut historique = indisponible).
    publicLabel: text("publicLabel"),
    reason: text("reason"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("time_off_companyId_idx").on(t.companyId),
  }),
)

/* -------------------------------------------------------------------------- */
/*  Réservations                                                              */
/* -------------------------------------------------------------------------- */

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    reference: text("reference").notNull().unique(),
    // Jeton public haute entropie pour la gestion du RDV par le client final
    // NON authentifié (page /reservation/gerer/<token>). Nullable : les
    // réservations historiques n'en ont pas (le lien n'est alors pas proposé).
    // Impossible à deviner ; ne contient aucune donnée tenant/client.
    manageToken: text("manageToken"),
    userId: text("userId"), // nullable = réservation invité
    // Marqueur des données de démonstration (nettoyage avant passage en prod).
    isDemoData: boolean("isDemoData").notNull().default(false),
    // Client
    customerName: text("customerName").notNull(),
    customerEmail: text("customerEmail").notNull(),
    customerPhone: text("customerPhone").notNull(),
    // Adresse d'intervention + géolocalisation
    address: text("address").notNull(),
    addressLat: numeric("addressLat"),
    addressLng: numeric("addressLng"),
    // Déplacement (calculé côté serveur)
    distanceKm: numeric("distanceKm").notNull().default("0"),
    billedDistanceKm: numeric("billedDistanceKm").notNull().default("0"),
    travelFeeCents: integer("travelFeeCents").notNull().default(0),
    // Montants
    servicesCents: integer("servicesCents").notNull().default(0),
    optionsCents: integer("optionsCents").notNull().default(0),
    subtotalCents: integer("subtotalCents").notNull().default(0),
    // Code promo appliqué (snapshot durable : l'ancienne réservation ne change
    // jamais même si le code est modifié/supprimé plus tard).
    promoCodeId: integer("promoCodeId"),
    promoCodeSnapshot: jsonb("promoCodeSnapshot"),
    discountCents: integer("discountCents").notNull().default(0),
    totalCents: integer("totalCents").notNull().default(0),
    depositCents: integer("depositCents").notNull().default(0),
    // Planning
    date: date("date").notNull(),
    startTime: text("startTime").notNull(),
    endTime: text("endTime").notNull(),
    totalDurationMin: integer("totalDurationMin").notNull().default(0),
    // Statut : "pending_deposit" | "confirmed" | "cancelled" | "completed"
    status: text("status").notNull().default("pending_deposit"),
    notes: text("notes"),
    reminderSentAt: timestamp("reminderSentAt"),
    // Rappel SMS : marqueur d'envoi unique (protection anti double-envoi).
    smsReminderSentAt: timestamp("smsReminderSentAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("bookings_companyId_idx").on(t.companyId),
    // Recherche par jeton public (gestion client). Unique : un jeton ne peut
    // désigner qu'une seule réservation. Postgres autorise plusieurs NULL.
    byManageToken: uniqueIndex("bookings_manageToken_idx").on(t.manageToken),
  }),
)

/** Un véhicule/prestation dans une réservation. */
export const bookingItems = pgTable("booking_items", {
  id: serial("id").primaryKey(),
  bookingId: integer("bookingId").notNull(),
  serviceId: integer("serviceId"),
  serviceName: text("serviceName").notNull(),
  vehicleTypeId: integer("vehicleTypeId"),
  vehicleTypeName: text("vehicleTypeName").notNull(),
  vehicleBrand: text("vehicleBrand"),
  vehicleModel: text("vehicleModel"),
  vehiclePlate: text("vehiclePlate"),
  priceCents: integer("priceCents").notNull().default(0),
  durationMin: integer("durationMin").notNull().default(0),
})

/** Options choisies pour un véhicule/prestation donné. */
export const bookingItemOptions = pgTable("booking_item_options", {
  id: serial("id").primaryKey(),
  bookingItemId: integer("bookingItemId").notNull(),
  optionId: integer("optionId"),
  optionName: text("optionName").notNull(),
  priceCents: integer("priceCents").notNull().default(0),
  durationMin: integer("durationMin").notNull().default(0),
})

/* -------------------------------------------------------------------------- */
/*  Codes promo (V1 simple, structure évolutive via `rules` jsonb)            */
/* -------------------------------------------------------------------------- */

/**
 * Un code promo par entreprise. V1 : remise % ou fixe, dates, limite globale,
 * activation. Le champ `rules` (jsonb) est réservé aux critères avancés futurs
 * (firstBookingOnly, minOrderCents, serviceIds, ...) pour éviter une migration.
 * Contrainte UNIQUE(companyId, code) ; le code est normalisé en MAJUSCULES.
 */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    active: boolean("active").notNull().default(true),
    // "percent" (1-100) | "fixed" (montant en centimes).
    discountType: text("discountType").notNull(),
    discountValue: integer("discountValue").notNull().default(0),
    startsAt: timestamp("startsAt"),
    endsAt: timestamp("endsAt"),
    maxUses: integer("maxUses"),
    usageCount: integer("usageCount").notNull().default(0),
    minOrderCents: integer("minOrderCents"),
    rules: jsonb("rules"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("promo_codes_companyId_idx").on(t.companyId),
    uniqCompanyCode: unique("promo_codes_company_code_uniq").on(t.companyId, t.code),
  }),
)

/* -------------------------------------------------------------------------- */
/*  Crédits SMS (une ligne par entreprise) + demandes de recharge             */
/* -------------------------------------------------------------------------- */

/**
 * Solde SMS d'une entreprise. UNE ligne par tenant (contrainte UNIQUE).
 * `balance` = crédits restants ; `granted`/`purchased` = totaux cumulés
 * (offerts / achetés) pour l'historique. `betaBonusGrantedAt` sert de garde-fou
 * pour n'attribuer les 20 SMS offerts qu'UNE seule fois.
 */
export const smsCredits = pgTable(
  "sms_credits",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    balance: integer("balance").notNull().default(0),
    granted: integer("granted").notNull().default(0),
    purchased: integer("purchased").notNull().default(0),
    // Marqueur idempotent du bonus bêta (null = jamais attribué).
    betaBonusGrantedAt: timestamp("betaBonusGrantedAt"),
    // Sous-compte AllMySMS propre au tenant (créé à la 1re activation SMS).
    // null => on utilise le compte central en fallback. Secrets SERVEUR only,
    // jamais exposés au client (aucune route ne renvoie ces colonnes au front).
    allmysmsSubLogin: text("allmysmsSubLogin"),
    allmysmsSubApiKey: text("allmysmsSubApiKey"),
    // Total cumulé de crédits AllMySMS réellement alloués au sous-compte depuis
    // le compte central (audit + garde anti double-transfert). N'est PAS le solde
    // métier DetailFlow, qui reste `balance`.
    allmysmsCreditsAllocated: integer("allmysmsCreditsAllocated").notNull().default(0),
    allmysmsLastAllocationAt: timestamp("allmysmsLastAllocationAt"),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqCompany: unique("sms_credits_company_unique").on(t.companyId),
  }),
)

/**
 * Demande de recharge SMS (workflow semi-automatique, paiement manuel Revolut).
 * La création NE crédite JAMAIS : seul le passage à "paid" par le super-admin
 * crédite (idempotent via `validatedAt`). Isolé par `companyId`.
 */
export const smsRechargeRequests = pgTable(
  "sms_recharge_requests",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Référence unique visible (ex. SMS-A8F42K) — sert d'identifiant au paiement.
    reference: text("reference").notNull().unique(),
    quantity: integer("quantity").notNull(),
    amountCents: integer("amountCents").notNull(),
    // pending | paid | cancelled
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    validatedAt: timestamp("validatedAt"),
  },
  (t) => ({
    byCompany: index("sms_recharge_requests_companyId_idx").on(t.companyId),
    byStatus: index("sms_recharge_requests_status_idx").on(t.status),
  }),
)

/* -------------------------------------------------------------------------- */
/*  Factures (document figé, montants en CENTIMES)                            */
/* -------------------------------------------------------------------------- */

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Numéro attribué à l'émission uniquement (null tant que brouillon).
    // Unique par entreprise (contrainte composite companyId + number).
    number: text("number"),
    // Lien vers la réservation source. UNIQUE = une seule facture par réservation.
    bookingId: integer("bookingId").unique(),
    status: text("status").notNull().default("draft"),
    /* -------- Avoir / note de crédit (additif, rétrocompatible) --------------
     * documentType : "invoice" (défaut, toutes les factures existantes) ou
     *   "credit_note" (avoir rectifiant une facture émise). Jamais déduit :
     *   fixé explicitement à la création du document.
     * originalInvoiceId : facture d'origine rectifiée (null pour une facture).
     * creditReason : motif obligatoire de l'avoir (null pour une facture).
     * Un avoir NE MODIFIE JAMAIS la facture d'origine (documents indépendants). */
    documentType: text("documentType").notNull().default("invoice"),
    originalInvoiceId: integer("originalInvoiceId"),
    creditReason: text("creditReason"),
    // Devise de la facture (ISO 4217). Null (historique) => EUR à l'affichage.
    // Une facture émise CONSERVE sa devise même si l'entreprise en change.
    currencyCode: text("currencyCode"),
    // Snapshot client
    customerName: text("customerName").notNull(),
    customerEmail: text("customerEmail"),
    customerPhone: text("customerPhone"),
    customerAddress: text("customerAddress"),
    /* -------- Snapshot identité client multi-pays (additif, nullable) -------- */
    customerType: text("customerType"), // "individual" | "business" | null (=unknown/legacy)
    customerCountry: text("customerCountry"),
    customerLegalRegistrationNumber: text("customerLegalRegistrationNumber"),
    customerLegalRegistrationScheme: text("customerLegalRegistrationScheme"),
    customerVatNumber: text("customerVatNumber"),
    // Snapshot véhicule
    vehicleTypeName: text("vehicleTypeName"),
    vehicleBrand: text("vehicleBrand"),
    vehicleModel: text("vehicleModel"),
    vehiclePlate: text("vehiclePlate"),
    // Dates
    serviceDate: date("serviceDate"),
    issueDate: date("issueDate"),
    dueDate: date("dueDate"),
    // Montants (centimes)
    itemsTotalCents: integer("itemsTotalCents").notNull().default(0),
    discountCents: integer("discountCents").notNull().default(0),
    netCents: integer("netCents").notNull().default(0),
    vatEnabled: boolean("vatEnabled").notNull().default(false),
    vatRate: numeric("vatRate").notNull().default("0"),
    vatCents: integer("vatCents").notNull().default(0),
    totalCents: integer("totalCents").notNull().default(0),
    depositCents: integer("depositCents").notNull().default(0),
    paidCents: integer("paidCents").notNull().default(0),
    balanceCents: integer("balanceCents").notNull().default(0),
    // Textes
    customerComment: text("customerComment"),
    internalNote: text("internalNote"),
    // Snapshot émetteur (figé à l'émission)
    issuerName: text("issuerName"),
    issuerEmail: text("issuerEmail"),
    issuerPhone: text("issuerPhone"),
    issuerAddress: text("issuerAddress"),
    issuerSiret: text("issuerSiret"),
    issuerIban: text("issuerIban"),
    issuerBic: text("issuerBic"),
    /* -------- Snapshot identité vendeur multi-pays (additif, nullable) ------
     * `issuerSiret` historique CONSERVÉ. Champs génériques pour BE/CH/autres. */
    issuerCountry: text("issuerCountry"),
    issuerLegalRegistrationNumber: text("issuerLegalRegistrationNumber"),
    issuerLegalRegistrationScheme: text("issuerLegalRegistrationScheme"),
    issuerVatNumber: text("issuerVatNumber"),
    issuerLogoPathname: text("issuerLogoPathname"),
    vatExemptNote: text("vatExemptNote"),
    /* -------- Traitement fiscal explicite (LOT 2B.4, additif, nullable) ------
     * taxTreatment : STANDARD | EXEMPT | REVERSE_CHARGE | OUT_OF_SCOPE | null (legacy).
     *   Choix EXPLICITE de l'utilisateur — jamais déduit du pays/type/TVA.
     * taxLegalMention : texte exact de la mention fiscale choisie pour CETTE
     *   facture (figé à l'émission). null pour STANDARD et pour le legacy. */
    taxTreatment: text("taxTreatment"),
    taxLegalMention: text("taxLegalMention"),
    footerNote: text("footerNote"),
    legalMentions: text("legalMentions"),
    pdfPathname: text("pdfPathname"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqNumber: unique("invoices_company_number_unique").on(t.companyId, t.number),
    byCompany: index("invoices_companyId_idx").on(t.companyId),
    // Recherche des avoirs rattachés à une facture d'origine, scopée entreprise.
    byCompanyOriginal: index("invoices_company_original_idx").on(t.companyId, t.originalInvoiceId),
  }),
)

/** Ligne de facture. kind : "service" | "option" | "travel" | "fee". */
export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoiceId").notNull(),
    kind: text("kind").notNull().default("service"),
    label: text("label").notNull(),
    description: text("description"),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unitPriceCents").notNull().default(0),
    sortOrder: integer("sortOrder").notNull().default(0),
    /**
     * Ligne d'avoir : rattachement à la ligne de la facture d'origine (additif,
     * nullable). Permet de plafonner côté serveur les quantités/montants crédités
     * par ligne, y compris avec plusieurs avoirs partiels. NULL pour les lignes
     * de facture classiques et pour les avoirs legacy antérieurs à la migration.
     */
    originalInvoiceItemId: integer("originalInvoiceItemId"),
  },
  (t) => ({
    byInvoice: index("invoice_items_invoiceId_idx").on(t.invoiceId),
    byOriginalItem: index("invoice_items_original_item_idx").on(t.originalInvoiceItemId),
  }),
)

/** Paiement enregistré sur une facture (hors acompte initial). */
export const invoicePayments = pgTable("invoice_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoiceId").notNull(),
  amountCents: integer("amountCents").notNull().default(0),
  method: text("method").notNull().default("transfer"),
  paidAt: date("paidAt").notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/** Journal d'événements d'une facture (audit / historique). */
export const invoiceEvents = pgTable("invoice_events", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoiceId").notNull(),
  type: text("type").notNull(),
  message: text("message"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/**
 * Achats de produits / consommables utilisés par le professionnel pour
 * réaliser ses prestations (shampoing, polish, céramique, microfibres...).
 * PAS des produits vendus aux clients : aucun lien avec les factures/CA.
 * Table physique "products" (créée initialement pour un besoin différent,
 * réutilisée ici avec des colonnes additives : purchaseDate, quantity, note).
 */
export const productPurchases = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("priceCents").notNull().default(0),
    purchaseDate: date("purchaseDate").notNull(),
    quantity: integer("quantity").notNull().default(1),
    note: text("note"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("products_companyId_idx").on(t.companyId),
  }),
)

/* -------------------------------------------------------------------------- */
/*  Demandes personnalisées / Prestations sur mesure (fonctionnalité          */
/*  facultative par entreprise ; l'activation et les textes/catégories sont   */
/*  stockés dans companies.siteContent.customRequests — voir                  */
/*  lib/custom-requests.ts). Cette table ne contient QUE les demandes reçues. */
/*  Isolé par companyId. Le champ `token` (aléatoire, non devinable) autorise */
/*  l'acceptation/refus par le client sans compte.                            */
/* -------------------------------------------------------------------------- */
export const customRequests = pgTable(
  "custom_requests",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Jeton sécurisé unique (lien client accepter/refuser).
    token: text("token").notNull().unique(),
    // Type de demande (clé + libellé figé au moment de la demande).
    typeKey: text("typeKey").notNull(),
    typeLabel: text("typeLabel").notNull(),
    // Prospect
    customerName: text("customerName").notNull(),
    customerEmail: text("customerEmail").notNull(),
    customerPhone: text("customerPhone").notNull(),
    // Informations véhicule / flotte (toutes facultatives)
    vehicleType: text("vehicleType"),
    vehicleBrand: text("vehicleBrand"),
    vehicleModel: text("vehicleModel"),
  fleetCompanyName: text("fleetCompanyName"),
  vehicleCount: text("vehicleCount"),
  frequency: text("frequency"),
  // Numéro d'entreprise / identifiant légal saisi librement par le prospect
  // (BCE en Belgique, SIREN/SIRET en France…). Facultatif, jamais validé ni
  // interprété : simple information transmise au professionnel. Aucun lien
  // automatique avec la facturation (pays/type client inconnus à ce stade).
  customerLegalRegistrationNumber: text("customerLegalRegistrationNumber"),
  description: text("description").notNull(),
    // Statut : new | proposal_sent | accepted | declined | converted
    status: text("status").notNull().default("new"),
    // Proposition / devis du professionnel
    proposalTitle: text("proposalTitle"),
    proposalDescription: text("proposalDescription"),
    proposalPriceCents: integer("proposalPriceCents"),
    proposalDurationMin: integer("proposalDurationMin"),
    proposalMessage: text("proposalMessage"),
    proposalSentAt: timestamp("proposalSentAt"),
    respondedAt: timestamp("respondedAt"),
    // Réservation créée après conversion (anti-doublon).
    bookingId: integer("bookingId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("custom_requests_companyId_idx").on(t.companyId),
    byToken: index("custom_requests_token_idx").on(t.token),
  }),
)

/* -------------------------------------------------------------------------- */
/*  Analytics de visites (sites publics tenant) — V1 agrégats journaliers      */
/*  Ajout ADDITIF : ne modifie aucune table existante. Isolation par           */
/*  companyId, aucune donnée personnelle stockée (pas d'IP, pas d'email).      */
/* -------------------------------------------------------------------------- */

/**
 * Agrégats journaliers par entreprise : une ligne par (companyId, date).
 * Compteurs incrémentés via upsert atomique. Le champ `meta` (jsonb) est prévu
 * pour de futures dimensions (sources de trafic, UTM…) sans migration.
 */
export const tenantAnalyticsDaily = pgTable(
  "tenant_analytics_daily",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId").notNull(),
    // Jour local au format YYYY-MM-DD (agrégation par journée).
    date: text("date").notNull(),
    pageViews: integer("pageViews").notNull().default(0),
    uniqueVisitors: integer("uniqueVisitors").notNull().default(0),
    // Futur taux de conversion : clic "Réserver" et réservation terminée.
    bookingClicks: integer("bookingClicks").notNull().default(0),
    bookingsCompleted: integer("bookingsCompleted").notNull().default(0),
    // Extension future (sources, UTM, campagnes) sans nouvelle migration.
    meta: jsonb("meta"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    // Un seul agrégat par entreprise et par jour (cible des upserts).
    byCompanyDate: unique("tenant_analytics_daily_company_date_key").on(t.companyId, t.date),
  }),
)

/**
 * Table minimaliste de déduplication des visiteurs uniques du jour.
 * Stocke uniquement un identifiant anonyme de navigateur (cookie) + le jour.
 * Aucune donnée personnelle. L'unicité (companyId, date, visitorId) permet de
 * détecter la première vue du jour d'un visiteur de façon atomique.
 */
export const tenantAnalyticsVisits = pgTable(
  "tenant_analytics_visits",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId").notNull(),
    date: text("date").notNull(),
    // Identifiant anonyme opaque généré côté navigateur (non nominatif).
    visitorId: text("visitorId").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompanyDateVisitor: unique("tenant_analytics_visits_key").on(t.companyId, t.date, t.visitorId),
  }),
)

/* -------------------------------------------------------------------------- */
/*  Paiements en ligne (V1 : Stripe Connect) — ajout ADDITIF                   */
/*  Architecture générique multi-provider : le métier ne dépend jamais de      */
/*  Stripe. Isolation stricte par companyId. Aucune donn��e bancaire stockée.   */
/* -------------------------------------------------------------------------- */

/**
 * Réglages plateforme (une seule ligne, id = 1). Contient la commission
 * DetailFlow par défaut, modifiable depuis le Super Admin (sans toucher au code).
 * Exprimée en points de base (bps) : 300 = 3,00 %.
 */
export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  defaultPlatformFeeBps: integer("defaultPlatformFeeBps").notNull().default(300),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/**
 * Un paiement en ligne rattaché à une réservation. Le taux de commission
 * réellement appliqué est FIGÉ ici au moment de la transaction (jamais
 * recalculé a posteriori). Montants en centimes. `provider`/`externalPaymentId`
 * abstraits pour permettre d'autres fournisseurs (SumUp…) sans refonte.
 */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    bookingId: integer("bookingId")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("stripe"),
    // Identifiant de la session/intent chez le provider (idempotence + rapprochement).
    externalPaymentId: text("externalPaymentId"),
    // "deposit" | "full_payment"
    type: text("type").notNull(),
    // Statut GÉNÉRIQUE DetailFlow (indépendant de Stripe) :
    // pending | processing | paid | failed | cancelled | refunded | partially_refunded
    status: text("status").notNull().default("pending"),
    currency: text("currency").notNull().default("EUR"),
    grossAmountCents: integer("grossAmountCents").notNull(),
    // Taux + montant de commission FIGÉS à la transaction.
    platformFeeBps: integer("platformFeeBps").notNull(),
    platformFeeAmountCents: integer("platformFeeAmountCents").notNull(),
    // Frais provider (Stripe) si connus via le webhook, sinon null.
    providerFeeAmountCents: integer("providerFeeAmountCents"),
    // Net encaissé par le professionnel si connu, sinon null.
    netAmountCents: integer("netAmountCents"),
    refundedAmountCents: integer("refundedAmountCents").notNull().default(0),
    // Extension future (métadonnées provider, reçu…) sans migration.
    meta: jsonb("meta"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    paidAt: timestamp("paidAt"),
    failedAt: timestamp("failedAt"),
    refundedAt: timestamp("refundedAt"),
  },
  (t) => ({
    byCompany: index("payments_companyId_idx").on(t.companyId),
    byBooking: index("payments_bookingId_idx").on(t.bookingId),
    // Idempotence : un même paiement provider ne peut exister qu'une fois.
    uniqExternal: unique("payments_external_key").on(t.provider, t.externalPaymentId),
  }),
)

/**
 * Journal d'idempotence des événements webhook provider. Un eventId déjà présent
 * signifie "déjà traité" → l'appel répété est ignoré (aucun double paiement /
 * double commission / double mutation de réservation).
 */
export const paymentEvents = pgTable("payment_events", {
  // Identifiant d'événement du provider (ex. Stripe `evt_...`) — clé primaire.
  eventId: text("eventId").primaryKey(),
  provider: text("provider").notNull().default("stripe"),
  type: text("type"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/**
 * Un remboursement rattaché à un `payment`. Chaque remboursement est une
 * OPÉRATION DISTINCTE : le paiement d'origine n'est jamais modifié/supprimé,
 * seuls ses agrégats (`refundedAmountCents`/`refundedAt`/`status`) sont
 * recalculés à partir des lignes `refunds` réellement `succeeded`.
 * Montants en centimes entiers. Persistance requise via
 * `scripts/refunds-table-migration.sql` (migration additive, non exécutée ici).
 */
export const refunds = pgTable(
  "refunds",
  {
    id: serial("id").primaryKey(),
    companyId: integer("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    paymentId: integer("paymentId")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    bookingId: integer("bookingId")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    provider: text("provider").notNull().default("stripe"),
    // Identifiant Stripe du remboursement (re_...), connu après appel/webhook.
    externalRefundId: text("externalRefundId"),
    amountCents: integer("amountCents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    // Motif obligatoire (jamais de donnée bancaire/personnelle sensible).
    reason: text("reason").notNull(),
    // requested | pending | succeeded | failed | canceled
    status: text("status").notNull().default("pending"),
    // Traçabilité de l'opérateur (id user), sans donnée personnelle client.
    initiatedByUserId: text("initiatedByUserId"),
    // Clé d'idempotence STABLE (anti double clic / double création).
    idempotencyKey: text("idempotencyKey"),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    succeededAt: timestamp("succeededAt"),
    failedAt: timestamp("failedAt"),
    canceledAt: timestamp("canceledAt"),
  },
  (t) => ({
    byCompany: index("refunds_companyId_idx").on(t.companyId),
    byPayment: index("refunds_paymentId_idx").on(t.paymentId),
    byBooking: index("refunds_bookingId_idx").on(t.bookingId),
    // Filtres fréquents : par tenant + statut, et par tenant + date.
    byCompanyStatus: index("refunds_company_status_idx").on(t.companyId, t.status),
    byCompanyCreated: index("refunds_company_created_idx").on(t.companyId, t.createdAt),
    // Idempotence webhook : un remboursement Stripe ne peut exister qu'une fois.
    uniqExternal: unique("refunds_external_key").on(t.provider, t.externalRefundId),
    // Idempotence création : un double clic réutilise la clé => une seule ligne.
    uniqIdem: unique("refunds_idempotency_key").on(t.idempotencyKey),
    // Garanties SQL alignées sur scripts/refunds-table-migration.sql.
    amountPositive: check("refunds_amount_positive", sql`${t.amountCents} > 0`),
    reasonLen: check("refunds_reason_len", sql`char_length(${t.reason}) between 1 and 500`),
    statusValid: check(
      "refunds_status_valid",
      sql`${t.status} in ('requested', 'pending', 'succeeded', 'failed', 'canceled')`,
    ),
    currencyIso: check("refunds_currency_iso", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  }),
)
