import { redirect } from "next/navigation"
import { getSession } from "@/lib/admin"
import { ForgotPasswordForm } from "@/components/admin/password-reset-forms"

export const metadata = { title: "Mot de passe oublié", robots: { index: false, follow: false } }

// Rendu dynamique : la redirection dépend de la session courante.
export const dynamic = "force-dynamic"

export default async function ForgotPasswordPage() {
  const session = await getSession()
  if (session?.user) redirect("/admin")

  return <ForgotPasswordForm />
}
