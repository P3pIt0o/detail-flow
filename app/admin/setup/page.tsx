import { redirect } from "next/navigation"

// L'ancienne page de configuration initiale est remplacée par l'inscription
// publique. On conserve la route pour ne casser aucun lien existant.
export const dynamic = "force-dynamic"

export default function AdminSetupPage() {
  redirect("/admin/signup")
}
