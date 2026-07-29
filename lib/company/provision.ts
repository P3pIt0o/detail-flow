import "server-only"
import { randomUUID, randomBytes } from "crypto"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import {
  companies,
  companyMembers,
  settings as settingsTable,
  businessHours,
  vehicleTypes,
  serviceCategories,
  services,
  servicePrices,
  options,
  bookings,
  bookingItems,
  user as userTable,
  account as accountTable,
} from "@/lib/db/schema"
import { isValidSlug, normalizeSlug } from "@/lib/tenant-shared"
import { sendEmail } from "@/lib/email/send"
import { ownerInvitationEmail } from "@/lib/email/templates"

/**
 * Base publique pour les liens des emails. On évite absolument localhost :
 * priorité au domaine configuré (Better Auth / prod), puis à l'URL d'aperçu v0.
 */
function publicBaseUrl(): string {
  const raw =
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    process.env.V0_RUNTIME_URL ||
    "https://app.detailflow.fr"
  return raw.replace(/\/+$/, "")
}

/* -------------------------------------------------------------------------- */
/*  Provisionnement d'une entreprise (tenant) — cœur du "créer en < 2 min".    */
/* -------------------------------------------------------------------------- */

export type ProvisionInput = {
  name: string
  slug: string
  ownerName: string
  ownerEmail: string
  city?: string
  country?: string
  currency?: string
  timezone?: string
  brandPrimary?: string
  brandSecondary?: string
  /** Durée du programme beta en jours (par défaut 30). */
  betaDays?: number
  /** Génère un jeu de données de démonstration complet (isDemoData=true). */
  withDemo?: boolean
}

export type ProvisionResult = {
  companyId: number
  slug: string
  ownerEmail: string
  /** Mot de passe temporaire à communiquer de façon sécurisée (affiché 1 fois). */
  tempPassword: string
  ownerCreated: boolean
}

/** Horaires par défaut : lun-sam 9h-18h, dimanche fermé. */
const DEFAULT_HOURS = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  isOpen: dayOfWeek !== 0,
  openTime: "09:00",
  closeTime: "18:00",
}))

/** Génère un mot de passe temporaire lisible mais robuste. */
function generateTempPassword(): string {
  // 18 caractères base64url : suffisant pour un mot de passe temporaire.
  return randomBytes(14).toString("base64url")
}

/**
 * Crée un compte propriétaire (OWNER) via le hachage Better Auth, SANS toucher
 * à la session courante (super-admin). L'email est marqué comme vérifié (le
 * super-admin se porte garant). Renvoie l'id + le mot de passe temporaire.
 *
 * Si un compte existe déjà pour cet email, on le réutilise (pas de doublon).
 */
async function ensureOwnerAccount(
  email: string,
  name: string,
): Promise<{ userId: string; tempPassword: string; created: boolean }> {
  const normalizedEmail = email.trim().toLowerCase()

  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, normalizedEmail))
    .limit(1)

  if (existing) {
    return { userId: existing.id, tempPassword: "", created: false }
  }

  const tempPassword = generateTempPassword()
  // Hachage via le contexte Better Auth (même algo que l'inscription normale).
  const ctx = await auth.$context
  const hashed = await ctx.password.hash(tempPassword)

  const userId = randomUUID()
  await db.insert(userTable).values({
    id: userId,
    name: name.trim(),
    email: normalizedEmail,
    emailVerified: true, // vouché par le super-admin
  })
  await db.insert(accountTable).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hashed,
  })

  return { userId, tempPassword, created: true }
}

/**
 * Provisionne une entreprise complète : company + settings + horaires + owner
 * + membership, et optionnellement les données de démonstration.
 */
export async function provisionCompany(input: ProvisionInput): Promise<ProvisionResult> {
  const slug = normalizeSlug(input.slug || input.name)
  if (!isValidSlug(slug)) {
    throw new Error(
      "Slug invalide : 3 à 63 caractères, minuscules/chiffres/tirets, non réservé.",
    )
  }

  // Unicité du slug (contrôle applicatif + contrainte DB en filet de sécurité).
  const [slugTaken] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1)
  if (slugTaken) throw new Error(`Le slug "${slug}" est déjà utilisé.`)

  const betaDays = input.betaDays ?? 30
  const now = new Date()
  const betaEndsAt = new Date(now.getTime() + betaDays * 24 * 60 * 60 * 1000)

  // 1) Entreprise (statut BETA : Programme Beta Tester).
  const [company] = await db
    .insert(companies)
    .values({
      name: input.name.trim(),
      slug,
      status: "BETA",
      betaStartedAt: now,
      betaEndsAt,
      brandPrimary: input.brandPrimary ?? null,
      brandSecondary: input.brandSecondary ?? null,
      email: input.ownerEmail.trim().toLowerCase(),
      city: input.city ?? null,
      country: input.country ?? "FR",
      currency: input.currency ?? "EUR",
      timezone: input.timezone ?? "Europe/Paris",
      locale: "fr",
      bookingMode: "DEMO", // par défaut en démo tant que non converti en LIVE
      noindex: true, // pas d'indexation d'une entreprise beta
    })
    .returning({ id: companies.id })

  const companyId = company.id

  // 2) Réglages métier par défaut.
  await db.insert(settingsTable).values({ companyId, businessName: input.name.trim() })

  // 3) Horaires par défaut.
  await db.insert(businessHours).values(
    DEFAULT_HOURS.map((h) => ({ companyId, ...h })),
  )

  // 4) Compte propriétaire + rattachement OWNER.
  const owner = await ensureOwnerAccount(input.ownerEmail, input.ownerName)
  await db
    .insert(companyMembers)
    .values({ companyId, userId: owner.userId, role: "OWNER" })
    .onConflictDoNothing()

  // 4bis) Email d'invitation au propriétaire (uniquement si nouveau compte).
  // sendEmail ne lève jamais : un échec d'email ne casse pas le provisionnement.
  if (owner.created && owner.tempPassword) {
    const ownerEmail = input.ownerEmail.trim().toLowerCase()
    const { subject, html } = ownerInvitationEmail({
      ownerName: input.ownerName,
      businessName: input.name.trim(),
      loginUrl: `${publicBaseUrl()}/admin/login`,
      email: ownerEmail,
      tempPassword: owner.tempPassword,
    })
    await sendEmail({ to: ownerEmail, subject, html, fromName: input.name.trim() })
  }

  // 5) Données de démonstration (optionnel).
  if (input.withDemo) {
    await seedDemoCompany(companyId)
  }

  return {
    companyId,
    slug,
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    tempPassword: owner.tempPassword,
    ownerCreated: owner.created,
  }
}

/* -------------------------------------------------------------------------- */
/*  Données de démonstration                                                   */
/* -------------------------------------------------------------------------- */

const DEMO_VEHICLE_TYPES = [
  { name: "Citadine", slug: "citadine", sortOrder: 1 },
  { name: "Berline", slug: "berline", sortOrder: 2 },
  { name: "SUV / 4x4", slug: "suv", sortOrder: 3 },
  { name: "Utilitaire", slug: "utilitaire", sortOrder: 4 },
]

const DEMO_SERVICES = [
  { name: "Lavage Premium Extérieur", slug: "lavage-premium", base: 4900, dur: 60 },
  { name: "Nettoyage Intérieur Complet", slug: "interieur-complet", base: 7900, dur: 90 },
  { name: "Detailing Intégral", slug: "detailing-integral", base: 19900, dur: 240 },
]

const DEMO_OPTIONS = [
  { name: "Traitement cuir", slug: "traitement-cuir", price: 2900, dur: 30 },
  { name: "Lustrage jantes", slug: "lustrage-jantes", price: 1900, dur: 20 },
  { name: "Désinfection ozone", slug: "desinfection-ozone", price: 3900, dur: 30 },
]

const DEMO_CUSTOMERS = [
  { name: "Julien Marchand", email: "julien.demo@example.com", phone: "0610000001", city: "Lyon", brand: "Peugeot", model: "308", plate: "AB-123-CD" },
  { name: "Sophie Lefevre", email: "sophie.demo@example.com", phone: "0610000002", city: "Villeurbanne", brand: "Renault", model: "Clio", plate: "EF-456-GH" },
  { name: "Marc Dubois", email: "marc.demo@example.com", phone: "0610000003", city: "Bron", brand: "BMW", model: "X3", plate: "IJ-789-KL" },
  { name: "Amélie Roux", email: "amelie.demo@example.com", phone: "0610000004", city: "Écully", brand: "Audi", model: "A4", plate: "MN-012-OP" },
]

/** Renvoie une date (YYYY-MM-DD) décalée de `offsetDays` par rapport à aujourd'hui. */
function dateOffset(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

/**
 * Peuple une entreprise avec un catalogue et des réservations de démonstration.
 * TOUTES les réservations sont marquées `isDemoData=true` pour un nettoyage
 * sélectif avant passage en production. Idempotent par slug (onConflictDoNothing).
 */
export async function seedDemoCompany(companyId: number): Promise<void> {
  // Catégorie.
  const [category] = await db
    .insert(serviceCategories)
    .values({ companyId, name: "Prestations", slug: "prestations", sortOrder: 1 })
    .onConflictDoNothing()
    .returning({ id: serviceCategories.id })

  // Types de véhicules.
  const vtRows = await db
    .insert(vehicleTypes)
    .values(DEMO_VEHICLE_TYPES.map((v) => ({ companyId, ...v })))
    .onConflictDoNothing()
    .returning({ id: vehicleTypes.id, slug: vehicleTypes.slug })

  // Services.
  const svcRows = await db
    .insert(services)
    .values(
      DEMO_SERVICES.map((s) => ({
        companyId,
        categoryId: category?.id ?? null,
        name: s.name,
        slug: s.slug,
        basePriceCents: s.base,
        durationMin: s.dur,
        sortOrder: DEMO_SERVICES.indexOf(s) + 1,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: services.id, slug: services.slug, base: services.basePriceCents, dur: services.durationMin })

  // Tarifs par type de véhicule (majoration progressive selon le gabarit).
  const vtMultiplier: Record<string, number> = { citadine: 1, berline: 1.2, suv: 1.4, utilitaire: 1.6 }
  const priceRows: Array<{ serviceId: number; vehicleTypeId: number; priceCents: number; durationMin: number }> = []
  for (const svc of svcRows) {
    for (const vt of vtRows) {
      const mult = vtMultiplier[vt.slug] ?? 1
      priceRows.push({
        serviceId: svc.id,
        vehicleTypeId: vt.id,
        priceCents: Math.round((svc.base * mult) / 100) * 100,
        durationMin: svc.dur,
      })
    }
  }
  if (priceRows.length) await db.insert(servicePrices).values(priceRows).onConflictDoNothing()

  // Options.
  await db
    .insert(options)
    .values(DEMO_OPTIONS.map((o, i) => ({ companyId, name: o.name, slug: o.slug, priceCents: o.price, durationMin: o.dur, sortOrder: i + 1 })))
    .onConflictDoNothing()

  // Réservations de démonstration variées (passées, à venir, statuts divers).
  const statuses: Array<{ status: string; offset: number }> = [
    { status: "completed", offset: -21 },
    { status: "completed", offset: -12 },
    { status: "confirmed", offset: 2 },
    { status: "confirmed", offset: 5 },
    { status: "pending_deposit", offset: 8 },
    { status: "cancelled", offset: -3 },
  ]

  for (let i = 0; i < statuses.length; i++) {
    const { status, offset } = statuses[i]
    const cust = DEMO_CUSTOMERS[i % DEMO_CUSTOMERS.length]
    const svc = svcRows[i % svcRows.length]
    const vt = vtRows[i % vtRows.length]
    const price = svc.base
    const deposit = Math.round(price * 0.3)

    const [booking] = await db
      .insert(bookings)
      .values({
        companyId,
        reference: `DEMO-${companyId}-${1000 + i}`,
        isDemoData: true,
        customerName: cust.name,
        customerEmail: cust.email,
        customerPhone: cust.phone,
        address: `${10 + i} rue de la Démo, ${cust.city}`,
        servicesCents: price,
        subtotalCents: price,
        totalCents: price,
        depositCents: deposit,
        date: dateOffset(offset),
        startTime: "10:00",
        endTime: "12:00",
        totalDurationMin: svc.dur,
        status,
      })
      .onConflictDoNothing()
      .returning({ id: bookings.id })

    if (booking) {
      await db.insert(bookingItems).values({
        bookingId: booking.id,
        serviceId: svc.id,
        serviceName: DEMO_SERVICES.find((s) => s.slug === svc.slug)?.name ?? "Prestation",
        vehicleTypeId: vt.id,
        vehicleTypeName: DEMO_VEHICLE_TYPES.find((v) => v.slug === vt.slug)?.name ?? "Véhicule",
        vehicleBrand: cust.brand,
        vehicleModel: cust.model,
        vehiclePlate: cust.plate,
        priceCents: price,
        durationMin: svc.dur,
      })
    }
  }
}

/**
 * Supprime UNIQUEMENT les données fictives (`isDemoData=true`) d'une entreprise.
 * Conserve branding, prestations, tarifs, horaires, réglages et le compte owner.
 * Renvoie le nombre de réservations de démo supprimées.
 */
export async function removeDemoData(companyId: number): Promise<number> {
  // Récupère les réservations de démo de CETTE entreprise (scopé companyId).
  const demoBookings = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.companyId, companyId), eq(bookings.isDemoData, true)))

  if (!demoBookings.length) return 0

  // Suppression des lignes enfants puis des réservations.
  for (const b of demoBookings) {
    await db.delete(bookingItems).where(eq(bookingItems.bookingId, b.id))
  }
  await db
    .delete(bookings)
    .where(and(eq(bookings.companyId, companyId), eq(bookings.isDemoData, true)))

  return demoBookings.length
}
