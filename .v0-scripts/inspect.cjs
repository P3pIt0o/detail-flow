const { Pool } = require("pg")
const cs = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_POSTGRES_URL
const pool = new Pool({ connectionString: cs })
;(async () => {
  const { rows } = await pool.query(
    `select id, slug, name, status, "customSiteKey", "licensePlan", "bookingMode" from companies order by id`
  )
  console.log("count:", rows.length)
  for (const r of rows) console.log(JSON.stringify(r))
  await pool.end()
})().catch((e) => { console.error("ERR", e.message); process.exit(1) })
