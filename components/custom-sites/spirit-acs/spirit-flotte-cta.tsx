/**
 * Bandeau « Flotte & professionnels » de Spirit ACS.
 *
 * CTA dédié aux entreprises gérant plusieurs véhicules. Il ne crée aucun
 * parcours parallèle : il conduit vers la MÊME demande de devis existante
 * (`#demande-devis`) en transmettant le contexte « flotte » via le paramètre
 * `?demande=flotte`, que le configurateur détecte pour ouvrir directement le
 * formulaire libre (là où atterrissent déjà les demandes flotte / abonnement /
 * hors-liste). Aucune donnée commerciale inventée, aucune tarification affichée.
 *
 * Ne s'affiche que lorsque le module de devis est actif (`quoteEnabled`).
 */

import { Truck } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_ANCHOR_PRIMARY } from "./tokens"

export function SpiritFlotteCta({ href }: { href: string }) {
  return (
    <section
      aria-labelledby="spirit-flotte-titre"
      className="border-t border-white/10 bg-[var(--spirit-navy-2,var(--spirit-navy))]"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <Reveal>
          <div className="flex flex-col items-start gap-8 rounded-sm border border-[var(--spirit-teal)]/25 bg-white/[0.03] p-7 sm:p-9 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <div className="flex items-start gap-5">
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-[var(--spirit-teal)]/40 text-[var(--spirit-teal)]"
              >
                <Truck className="size-6" strokeWidth={1.5} />
              </span>
              <div>
                <p className="spirit-eyebrow">Professionnels &amp; entreprises</p>
                <h2 id="spirit-flotte-titre" className="spirit-title mt-2 text-balance text-2xl text-white sm:text-3xl">
                  Vous gérez une flotte de véhicules&nbsp;?
                </h2>
                <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-[color:var(--spirit-muted)] sm:text-base">
                  Entretien récurrent, remise en état avant restitution, préparation esthétique&nbsp;: décrivez votre
                  besoin, nous vous répondons avec une proposition adaptée au nombre de véhicules.
                </p>
              </div>
            </div>
            <a href={href} className={`${SPIRIT_ANCHOR_PRIMARY} shrink-0`}>
              Demander un devis flotte
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
