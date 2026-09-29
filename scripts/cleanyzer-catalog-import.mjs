/**
 * Initialisation du catalogue Cleanyzer — cœur testable.
 *
 * Principe : CREATE IF MISSING / PRESERVE IF EXISTING.
 * Le script INITIALISE le catalogue ; ensuite la base (admin DetailFlow de Tom)
 * est l'unique source de vérité. Une ligne existante n'est JAMAIS modifiée.
 *
 * Dry-run et --apply exécutent exactement le même code, dans une transaction ;
 * seule la fin diffère : ROLLBACK (dry-run, ou SAFE TO APPLY = NO) / COMMIT.
 *
 * `client.query(text, params)` doit renvoyer `{ rows }` (pg.Client / PGlite).
 */

export const TENANT_SLUG = "cleanyzer"

export const CATEGORIES = [
  { slug: "nettoyage-interieur", name: "Nettoyage intérieur", sortOrder: 1 },
  { slug: "nettoyage-exterieur", name: "Nettoyage extérieur", sortOrder: 2 },
]

// prices = [gabarit 1, gabarit 2, gabarit 3] en euros ; null = aucun prix fixe.
export const SERVICES = [
  { category: "nettoyage-interieur", slug: "interieur-eco", name: "Intérieur — Formule Éco", prices: [50, 60, 75] },
  { category: "nettoyage-interieur", slug: "interieur-premium", name: "Intérieur — Formule Premium", prices: [80, 95, 120] },
  { category: "nettoyage-interieur", slug: "interieur-excellence", name: "Intérieur — Formule Excellence", prices: [115, 135, 160] },
  { category: "nettoyage-interieur", slug: "interieur-diamond", name: "Intérieur — Formule Diamond", prices: null },
  { category: "nettoyage-exterieur", slug: "exterieur-eco", name: "Extérieur — Formule Éco", prices: [30, 40, 50] },
  { category: "nettoyage-exterieur", slug: "exterieur-excellence", name: "Extérieur — Formule Excellence", prices: [50, 65, 80] },
  { category: "nettoyage-exterieur", slug: "exterieur-diamond", name: "Extérieur — Formule Diamond", prices: null },
]

// price = euros fixes · unit = tarif à l'unité (quantité non supportée) · quote = pas de prix fixe.
export const OPTIONS = [
  { slug: "ozone", name: "Ozone", price: 49 },
  { slug: "vapeur", name: "Vapeur", price: 40 },
  { slug: "duo-ozone-vapeur", name: "Duo", price: 75, description: "75 € au lieu de 89 €" },
  { slug: "desinfection", name: "Désinfection", price: 40 },
  { slug: "vitres", name: "Vitres", price: 15 },
  { slug: "shampoing-moquettes", name: "Shampoing moquettes", price: 49 },
  { slug: "tapis", name: "Tapis", price: 5, unit: "tapis" },
  { slug: "coffre", name: "Coffre", price: 10 },
  { slug: "sieges", name: "Sièges", price: 15, unit: "siège" },
  { slug: "complete", name: "Complète", price: 85 },
  { slug: "vomi", name: "Vomi", price: 69 },
  { slug: "rails-regraissage", name: "Rails / regraissage", price: 35 },
  { slug: "demontage-sieges", name: "Démontage des sièges", price: 25 },
  { slug: "vehicule-sale", name: "Véhicule sale", price: 39 },
  { slug: "vehicule-tres-sale", name: "Véhicule très sale", price: 79 },
  { slug: "incruste", name: "Incrusté", price: 35 },
  { slug: "capote", name: "Capote", quote: "75 € ou 100 € selon la capote — sur devis" },
  { slug: "duo-capote", name: "Duo capote", price: 150, description: "150 € au lieu de 175 €" },
  { slug: "ceramique-hybride", name: "Céramique hybride", price: 65 },
  { slug: "plastiques", name: "Plastiques", quote: "De 30 à 70 € — sur devis" },
  { slug: "optiques", name: "Optiques", price: 65 },
  { slug: "revernissage", name: "Revernissage", quote: "De 50 à 200 € — sur devis" },
]

export const TEXTILE_REQUEST_TYPE = {
  key: "textile",
  label: "Nettoyage textile (canapés)",
  description:
    "Canapé 2/3 places : 80 € · 3/4 places : 110 € · 5 places et + : à partir de 150 €. Options : cuir +15 €/place, imperméabilisation +10 €/place.",
  enabled: true,
}

export const UNPRICED_SERVICE_DESCRIPTION = "Tarif sur mesure — sur devis."

export function perUnitOptionDescription(o) {
  return (
    `Tarif à l'unité : ${o.price} € par ${o.unit}. ` +
    "MASQUÉE : la réservation en ligne ne gère pas encore la quantité " +
    `(plusieurs ${o.unit} seraient facturés ${o.price} € au total). ` +
    "Ne pas rendre visible tant que la quantité n'est pas supportée."
  )
}

/** Comment une option du catalogue est initialisée (aucun prix inventé). */
export function optionPlan(o) {
  if (o.unit) return { priceCents: o.price * 100, visible: false, description: perUnitOptionDescription(o) }
  if (typeof o.price === "number") return { priceCents: o.price * 100, visible: true, description: o.description ?? null }
  return { priceCents: null, visible: false, description: o.quote }
}

const normName = (s) => String(s ?? "").trim().toLowerCase()

async function hashesByCompany(client, excludeId) {
  const q = async (text) => (await client.query(text, [excludeId])).rows
  const parts = await Promise.all([
    q(`SELECT id AS cid, md5(t::text) AS h FROM companies t WHERE id <> $1`),
    q(`SELECT "companyId" AS cid, md5(string_agg(t::text, '|' ORDER BY t.id)) AS h FROM service_categories t WHERE "companyId" <> $1 GROUP BY 1`),
    q(`SELECT "companyId" AS cid, md5(string_agg(t::text, '|' ORDER BY t.id)) AS h FROM services t WHERE "companyId" <> $1 GROUP BY 1`),
    q(`SELECT "companyId" AS cid, md5(string_agg(t::text, '|' ORDER BY t.id)) AS h FROM options t WHERE "companyId" <> $1 GROUP BY 1`),
    q(`SELECT "companyId" AS cid, md5(string_agg(t::text, '|' ORDER BY t.id)) AS h FROM vehicle_types t WHERE "companyId" <> $1 GROUP BY 1`),
    q(`SELECT s."companyId" AS cid, md5(string_agg(sp::text, '|' ORDER BY sp.id)) AS h
       FROM service_prices sp JOIN services s ON s.id = sp."serviceId" WHERE s."companyId" <> $1 GROUP BY 1`),
  ])
  const map = new Map()
  parts.forEach((rows, i) => {
    for (const r of rows) map.set(`${i}:${r.cid}`, r.h)
  })
  return map
}

async function ownRowHashes(client, companyId) {
  const q = async (table, text) =>
    (await client.query(text, [companyId])).rows.map((r) => [`${table}:${r.id}`, r.h])
  const rows = (
    await Promise.all([
      q("service_categories", `SELECT id, md5(t::text) AS h FROM service_categories t WHERE "companyId" = $1`),
      q("services", `SELECT id, md5(t::text) AS h FROM services t WHERE "companyId" = $1`),
      q("options", `SELECT id, md5(t::text) AS h FROM options t WHERE "companyId" = $1`),
      q("vehicle_types", `SELECT id, md5(t::text) AS h FROM vehicle_types t WHERE "companyId" = $1`),
      q(
        "service_prices",
        `SELECT sp.id, md5(sp::text) AS h FROM service_prices sp JOIN services s ON s.id = sp."serviceId" WHERE s."companyId" = $1`,
      ),
      q(
        "companies",
        `SELECT id, md5((to_jsonb(t) - 'siteContent' - 'updatedAt')::text) AS h FROM companies t WHERE id = $1`,
      ),
    ])
  ).flat()
  return new Map(rows)
}

/** Types de demande « textile » à ajouter, en préservant la configuration existante. */
export function planTextile(siteContent) {
  const content = siteContent && typeof siteContent === "object" ? siteContent : {}
  const current = content.customRequests
  if (!current || typeof current !== "object") {
    return {
      status: "créée",
      next: { ...content, customRequests: { enabled: true, types: [TEXTILE_REQUEST_TYPE] } },
      warning: null,
    }
  }
  const types = Array.isArray(current.types) ? current.types : []
  if (types.some((t) => t?.key === TEXTILE_REQUEST_TYPE.key)) {
    return { status: "existante préservée", next: null, warning: null }
  }
  return {
    status: "type ajouté",
    next: { ...content, customRequests: { ...current, types: [...types, TEXTILE_REQUEST_TYPE] } },
    warning:
      current.enabled === false
        ? "Demandes personnalisées désactivées dans l'admin du tenant : le type textile est ajouté mais le parcours reste inactif tant que Tom ne l'active pas."
        : null,
  }
}

export async function runCleanyzerImport(client, { apply = false } = {}) {
  const result = {
    apply,
    tenant: null,
    vehicleTypes: [],
    categories: { existing: 0, preserved: [], toCreate: [] },
    services: { existing: 0, preserved: [], toCreate: [], unpriced: [] },
    options: { existing: 0, preserved: [], toCreate: [], hiddenPerUnit: [], hiddenQuote: [] },
    servicePricesToCreate: 0,
    textile: null,
    totalRows: 0,
    protections: { overwritten: 0, otherCompaniesTouched: 0, tenantCreated: false, deleted: 0 },
    blockers: [],
    warnings: [],
    safe: false,
    committed: false,
  }

  await client.query("BEGIN")
  try {
    const { rows: matches } = await client.query(
      `SELECT id, name, slug, status, "siteContent" FROM companies WHERE lower(trim(slug)) = $1`,
      [TENANT_SLUG],
    )
    if (matches.length === 0) result.blockers.push(`Tenant "${TENANT_SLUG}" introuvable (aucun tenant n'est créé).`)
    if (matches.length > 1) result.blockers.push(`${matches.length} entreprises correspondent à "${TENANT_SLUG}" : ambigu.`)
    const company = matches.length === 1 ? matches[0] : null
    if (company && company.slug !== TENANT_SLUG) result.blockers.push(`Slug incohérent : "${company.slug}".`)
    if (company && !(Number.isInteger(company.id) && company.id > 0)) result.blockers.push("company_id invalide.")

    if (result.blockers.length > 0 || !company) return await finish(client, result)
    result.tenant = { id: company.id, name: company.name, slug: company.slug, status: company.status }
    const cid = company.id

    const { rows: vehicleTypes } = await client.query(
      `SELECT id, name, "companyId" FROM vehicle_types WHERE "companyId" = $1 AND active = true ORDER BY "sortOrder", id`,
      [cid],
    )
    result.vehicleTypes = vehicleTypes.map((v) => v.name)
    if (vehicleTypes.length !== 3) {
      result.blockers.push(`3 gabarits actifs attendus, ${vehicleTypes.length} trouvé(s).`)
      return await finish(client, result)
    }

    const load = async (table) =>
      (await client.query(`SELECT id, slug, name, "companyId" FROM ${table} WHERE "companyId" = $1`, [cid])).rows
    const [existingCats, existingServices, existingOptions] = await Promise.all([
      load("service_categories"),
      load("services"),
      load("options"),
    ])
    result.categories.existing = existingCats.length
    result.services.existing = existingServices.length
    result.options.existing = existingOptions.length

    const detectAmbiguity = (label, items, existing) => {
      const bySlug = new Map(existing.map((r) => [r.slug, r]))
      const toCreate = []
      const preserved = []
      for (const item of items) {
        if (bySlug.has(item.slug)) {
          preserved.push(item.name)
          continue
        }
        const clash = existing.find((r) => normName(r.name) === normName(item.name))
        if (clash) {
          result.blockers.push(
            `${label} « ${item.name} » : une ligne existante porte ce nom avec un autre slug (« ${clash.slug} ») — doublon ambigu.`,
          )
          continue
        }
        toCreate.push(item)
      }
      return { toCreate, preserved, bySlug }
    }

    const cats = detectAmbiguity("Catégorie", CATEGORIES, existingCats)
    const svc = detectAmbiguity("Prestation", SERVICES, existingServices)
    const opt = detectAmbiguity("Option", OPTIONS, existingOptions)
    result.categories.preserved = cats.preserved
    result.categories.toCreate = cats.toCreate.map((c) => c.name)
    result.services.preserved = svc.preserved
    result.services.toCreate = svc.toCreate.map((s) => s.name)
    result.services.unpriced = svc.toCreate.filter((s) => s.prices === null).map((s) => s.name)
    result.options.preserved = opt.preserved
    result.options.toCreate = opt.toCreate.map((o) => o.name)
    result.options.hiddenPerUnit = opt.toCreate.filter((o) => o.unit).map((o) => o.name)
    result.options.hiddenQuote = opt.toCreate.filter((o) => !o.unit && typeof o.price !== "number").map((o) => o.name)

    if (result.blockers.length > 0) return await finish(client, result)

    const beforeOthers = await hashesByCompany(client, cid)
    const beforeOwn = await ownRowHashes(client, cid)
    const { rows: [{ n: companiesBefore }] } = await client.query(`SELECT count(*)::int AS n FROM companies`)
    let rowsWritten = 0

    const categoryIds = Object.fromEntries(existingCats.map((c) => [c.slug, c.id]))
    for (const c of cats.toCreate) {
      const { rows } = await client.query(
        `INSERT INTO service_categories ("companyId", name, slug, "sortOrder") VALUES ($1, $2, $3, $4)
         ON CONFLICT ("companyId", slug) DO NOTHING RETURNING id, "companyId"`,
        [cid, c.name, c.slug, c.sortOrder],
      )
      if (rows.length !== 1 || rows[0].companyId !== cid) throw new Error(`Création catégorie ${c.slug} inattendue.`)
      categoryIds[c.slug] = rows[0].id
      rowsWritten += 1
    }

    for (const s of svc.toCreate) {
      const unpriced = s.prices === null
      const sortOrder = SERVICES.indexOf(s) + 1
      // Durée non fournie : colonne omise => défaut de la base (identique à une saisie manuelle dans l'admin).
      // Aucun prix : basePriceCents omis (défaut de la base) et prestation masquée du booking.
      const { rows } = unpriced
        ? await client.query(
            `INSERT INTO services ("companyId", "categoryId", name, slug, description, "sortOrder", visible)
             VALUES ($1, $2, $3, $4, $5, $6, false)
             ON CONFLICT ("companyId", slug) DO NOTHING RETURNING id, "companyId"`,
            [cid, categoryIds[s.category] ?? null, s.name, s.slug, UNPRICED_SERVICE_DESCRIPTION, sortOrder],
          )
        : await client.query(
            `INSERT INTO services ("companyId", "categoryId", name, slug, "basePriceCents", "sortOrder", visible)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             ON CONFLICT ("companyId", slug) DO NOTHING RETURNING id, "companyId"`,
            [cid, categoryIds[s.category] ?? null, s.name, s.slug, s.prices[0] * 100, sortOrder],
          )
      if (rows.length !== 1 || rows[0].companyId !== cid) throw new Error(`Création prestation ${s.slug} inattendue.`)
      rowsWritten += 1
      if (unpriced) continue
      for (const [i, vt] of vehicleTypes.entries()) {
        if (vt.companyId !== cid) throw new Error("Gabarit hors tenant détecté.")
        await client.query(
          `INSERT INTO service_prices ("serviceId", "vehicleTypeId", "priceCents") VALUES ($1, $2, $3)`,
          [rows[0].id, vt.id, s.prices[i] * 100],
        )
        rowsWritten += 1
        result.servicePricesToCreate += 1
      }
    }

    for (const o of opt.toCreate) {
      const plan = optionPlan(o)
      const sortOrder = OPTIONS.indexOf(o) + 1
      const { rows } =
        plan.priceCents === null
          ? await client.query(
              `INSERT INTO options ("companyId", name, slug, description, "sortOrder", visible)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT ("companyId", slug) DO NOTHING RETURNING id, "companyId"`,
              [cid, o.name, o.slug, plan.description, sortOrder, plan.visible],
            )
          : await client.query(
              `INSERT INTO options ("companyId", name, slug, description, "priceCents", "sortOrder", visible)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT ("companyId", slug) DO NOTHING RETURNING id, "companyId"`,
              [cid, o.name, o.slug, plan.description, plan.priceCents, sortOrder, plan.visible],
            )
      if (rows.length !== 1 || rows[0].companyId !== cid) throw new Error(`Création option ${o.slug} inattendue.`)
      rowsWritten += 1
    }

    const textile = planTextile(company.siteContent)
    result.textile = textile.status
    if (textile.warning) result.warnings.push(textile.warning)
    if (textile.next) {
      await client.query(`UPDATE companies SET "siteContent" = $2::jsonb, "updatedAt" = now() WHERE id = $1`, [
        cid,
        JSON.stringify(textile.next),
      ])
      rowsWritten += 1
    }
    result.totalRows = rowsWritten

    const afterOthers = await hashesByCompany(client, cid)
    const touched = new Set()
    for (const key of new Set([...beforeOthers.keys(), ...afterOthers.keys()])) {
      if (beforeOthers.get(key) !== afterOthers.get(key)) touched.add(key.split(":")[1])
    }
    result.protections.otherCompaniesTouched = touched.size

    const afterOwn = await ownRowHashes(client, cid)
    for (const [key, hash] of beforeOwn) {
      if (!afterOwn.has(key)) result.protections.deleted += 1
      else if (afterOwn.get(key) !== hash) result.protections.overwritten += 1
    }
    const { rows: [{ n: companiesAfter }] } = await client.query(`SELECT count(*)::int AS n FROM companies`)
    result.protections.tenantCreated = companiesAfter !== companiesBefore

    if (result.protections.otherCompaniesTouched !== 0) result.blockers.push("Autre company_id touché.")
    if (result.protections.overwritten !== 0) result.blockers.push("Donnée existante écrasée.")
    if (result.protections.deleted !== 0) result.blockers.push("Donnée supprimée.")
    if (result.protections.tenantCreated) result.blockers.push("Nombre d'entreprises modifié.")

    return await finish(client, result)
  } catch (error) {
    result.blockers.push(`Erreur : ${error.message}`)
    return await finish(client, result)
  }
}

async function finish(client, result) {
  result.safe = result.blockers.length === 0
  if (result.apply && result.safe) {
    await client.query("COMMIT")
    result.committed = true
  } else {
    await client.query("ROLLBACK")
  }
  return result
}

export function formatReport(r, { target } = {}) {
  const list = (items) => (items.length ? items.join(", ") : "—")
  const lines = []
  if (target) lines.push(`BASE CIBLÉE : ${target}`, "")
  lines.push("TENANT")
  lines.push(r.tenant ? `  nom : ${r.tenant.name}` : "  introuvable")
  if (r.tenant) lines.push(`  slug : ${r.tenant.slug}`, `  company_id : ${r.tenant.id}`, `  statut : ${r.tenant.status}`)
  lines.push(`  gabarits : ${list(r.vehicleTypes.map((v, i) => `${i + 1}=${v}`))}`, "")
  lines.push("CATALOGUE")
  lines.push(`  catégories existantes (tenant) : ${r.categories.existing}`)
  lines.push(`  catégories préservées : ${list(r.categories.preserved)}`)
  lines.push(`  catégories à créer : ${list(r.categories.toCreate)}`)
  lines.push(`  prestations existantes (tenant) : ${r.services.existing}`)
  lines.push(`  prestations existantes préservées : ${list(r.services.preserved)}`)
  lines.push(`  prestations à créer : ${list(r.services.toCreate)}`)
  lines.push(`    dont sans prix (masquées) : ${list(r.services.unpriced)}`)
  lines.push(`  tarifs par gabarit à créer : ${r.servicePricesToCreate}`)
  lines.push(`  options existantes (tenant) : ${r.options.existing}`)
  lines.push(`  options existantes préservées : ${list(r.options.preserved)}`)
  lines.push(`  options à créer : ${list(r.options.toCreate)}`)
  lines.push(`    dont masquées (quantité non supportée) : ${list(r.options.hiddenPerUnit)}`)
  lines.push(`    dont masquées (sans prix fixe) : ${list(r.options.hiddenQuote)}`)
  lines.push(`  demande textile : ${r.textile ?? "—"}`)
  lines.push(`  TOTAL lignes concernées : ${r.totalRows}`, "")
  lines.push("PROTECTIONS")
  lines.push(`  données existantes écrasées : ${r.protections.overwritten}`)
  lines.push(`  AUTRES COMPANY_ID TOUCHÉS : ${r.protections.otherCompaniesTouched}`)
  lines.push(`  tenant créé : ${r.protections.tenantCreated ? "OUI" : "NON"}`)
  lines.push(`  données supprimées : ${r.protections.deleted}`, "")
  for (const w of r.warnings) lines.push(`AVERTISSEMENT : ${w}`)
  for (const b of r.blockers) lines.push(`BLOCAGE : ${b}`)
  lines.push(`SAFE TO APPLY: ${r.safe ? "YES" : "NO"}`)
  lines.push(
    r.committed
      ? "Import appliqué (COMMIT)."
      : r.apply
        ? "Import NON appliqué (ROLLBACK) : SAFE TO APPLY = NO."
        : "Dry-run : aucune écriture (ROLLBACK). Relancer avec --apply uniquement si SAFE TO APPLY: YES.",
  )
  return lines.join("\n")
}
