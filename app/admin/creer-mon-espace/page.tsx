import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { getSession } from "@/lib/admin"
import { db } from "@/lib/db"
import { companyMembers } from "@/lib/db/schema"
import { CreateWorkspaceForm } from "./create-workspace-form"

export const metadata = { title: "Créer mon espace", robots: { index: false, follow: false } }

// Rendu dynamique : dépend de la session et de l'appartenance de l'utilisateur.
export const dynamic = "force-dynamic"

/**
 * Étape post-inscription : l'utilisateur a un compte (Better Auth, email
 * vérifié) mais pas encore d'entreprise. On collecte le nom + l'adresse
 * (slug), puis on provisionne son espace.
 *
 * Gardes :
 *  - non connecté → connexion ;
 *  - déjà rattaché à une entreprise → dashboard (idempotent, pas de doublon).
 */
export default async function CreateWorkspacePage() {
  const session = await getSession()
  if (!session?.user) redirect("/admin/login")

  const [membership] = await db
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(eq(companyMembers.userId, session.user.id))
    .limit(1)
  if (membership) redirect("/admin")

  return <CreateWorkspaceForm defaultName={session.user.name ?? ""} />
}
