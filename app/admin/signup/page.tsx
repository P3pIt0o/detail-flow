import { redirect } from "next/navigation"
import { getSession } from "@/lib/admin"
import { AdminAuthForm } from "@/components/admin/admin-auth-form"

export const metadata = { title: "Créer un compte", robots: { index: false, follow: false } }

// Rendu dynamique : dépend de la session courante.
export const dynamic = "force-dynamic"

export default async function AdminSignupPage() {
  // Déjà connecté : inutile de s'inscrire.
  const session = await getSession()
  if (session?.user) redirect("/admin")

  return <AdminAuthForm mode="signup" />
}
