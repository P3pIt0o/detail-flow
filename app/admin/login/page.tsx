import { redirect } from "next/navigation"
import { getSession } from "@/lib/admin"
import { AdminAuthForm } from "@/components/admin/admin-auth-form"

export const metadata = { title: "Connexion", robots: { index: false, follow: false } }

// Rendu dynamique : la redirection dépend de la session courante.
export const dynamic = "force-dynamic"

export default async function AdminLoginPage() {
  // Déjà connecté : aller directement au dashboard.
  const session = await getSession()
  if (session?.user) redirect("/admin")

  return <AdminAuthForm mode="login" />
}
