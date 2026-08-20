import { SectionHeading } from "@/components/ui/section-heading"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { getPublicCustomRequestsConfig } from "@/lib/site-content"
import { resolveCustomRequestTexts, activeTypes } from "@/lib/custom-requests"
import { getCurrentTenant } from "@/lib/tenant"
import { withTenant } from "@/lib/tenant-link"

/**
 * Section « Demandes personnalisées » de la homepage.
 *
 * Réutilise exclusivement la configuration existante du tenant courant
 * (résolue côté serveur) : aucune donnée n'est jamais empruntée à un autre
 * tenant. Ne rend RIEN si la fonctionnalité est désactivée ou si aucun type
 * n'est actif (aucun espace vide sur la page).
 */
export async function CustomRequestsSection() {
  const [cfg, tenant] = await Promise.all([getPublicCustomRequestsConfig(), getCurrentTenant()])

  const types = activeTypes(cfg)
  if (!cfg.enabled || types.length === 0) return null

  const texts = resolveCustomRequestTexts(cfg)
  const href = withTenant("/demande", tenant?.slug ?? null)

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading title={texts.title} subtitle={texts.description} />

      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {types.map((type, i) => (
          <Reveal key={type.key} delay={i * 0.1}>
            <div className="h-full rounded-2xl border border-border bg-card p-6">
              <h3 className="text-lg font-semibold text-foreground">{type.label}</h3>
              {type.description ? <p className="mt-2 text-muted-foreground">{type.description}</p> : null}
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-12 flex justify-center">
        <CtaButton href={href} size="lg" showArrow>
          {texts.ctaLabel}
        </CtaButton>
      </div>
    </section>
  )
}
