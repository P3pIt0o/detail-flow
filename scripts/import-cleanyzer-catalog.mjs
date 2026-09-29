/**
 * Import idempotent du catalogue Cleanyzer (tenant existant `cleanyzer`).
 *
 *   Aperçu (aucune écriture) :
 *     node --env-file=.env.production.local scripts/import-cleanyzer-catalog.mjs
 *   Application :
 *     node --env-file=.env.production.local scripts/import-cleanyzer-catalog.mjs --apply
 *
 * Règles :
 * - ne crée aucun tenant, aucun gabarit : réutilise les 3 types de véhicule
 *   actifs existants (ordre sortOrder = petit → grand) et s'arrête sinon ;
 * - upsert par slug : jamais de doublon, relançable sans effet de bord ;
 * - ne touche jamais aux durées existantes (Tom les règle dans son admin) ;
 * - les tarifs « sur mesure » et les fourchettes ne reçoivent AUCUN prix
 *   inventé : prestation masquée du configurateur, tarif affiché en description ;
 * - le textile reste hors configurateur : type de demande personnalisée.
 */
import pg from "pg"

const APPLY = process.argv.includes("--apply")
const TENANT_SLUG = "cleanyzer"

const CATEGORIES = [
  { slug: "nettoyage-interieur", name: "Nettoyage intérieur", sortOrder: 1 },
  { slug: "nettoyage-exterieur", name: "Nettoyage extérieur", sortOrder: 2 },
]

// prices = [gabarit 1, gabarit 2, gabarit 3] en euros ; null = sur mesure.
const SERVICES = [
  { category: "nettoyage-interieur", slug: "interieur-eco", name: "Intérieur — Formule Éco", prices: [50, 60, 75] },
  { category: "nettoyage-interieur", slug: "interieur-premium", name: "Intérieur — Formule Premium", prices: [80, 95, 120] },
  { category: "nettoyage-interieur", slug: "interieur-excellence", name: "Intérieur — Formule Excellence", prices: [115, 135, 160] },
  { category: "nettoyage-interieur", slug: "interieur-diamond", name: "Intérieur — Formule Diamond", prices: null },
  { category: "nettoyage-exterieur", slug: "exterieur-eco", name: "Extérieur — Formule Éco", prices: [30, 40, 50] },
  { category: "nettoyage-exterieur", slug: "exterieur-excellence", name: "Extérieur — Formule Excellence", prices: [50, 65, 80] },
  { category: "nettoyage-exterieur", slug: "exterieur-diamond", name: "Extérieur — Formule Diamond", prices: null },
]

// price = euros fixes ; quote = libellé affiché quand le prix n'est pas fixe.
const OPTIONS = [
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

const TEXTILE_REQUEST_TYPE = {
  key: "textile",
  label: "Nettoyage textile (canapés)",
  description:
    "Canapé 2/3 places : 80 € · 3/4 places : 110 € · 5 places et + : à partir de 150 €. Options : cuir +15 €/place, imperméabilisation +10 €/place.",
  enabled: true,
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("DATABASE_URL manquant.")
  process.exit(1)
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
const report = []
const log = (line) => report.push(line)

try {
  await client.query("BEGIN")

  const { rows: [company] } = await client.query(
    `SELECT id, "siteContent" FROM companies WHERE slug = $1`,
    [TENANT_SLUG],
  )
  if (!company) throw new Error(`Tenant "${TENANT_SLUG}" introuvable — aucun tenant n'est créé par ce script.`)

  const { rows: vehicleTypes } = await client.query(
    `SELECT id, name FROM vehicle_types WHERE "companyId" = $1 AND active = true ORDER BY "sortOrder", id`,
    [company.id],
  )
  if (vehicleTypes.length !== 3) {
    throw new Error(
      `3 gabarits actifs attendus, ${vehicleTypes.length} trouvés (${vehicleTypes.map((v) => v.name).join(", ")}). ` +
        "Vérifier les gabarits dans l'admin avant import.",
    )
  }
  log(`Gabarits : ${vehicleTypes.map((v, i) => `${i + 1}=${v.name}`).join(" · ")}`)

  const categoryIds = {}
  for (const c of CATEGORIES) {
    const { rows: [row] } = await client.query(
      `INSERT INTO service_categories ("companyId", name, slug, "sortOrder")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("companyId", slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, (xmax = 0) AS inserted`,
      [company.id, c.name, c.slug, c.sortOrder],
    )
    categoryIds[c.slug] = row.id
    log(`Catégorie ${c.name} : ${row.inserted ? "créée" : "à jour"}`)
  }

  for (const [index, s] of SERVICES.entries()) {
    const custom = s.prices === null
    const { rows: [row] } = await client.query(
      `INSERT INTO services ("companyId", "categoryId", name, slug, description, "basePriceCents", "sortOrder", visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ("companyId", slug) DO UPDATE SET
         "categoryId" = EXCLUDED."categoryId", name = EXCLUDED.name,
         "basePriceCents" = EXCLUDED."basePriceCents",
         description = COALESCE(services.description, EXCLUDED.description),
         visible = EXCLUDED.visible
       RETURNING id, (xmax = 0) AS inserted`,
      [
        company.id,
        categoryIds[s.category],
        s.name,
        s.slug,
        custom ? "Tarif sur mesure — sur devis." : null,
        custom ? 0 : s.prices[0] * 100,
        index + 1,
        !custom,
      ],
    )

    if (!custom) {
      for (const [i, vt] of vehicleTypes.entries()) {
        const priceCents = s.prices[i] * 100
        const { rowCount } = await client.query(
          `UPDATE service_prices SET "priceCents" = $3 WHERE "serviceId" = $1 AND "vehicleTypeId" = $2`,
          [row.id, vt.id, priceCents],
        )
        if (rowCount === 0) {
          await client.query(
            `INSERT INTO service_prices ("serviceId", "vehicleTypeId", "priceCents") VALUES ($1, $2, $3)`,
            [row.id, vt.id, priceCents],
          )
        }
      }
    }
    log(`Prestation ${s.name} : ${row.inserted ? "créée" : "à jour"} — ${custom ? "sur mesure (hors configurateur)" : s.prices.join(" / ") + " €"}`)
  }

  for (const [index, o] of OPTIONS.entries()) {
    const fixed = typeof o.price === "number"
    const description = o.quote ?? o.description ?? (o.unit ? `${o.price} € par ${o.unit}` : null)
    const { rows: [row] } = await client.query(
      `INSERT INTO options ("companyId", name, slug, description, "priceCents", "sortOrder", visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("companyId", slug) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         "priceCents" = EXCLUDED."priceCents", visible = EXCLUDED.visible
       RETURNING (xmax = 0) AS inserted`,
      [company.id, o.name, o.slug, description, fixed ? o.price * 100 : 0, index + 1, fixed],
    )
    log(`Option ${o.name} : ${row.inserted ? "créée" : "à jour"} — ${fixed ? `${o.price} €${o.unit ? ` / ${o.unit}` : ""}` : "sur devis (masquée)"}`)
  }

  const siteContent = company.siteContent ?? {}
  const customRequests = siteContent.customRequests ?? { enabled: true, types: [] }
  const types = Array.isArray(customRequests.types) ? customRequests.types.filter((t) => t?.key !== "textile") : []
  const nextSiteContent = {
    ...siteContent,
    customRequests: { ...customRequests, enabled: true, types: [...types, TEXTILE_REQUEST_TYPE] },
  }
  await client.query(`UPDATE companies SET "siteContent" = $2::jsonb, "updatedAt" = now() WHERE id = $1`, [
    company.id,
    JSON.stringify(nextSiteContent),
  ])
  log("Demande personnalisée « Nettoyage textile » : configurée (hors configurateur auto)")

  await client.query(APPLY ? "COMMIT" : "ROLLBACK")
  console.log(report.join("\n"))
  console.log(APPLY ? "\nImport appliqué." : "\nAperçu uniquement (ROLLBACK). Relancer avec --apply pour écrire.")
} catch (error) {
  await client.query("ROLLBACK")
  console.error(`Import annulé : ${error.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
