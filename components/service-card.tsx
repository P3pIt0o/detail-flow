"use client"

import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Clock, ArrowRight } from "lucide-react"
import { siteConfig } from "@/config/site"
import { withTenant } from "@/lib/tenant-link"

export type PublicService = {
  id: number
  name: string
  slug: string
  description: string | null
  image: string | null
  basePriceCents: number
  durationMin: number
}

const FALLBACK_IMAGE = "/services/default.png"

function formatDuration(min: number): string {
  const safe = Number.isFinite(min) && min > 0 ? Math.round(min) : 60
  const h = Math.floor(safe / 60)
  const m = safe % 60

  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`

  return `${h}h${m.toString().padStart(2, "0")}`
}

function formatPrice(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "Sur devis"

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100)
}

export function ServiceCard({ service }: { service: PublicService }) {
  const tenant = useSearchParams().get("tenant")
  const priceLabel = formatPrice(service.basePriceCents)

  const reservationHref = withTenant(
    `${siteConfig.cta.href}${
      siteConfig.cta.href.includes("?") ? "&" : "?"
    }service=${service.id}`,
    tenant,
  )

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        <Image
          src={service.image || FALLBACK_IMAGE}
          alt={service.name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg font-semibold text-foreground">
          {service.name}
        </h3>

        {service.description && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {service.description}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between border-t border-border pt-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {priceLabel === "Sur devis" ? "Tarif" : "À partir de"}
            </p>

            <p className="text-2xl font-bold text-foreground">
              {priceLabel}
            </p>
          </div>

          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden="true" />
            {formatDuration(service.durationMin)}
          </span>
        </div>

        <Link
          href={reservationHref}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          Réserver cette prestation

          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>
    </article>
  )
}
