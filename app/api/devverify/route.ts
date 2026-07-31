import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user as userTable, account as accountTable } from "@/lib/db/schema"
import { auth } from "@/lib/auth"

// ROUTE TEMPORAIRE DE VÉRIFICATION — à supprimer après les tests.
const SECRET = "verify-detailflow-2026"
const EMAIL = "verify-sa@detailflow.local"
const PASSWORD = "VerifyPass123!"

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") return new NextResponse("Not found", { status: 404 })
  const url = new URL(req.url)
  if (url.searchParams.get("secret") !== SECRET) return new NextResponse("Forbidden", { status: 403 })

  // 1) Upsert du super-admin jetable.
  const [existing] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, EMAIL)).limit(1)
  let userId = existing?.id
  const ctx = await auth.$context
  const hashed = await ctx.password.hash(PASSWORD)

  if (!userId) {
    userId = randomUUID()
    await db.insert(userTable).values({
      id: userId,
      name: "Verify SA",
      email: EMAIL,
      emailVerified: true,
      superAdmin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  } else {
    await db.update(userTable).set({ emailVerified: true, superAdmin: true }).where(eq(userTable.id, userId))
  }

  const [acc] = await db
    .select({ id: accountTable.id })
    .from(accountTable)
    .where(and(eq(accountTable.userId, userId), eq(accountTable.providerId, "credential")))
    .limit(1)
  if (acc) {
    await db.update(accountTable).set({ password: hashed }).where(eq(accountTable.id, acc.id))
  } else {
    await db.insert(accountTable).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashed,
    })
  }

  // 2) Connexion → récupère les cookies de session.
  const res = await auth.api.signInEmail({
    body: { email: EMAIL, password: PASSWORD },
    asResponse: true,
  })

  // 3) Redirige vers le super-admin en conservant le Set-Cookie.
  const redirect = NextResponse.redirect(new URL("/super-admin", req.url))
  const setCookie = res.headers.get("set-cookie")
  if (setCookie) redirect.headers.set("set-cookie", setCookie)
  return redirect
}
