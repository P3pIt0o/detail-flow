import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { loadPublicDigitalCard } from "@/lib/digital-card.server"
import { DigitalCardView } from "@/components/digital-card/digital-card-view"

/**
 * Carte digitale publique du tenant (L45). Hors du groupe `(site)` : plein écran, sans
 * navigation ni pied de page, indépendante de la publication de la vitrine.
 */

export async function generateMetadata(): Promise<Metadata> {
  const data = await loadPublicDigitalCard()
  return {
    title: data ? { absolute: data.name } : undefined,
    // Page de partage : pas d'indexation (évite le contenu dupliqué avec le site).
    robots: { index: false, follow: false },
  }
}

export default async function CartePage() {
  const data = await loadPublicDigitalCard()
  if (!data) notFound()
  return <DigitalCardView name={data.name} line={data.line} logoSrc={data.logoSrc} card={data.card} actions={data.actions} />
}
