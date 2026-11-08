import { redirect } from "next/navigation"
import { getSession } from "@/lib/admin"
import { AdminAuthForm } from "@/components/admin/admin-auth-form"

export const metadata = { title: "Connexion", robots: { index: false, follow: false } }

// Rendu dynamique : la redirection dépend de la session courante.
export const dynamic = "force-dynamic"

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reinitialise?: string }>
}) {
  // Déjà connecté : aller directement au dashboard.
  const session = await getSession()
  if (session?.user) redirect("/admin")

  const { reinitialise } = await searchParams
  return (
    <AdminAuthForm
      mode="login"
      notice={reinitialise === "1" ? "Mot de passe modifié, vous pouvez vous connecter." : undefined}
    />
  )
}
