import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

// TEMPORAIRE / LECTURE SEULE — protégé par CRON_SECRET. À supprimer après usage.
// Objectif: identifier la base connectée + localiser le champ contenant la
// phrase du module devis pour le tenant spirit-acs. N'écrit rien.
export const dynamic = "force-dynamic"

const NEEDLES = ["offre adapt", "Décrivez votre", "revenons vers vous", "une offre"]

function walk(node: unknown, path: string, hits: { path: string; value: string }[]) {
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
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, hits)
    }
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // Colonnes texte candidates + siteContent (jsonb) pour spirit-acs uniquement.
  const rows = (
    await db.execute(sql`
      SELECT id, slug, name, "heroTitle", "heroHighlight", "heroSubtitle",
             "licensePlan", "siteContent"
      FROM companies
      WHERE slug = 'spirit-acs'
    `)
  ).rows as Record<string, unknown>[]

  if (rows.length !== 1) {
    return NextResponse.json({ error: "expected exactly 1 spirit-acs row", count: rows.length }, { status: 409 })
  }
  const row = rows[0]

  const hits: { path: string; value: string }[] = []
  for (const col of ["heroTitle", "heroHighlight", "heroSubtitle"]) {
    if (typeof row[col] === "string") walk(row[col], col, hits)
  }
  walk(row.siteContent, "siteContent", hits)

  // Info d'identification de base (prod a licensePlan renseigné en principe).
  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL || "").hostname.slice(0, 10) + "…"
    } catch {
      return "n/a"
    }
  })()

  return NextResponse.json({
    id: row.id,
    slug: row.slug,
    name: row.name,
    licensePlan: row.licensePlan ?? null,
    dbHost,
    hits,
  })
}
