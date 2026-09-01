// LECTURE SEULE — localise le champ contenant la phrase pour spirit-acs.
// Aucune écriture. Cherche récursivement dans companies.siteContent.
import pg from "pg"

const NEEDLES = ["offre adapt", "Décrivez votre", "revenons vers vous", "besoin."]

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

function walk(node, path, hits) {
  if (node == null) return
  if (typeof node === "string") {
    if (NEEDLES.some((n) => node.toLowerCase().includes(n.toLowerCase()))) {
      hits.push({ path, value: node })
    }
    return
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, hits))
    return
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, hits)
  }
}

const { rows } = await pool.query(
  "SELECT id, slug, name, \"siteContent\" FROM companies WHERE slug = $1",
  ["spirit-acs"],
)

if (rows.length === 0) {
  console.log("NO ROW for slug=spirit-acs")
} else {
  for (const r of rows) {
    console.log(`company id=${r.id} slug=${r.slug} name=${r.name}`)
    const hits = []
    walk(r.siteContent, "", hits)
    if (hits.length === 0) {
      console.log("  -> phrase NON trouvée dans siteContent")
      // Dump des sous-clés utiles pour comprendre la structure
      const sc = r.siteContent || {}
      console.log("  siteContent top-level keys:", Object.keys(sc))
      console.log("  customRequests:", JSON.stringify(sc.customRequests ?? null))
      console.log("  tagline:", JSON.stringify(sc.tagline ?? sc.footer ?? null))
    } else {
      for (const h of hits) console.log(`  FIELD [${h.path}] = ${JSON.stringify(h.value)}`)
    }
  }
}

await pool.end()
