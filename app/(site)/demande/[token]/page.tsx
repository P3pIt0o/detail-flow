import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { customRequests, companies } from "@/lib/db/schema"
import { formatPrice, formatDuration } from "@/lib/format"
import { statusMeta } from "@/lib/custom-requests"
import { CustomRequestDecision } from "@/components/custom-request-decision"

export const metadata: Metadata = {
  title: "Votre proposition",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

/**
 * Page CLIENT (sans compte) accessible via le lien sécurisé par token.
 * On charge UNIQUEMENT la ligne correspondant au token (non devinable) : cela
 * fait office d'autorisation et garantit qu'aucune donnée d'une autre demande
 * n'est exposée. L'entreprise associée n'est lue que pour l'affichage (nom).
 */
export default async function CustomRequestTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ intent?: string }>
}) {
  const { token } = await params
  const { intent } = await searchParams

  const [row] = await db.select().from(customRequests).where(eq(customRequests.token, token)).limit(1)
  if (!row) notFound()

  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, row.companyId))
    .limit(1)

  const businessName = company?.name ?? "Notre équipe"
  const meta = statusMeta(row.status)
  const decided = row.status === "accepted" || row.status === "declined" || row.status === "converted"
  const hasProposal = Boolean(row.proposalTitle) && row.proposalPriceCents != null

  return (
    <section className="min-h-[70vh] bg-background py-16">
      <div className="mx-auto max-w-2xl px-4">
        <p className="text-sm text-muted-foreground">{businessName}</p>
        <h1 className="mt-1 text-balance font-serif text-3xl font-bold text-foreground">
          Votre proposition personnalisée
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Bonjour {row.customerName.split(" ")[0]}, voici la proposition établie pour votre demande «{" "}
          {row.typeLabel} ».
        </p>

        {!hasProposal ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            La proposition n&apos;est pas encore disponible. Vous recevrez un email dès qu&apos;elle sera prête.
          </div>
        ) : (
          <>
            <div className="mt-8 rounded-xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-serif text-xl font-semibold text-card-foreground">{row.proposalTitle}</h2>
                <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  {meta.label}
                </span>
              </div>

              {row.proposalDescription && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {row.proposalDescription}
                </p>
              )}

              <dl className="mt-5 space-y-1.5 border-t border-border pt-5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Prix</dt>
                  <dd className="font-semibold text-card-foreground">{formatPrice(row.proposalPriceCents ?? 0)}</dd>
                </div>
                {row.proposalDurationMin != null && row.proposalDurationMin > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Durée estimée</dt>
                    <dd className="text-card-foreground">{formatDuration(row.proposalDurationMin)}</dd>
                  </div>
                )}
              </dl>

              {row.proposalMessage && (
                <p className="mt-5 whitespace-pre-wrap border-t border-border pt-5 text-sm leading-relaxed text-card-foreground">
                  {row.proposalMessage}
                </p>
              )}
            </div>

            {decided ? (
              <div className="mt-6 rounded-xl border border-border bg-muted/40 p-5 text-center text-sm text-muted-foreground">
                {row.status === "declined"
                  ? "Vous avez refusé cette proposition."
                  : "Vous avez accepté cette proposition. Nous revenons vers vous pour la suite."}
              </div>
            ) : (
              <CustomRequestDecision token={token} initialIntent={intent === "refuse" ? "declined" : intent === "accept" ? "accepted" : undefined} />
            )}
          </>
        )}

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </section>
  )
}
