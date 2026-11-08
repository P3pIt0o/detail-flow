import { ResetPasswordForm } from "@/components/admin/password-reset-forms"

// Le jeton est dans l'URL : aucun Referer vers d'autres sites, page non indexée.
export const metadata = {
  title: "Nouveau mot de passe",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { token, error } = await searchParams
  return <ResetPasswordForm token={token || null} error={error || null} />
}
