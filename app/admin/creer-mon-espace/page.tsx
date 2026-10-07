import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { getSession } from "@/lib/admin"
import { db } from "@/lib/db"
import { companies, companyMembers } from "@/lib/db/schema"
import { parseDesiredPlan, withDesiredPlan } from "@/lib/pricing/desired-plan"
import { withTenant } from "@/lib/tenant-link"
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
export default async function CreateWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>
}) {
  const desiredPlan = parseDesiredPlan((await searchParams).plan)
  const session = await getSession()
  if (!session?.user) redirect("/admin/login")

  const [membership] = await db
    .select({ id: companyMembers.id, slug: companies.slug })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(eq(companyMembers.userId, session.user.id))
    .limit(1)
  // Déjà rattaché : jamais de second espace. Avec une intention d'offre, on
  // l'amène sur son abonnement (autorisation re-vérifiée là-bas côté serveur).
  if (membership) {
    redirect(desiredPlan ? withDesiredPlan(withTenant("/admin/abonnement", membership.slug), desiredPlan) : "/admin")
  }

  return <CreateWorkspaceForm defaultName={session.user.name ?? ""} desiredPlan={desiredPlan} />
}
