import Image from "next/image"
import Link from "next/link"
import { TRUSTPILOT } from "@/components/marketing/v4/trustpilot"
import { UI } from "./data"

export function Hero() {
  return (
    <section className="pt-[72px]">
      <div className={UI.wrap}>
        <p className={`m-0 text-[15px] font-semibold ${UI.muted}`}>Logiciel de réservation pour le detailing automobile</p>
        <h1 className="m-0 mt-3.5 max-w-[15ch] text-[clamp(38px,6vw,76px)] font-extrabold leading-none tracking-[-0.035em]">
          Votre agenda se remplit tout seul. Vos acomptes aussi.
        </h1>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-x-16 gap-y-8">
          <p className="m-0 max-w-[48ch] text-[19px] leading-[1.55] text-[#4d4a44]">
            Vos clients réservent et paient leur acompte en ligne, jour et nuit. Rappels, devis et factures suivent, dans
            une seule application.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Link className={`${UI.btn} ${UI.primary}`} href="/demarrer">
                Créer mon espace gratuitement
              </Link>
              <Link className={`${UI.btn} ${UI.secondary}`} href="/#fonctions">
                Voir le logiciel
              </Link>
            </div>
            <p className={`m-0 text-sm ${UI.muted}`}>
              Gratuit pour commencer, sans carte bancaire.{" "}
              <a
                href={TRUSTPILOT.reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#16181d] decoration-[#00b67a] underline-offset-[3px]"
              >
                {TRUSTPILOT.ratingLabel} sur Trustpilot
              </a>
            </p>
          </div>
        </div>
        <figure className="m-0 mt-12">
          <Image
            className={UI.shot}
            src="/marketing/v5/ecran-reservations.webp"
            alt="Liste des réservations dans DetailFlow : date, référence, statut et montant de chaque rendez-vous"
            width={1500}
            height={636}
            sizes="(max-width: 1180px) 100vw, 1132px"
            preload
            fetchPriority="high"
          />
          <figcaption className={`mt-2.5 text-[13px] ${UI.muted}`}>
            Écran réel de DetailFlow, noms des clients masqués.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
