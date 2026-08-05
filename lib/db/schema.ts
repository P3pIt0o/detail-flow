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
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

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
    /* ------------------------------ Facturation ------------------------------ */
    invoiceLogoPathname: text("invoiceLogoPathname"),
    invoiceCompanyAddress: text("invoiceCompanyAddress"),
    invoiceSiret: text("invoiceSiret"),
    invoiceIban: text("invoiceIban"),
    invoiceBic: text("invoiceBic"),
    vatEnabled: boolean("vatEnabled").notNull().default(false),
    vatRate: numeric("vatRate").notNull().default("20"),
    vatExemptNote: text("vatExemptNote").default("TVA non applicable, art. 293 B du CGI"),
    invoicePrefix: text("invoicePrefix").notNull().default("FAC"),
    invoiceCounter: integer("invoiceCounter").notNull().default(0),
    invoiceCounterYear: integer("invoiceCounterYear").notNull().default(0),
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
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index("bookings_companyId_idx").on(t.companyId),
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
    // Snapshot client
    customerName: text("customerName").notNull(),
    customerEmail: text("customerEmail"),
    customerPhone: text("customerPhone"),
    customerAddress: text("customerAddress"),
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
    issuerLogoPathname: text("issuerLogoPathname"),
    vatExemptNote: text("vatExemptNote"),
    footerNote: text("footerNote"),
    legalMentions: text("legalMentions"),
    pdfPathname: text("pdfPathname"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    uniqNumber: unique("invoices_company_number_unique").on(t.companyId, t.number),
    byCompany: index("invoices_companyId_idx").on(t.companyId),
  }),
)

/** Ligne de facture. kind : "service" | "option" | "travel" | "fee". */
export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoiceId").notNull(),
  kind: text("kind").notNull().default("service"),
  label: text("label").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unitPriceCents").notNull().default(0),
  sortOrder: integer("sortOrder").notNull().default(0),
})

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
