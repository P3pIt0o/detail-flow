/**
 * Section « Zone d'intervention » (composant SERVEUR).
 * Le module interactif (carte + recherche) est client ; le titre et le texte
 * « Exemples de communes du secteur » sont rendus côté serveur.
 * Aucune promesse tarifaire : le calcul réel reste serveur (BookingV2).
 */

import "./zone.css"
import { CleanyzerZoneModule } from "./zone-module"
import { ZONE_COMMUNES, joinNames } from "./zones"
import { CLZ_BOOKING_HREF, CLZ_DEMANDE_HREF } from "./tokens"

const allNames = joinNames(ZONE_COMMUNES.map((c) => c.name))

export function ZoneSection() {
  return (
    <section id="zone" className="clz-zone" aria-labelledby="clz-zone-title">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <div className="clz-zone-rule" aria-hidden="true" />
        <p className="clz-eyebrow">Notre zone d&apos;intervention</p>
        <h2 id="clz-zone-title" className="clz-zone-title">
          À Annecy,<br />
          <em>et autour de vous.</em>
        </h2>
        <p className="clz-zone-lead">
          Nettoyage automobile et textile à domicile. Sélectionnez votre commune pour préparer votre demande.
        </p>

        <CleanyzerZoneModule bookingHref={CLZ_BOOKING_HREF} requestHref={CLZ_DEMANDE_HREF} />

        <div className="clz-zone-seo">
          <h3>Exemples de communes du secteur</h3>
          <p>
            CLEANYZER intervient à domicile autour de Choisy et d&apos;Annecy, par exemple à {allNames}.
          </p>
          <p>
            Cette liste est indicative. La faisabilité et les frais de déplacement éventuels sont calculés à partir de
            votre adresse complète et précisés avant toute confirmation.
          </p>
        </div>
      </div>
    </section>
  )
}
