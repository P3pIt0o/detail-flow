import Link from "next/link"
import { CalendarCheck, ExternalLink, ListChecks } from "lucide-react"
import { LinkDisplay, CopyLinkButton } from "./link-actions"
import { AddToSite } from "./add-to-site"
import { btnOutline } from "./styles"

/**
 * « Réservation en ligne » pour un site personnalisé : gère uniquement le moteur
 * de réservation existant (mêmes prestations, même tunnel, même widget).
 * N'affecte ni le site personnalisé ni customSitePublished.
 */
export function CustomSiteBookingSection({
  active,
  bookingUrl,
  prestationsHref,
  scriptSnippet,
  iframeSnippet,
}: {
  active: boolean
  bookingUrl: string
  prestationsHref: string
  scriptSnippet: string
  iframeSnippet: string
}) {
  return (
    <section aria-labelledby="custom-site-booking-title" className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <CalendarCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 id="custom-site-booking-title" className="text-base font-semibold text-foreground">
            Réservation en ligne
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Vos clients réservent vos prestations DetailFlow depuis votre lien ou directement sur votre site.
          </p>
        </div>
      </div>

      <p
        className={
          active
            ? "self-start rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
            : "self-start rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
        }
      >
        {active ? "Réservation en ligne active" : "Réservation en ligne pas encore activée"}
      </p>
      {!active && (
        <p className="text-sm text-muted-foreground text-pretty">
          Vous pouvez dès maintenant préparer vos prestations. Contactez DetailFlow pour activer la réservation en
          ligne : votre lien deviendra alors accessible à vos clients.
        </p>
      )}

      <Link href={prestationsHref} className={btnOutline}>
        <ListChecks className="size-5" aria-hidden="true" />
        Configurer mes prestations
      </Link>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Votre lien de réservation</p>
        <LinkDisplay url={bookingUrl} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <CopyLinkButton url={bookingUrl} label="Copier mon lien" primary={active} />
          {active && (
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className={btnOutline}>
              <ExternalLink className="size-5" aria-hidden="true" />
              Voir le module
            </a>
          )}
        </div>
      </div>

      <AddToSite url={bookingUrl} scriptSnippet={scriptSnippet} iframeSnippet={iframeSnippet} compact />
    </section>
  )
}
