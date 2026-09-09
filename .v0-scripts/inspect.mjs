import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL)
const rows = await sql`select id, slug, name, status, "customSiteKey", "bookingMode", "licensePlan" from companies order by id`
console.log("count:", rows.length)
for (const r of rows) console.log(JSON.stringify(r))
