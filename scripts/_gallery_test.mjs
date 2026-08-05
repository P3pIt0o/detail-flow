import pg from "pg"
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL })
await p.query(
  `INSERT INTO "beforeAfterGallery" ("companyId","beforeImageUrl","afterImageUrl","title","sortOrder") VALUES (14,'gallery/t14a-b.jpg','gallery/t14a-a.jpg','Rozan A',0),(14,'gallery/t14b-b.jpg','gallery/t14b-a.jpg','Rozan B',1),(15,'gallery/t15-b.jpg','gallery/t15-a.jpg','JustClean',0)`,
)
const t14 = (await p.query(`SELECT title FROM "beforeAfterGallery" WHERE "companyId"=14 ORDER BY "sortOrder"`)).rows.map((r) => r.title)
const t15 = (await p.query(`SELECT title FROM "beforeAfterGallery" WHERE "companyId"=15 ORDER BY "sortOrder"`)).rows.map((r) => r.title)
console.log("Tenant 14 (rozan) voit:", JSON.stringify(t14))
console.log("Tenant 15 (justclean) voit:", JSON.stringify(t15))
console.log("ISOLATION OK:", !t14.includes("JustClean") && !t15.includes("Rozan A") && !t15.includes("Rozan B"))
console.log("ORDRE 14 OK:", JSON.stringify(t14) === JSON.stringify(["Rozan A", "Rozan B"]))
// Test réordonnancement : inverser l'ordre pour tenant 14
const ids = (await p.query(`SELECT id FROM "beforeAfterGallery" WHERE "companyId"=14 ORDER BY "sortOrder"`)).rows.map((r) => r.id)
await p.query(`UPDATE "beforeAfterGallery" SET "sortOrder"=0 WHERE id=$1`, [ids[1]])
await p.query(`UPDATE "beforeAfterGallery" SET "sortOrder"=1 WHERE id=$1`, [ids[0]])
const t14b = (await p.query(`SELECT title FROM "beforeAfterGallery" WHERE "companyId"=14 ORDER BY "sortOrder"`)).rows.map((r) => r.title)
console.log("APRES REORDER 14:", JSON.stringify(t14b), "=> OK:", JSON.stringify(t14b) === JSON.stringify(["Rozan B", "Rozan A"]))
await p.end()
