import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/admin"
import { parseDesiredPlan, withDesiredPlan } from "@/lib/pricing/desired-plan"
import { Onboarding } from "./onboarding"

// Tunnel d'inscription : pas d'intérêt SEO propre, on évite l'indexation.
export const metadata: Metadata = {
  title: "Créer mon espace",
  description: "Créez votre espace DetailFlow en quelques questions.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/demarrer" },
}

// Dépend de la session courante.
export const dynamic = "force-dynamic"

/**
 * Onboarding self-service « Créer mon espace ».
 *
 * Une question à la fois, philosophie Karzly. Les réponses guident la suite du
 * parcours puis, après confirmation d'email, le provisioning de l'entreprise
 * (via /admin/creer-mon-espace qui relit l'état onboarding).
 *
 * Garde : un utilisateur déjà connecté n'a pas besoin de s'inscrire — on le
 * renvoie vers son espace (idempotence gérée en aval).
 */
export default async function DemarrerPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[] }> }) {
  // Intention commerciale uniquement (PRO | BUSINESS | null) : aucun droit accordé.
  const desiredPlan = parseDesiredPlan((await searchParams).plan)
  const session = await getSession()
  if (session?.user) redirect(withDesiredPlan("/admin/creer-mon-espace", desiredPlan))

  return <Onboarding desiredPlan={desiredPlan} />
}
