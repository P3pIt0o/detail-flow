import Image from "next/image"
import Link from "next/link"
import { UI } from "./data"

type Feature = {
  title: string
  text: string
  bullets: string[]
  image: { src: string; alt: string; width: number; height: number }
  /** Capture à gauche sur ordinateur (repasse sous le texte sur mobile). */
  imageFirst?: boolean
  moreLink?: boolean
}

const FEATURES: Feature[] = [
  {
    title: "Un prix juste pour chaque véhicule",
    text: "Une citadine ne se traite pas comme un SUV. Fixez le prix et la durée de chaque prestation par type de véhicule : le client voit directement son tarif.",
    bullets: ["Grille tarifaire citadine, berline, SUV, utilitaire", "Options et suppléments", "Codes promo et offres"],
    image: {
      src: "/marketing/v5/ecran-grille-tarifs.webp",
      alt: "Grille tarifaire DetailFlow : prix et durée de chaque prestation selon le type de véhicule",
      width: 1500,
      height: 479,
    },
  },
  {
    title: "Des clients abonnés, un revenu chaque mois",
    text: "Proposez une formule d'entretien : le client paie chaque mois, vous savez combien vous encaissez, il revient sans que vous ayez à le relancer.",
    bullets: ["Prélèvement automatique par carte", "Sans engagement pour votre client", "Espace client pour suivre ses lavages"],
    image: {
      src: "/marketing/v5/ecran-formule.webp",
      alt: "Création d'une formule d'entretien mensuelle dans DetailFlow",
      width: 1220,
      height: 678,
    },
    imageFirst: true,
  },
  {
    title: "Vos chiffres, sans tableur",
    text: "Chiffre d'affaires, panier moyen, prestations qui rapportent le plus et rentabilité estimée, calculés à partir de vos vraies réservations.",
    bullets: ["Suivi des dépenses et des produits", "Conversion de votre page de réservation", "Sur ordinateur et sur téléphone"],
    image: {
      src: "/marketing/v5/ecran-analyse.webp",
      alt: "Tableau d'analyse DetailFlow : chiffre d'affaires, rendez-vous, panier moyen et évolution",
      width: 1030,
      height: 659,
    },
    moreLink: true,
  },
]

export function Features() {
  return (
    <section id="fonctions" className="pb-10 pt-6">
      <div className={UI.wrap}>
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-center gap-x-16 gap-y-10 border-t border-[#e2ddd2] py-14 max-[720px]:py-10"
          >
            <div>
              <h3 className="m-0 text-[26px] font-bold leading-[1.2] tracking-[-0.01em]">{f.title}</h3>
              <p className="m-0 mt-3 max-w-[46ch] text-[17px] leading-[1.6] text-[#4d4a44]">{f.text}</p>
              <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0 text-base">
                {f.bullets.map((b) => (
                  <li
                    key={b}
                    className="relative pl-[18px] before:absolute before:left-0 before:top-[.62em] before:h-0.5 before:w-2 before:bg-[#1d5fd0] before:content-['']"
                  >
                    {b}
                  </li>
                ))}
              </ul>
              {f.moreLink ? (
                <p className="m-0 mt-5 text-base">
                  <Link href="/#fonctions" className={`font-semibold ${UI.link}`}>
                    Toutes les fonctionnalités →
                  </Link>
                </p>
              ) : null}
            </div>
            <Image
              className={`${UI.shot} ${f.imageFirst ? "min-[721px]:order-first" : ""}`}
              src={f.image.src}
              alt={f.image.alt}
              width={f.image.width}
              height={f.image.height}
              sizes="(max-width: 720px) 100vw, 560px"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
