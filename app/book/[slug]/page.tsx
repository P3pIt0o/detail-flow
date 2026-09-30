import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { getPublicationFlags } from "@/lib/company/publication"
import { isBookingLinkAccessible } from "@/lib/company/publication-shared"

export const dynamic = "force-dynamic"

const SLUG_RE = /^[a-z0-9-]{1,64}$/
const HEX_RE = /^#[0-9a-fA-F]{6}$/

async function loadCompany(slug: string) {
  if (!SLUG_RE.test(slug)) return null
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      city: companies.city,
      logoUrl: companies.logoUrl,
      brandPrimary: companies.brandPrimary,
      status: companies.status,
    })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1)
  if (!company) return null
  const flags = await getPublicationFlags(company.id)
  return isBookingLinkAccessible(company.status, flags) ? company : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const company = await loadCompany(slug)
  return {
    title: company ? `Réserver — ${company.name}` : "Réservation",
    robots: { index: false, follow: false },
  }
}

export default async function BookingLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const company = await loadCompany(slug)
  if (!company) notFound()

  const accent = company.brandPrimary && HEX_RE.test(company.brandPrimary) ? company.brandPrimary : undefined
  const q = `?tenant=${encodeURIComponent(company.slug)}`

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-3">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/company-logo?company=${encodeURIComponent(company.slug)}`}
              alt={company.name}
              className="size-20 rounded-full object-contain"
            />
          )}
          <h1 className="text-balance text-2xl font-semibold tracking-tight">{company.name}</h1>
          {company.city && <p className="text-sm text-muted-foreground">{company.city}</p>}
        </div>

        <nav aria-label="Choisir une prestation" className="flex w-full flex-col gap-3">
          <Link
            href={`/reservation${q}`}
            style={accent ? { backgroundColor: accent, color: "#ffffff" } : undefined}
            className="flex items-center justify-between gap-3 rounded-lg bg-primary px-5 py-4 text-left text-primary-foreground transition-opacity hover:opacity-90"
          >
            <span className="flex flex-col">
              <span className="font-medium">Réserver un nettoyage auto</span>
              <span className="text-sm opacity-80">Prix et créneau immédiats</span>
            </span>
            <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
          </Link>
          <Link
            href={`/demande${q}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-5 py-4 text-left transition-colors hover:bg-muted"
          >
            <span className="flex flex-col">
              <span className="font-medium">Demander un devis textile</span>
              <span className="text-sm text-muted-foreground">Canapés, sièges et prestations sur mesure</span>
            </span>
            <ArrowUpRight className="size-5 shrink-0" aria-hidden="true" />
          </Link>
        </nav>

        <p className="text-xs text-muted-foreground">Réservation propulsée par DetailFlow</p>
      </div>
    </main>
  )
}
