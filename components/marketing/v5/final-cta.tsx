import Link from "next/link"
import { UI } from "./data"

export function FinalCta() {
  return (
    <section className="border-t border-[#e2ddd2] py-[72px]">
      <div className={`${UI.wrap} flex flex-wrap items-end justify-between gap-6`}>
        <h2 className={`${UI.h2} max-w-[18ch]`}>Votre lien de réservation peut être en ligne ce soir.</h2>
        <Link className={`${UI.btn} ${UI.primary}`} href="/demarrer">
          Créer mon espace gratuitement
        </Link>
      </div>
    </section>
  )
}
