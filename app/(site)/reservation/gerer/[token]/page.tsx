import { notFound } from "next/navigation"
import Link from "next/link"
import { Calendar, Clock, MapPin, Info, CheckCircle2, XCircle } from "lucide-react"
import { getBookingByManageToken } from "@/lib/booking/queries"
import { resolveRequestTenant } from "@/lib/tenant"
import { withTenant } from "@/lib/tenant-link"
import { formatPrice, formatDateLong, formatDuration } from "@/lib/format"
import { isCancellableNow } from "@/lib/booking/cancel"
import { ManageBookingActions } from "@/components/booking/manage-booking-actions"

export const dynamic = "force-dynamic"

/**
 * Page publique de GESTION d'un rendez-vous par le client final non authentifié.
 *
 * Sécurité : le booking est résolu UNIQUEMENT via le jeton public haute entropie
 * (`getBookingByManageToken`), lui-même scopé au tenant courant résolu côté
 * serveur (en-tête `x-tenant-slug`). Un jeton du tenant A présenté sur le tenant
 * B ne renvoie rien. Aucun `companyId` n'est accepté depuis l'URL/navigateur.
 * En cas de jeton invalide, message générique, aucune information divulguée.
 */
export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const tenant = await resolveRequestTenant()
  if (!tenant) notFound()

  const data = await getBookingByManageToken(token, tenant.id)

  // Jeton invalide ou booking d'un autre tenant : réponse générique, sans fuite.
  if (!data) {
    return (
      <section className="min-h-[70vh] bg-background py-16">
        <div className="mx-auto max-w-lg px-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <XCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="mt-6 text-balance font-serif text-2xl font-bold text-foreground">
            Rendez-vous introuvable ou lien invalide
          </h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            Ce lien n&apos;est plus valide. Vérifiez qu&apos;il est complet ou contactez directement
            l&apos;entreprise.
          </p>
          <Link
            href={withTenant("/", tenant.slug)}
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </section>
    )
  }

  const { booking, items } = data
  const isCancelled = booking.status === "cancelled"
  const cancellable = isCancellableNow(booking)
  const newBookingHref = withTenant("/reservation", tenant.slug)

  return (
    <section className="min-h-[70vh] bg-background py-16">
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex flex-col items-center text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full ${
              isCancelled ? "bg-muted" : "bg-primary/15"
            }`}
          >
            {isCancelled ? (
              <XCircle className="h-8 w-8 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-primary" />
            )}
          </div>
          <h1 className="mt-6 text-balance font-serif text-3xl font-bold text-foreground">
            {isCancelled ? "Rendez-vous annulé" : "Gérer mon rendez-vous"}
          </h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            {tenant.name} · Référence <span className="font-semibold text-foreground">{booking.reference}</span>
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-semibold text-card-foreground">Détails du rendez-vous</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                isCancelled ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
              }`}
            >
              {isCancelled ? "Annulé" : "Actif"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 text-card-foreground">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="capitalize">{formatDateLong(booking.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-card-foreground">
              <Clock className="h-4 w-4 text-primary" />
              <span>
                {booking.startTime} – {booking.endTime} ({formatDuration(booking.totalDurationMin)})
              </span>
            </div>
            <div className="flex items-start gap-2 text-card-foreground sm:col-span-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{booking.address}</span>
            </div>
          </div>

          <ul className="mt-5 space-y-3 border-t border-border pt-5">
            {items.map((it) => (
              <li key={it.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{it.serviceName}</p>
                    <p className="text-xs text-muted-foreground">{it.vehicleTypeName}</p>
                    {it.options.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {it.options.map((o) => (
                          <li key={o.id} className="text-xs text-muted-foreground">
                            + {o.optionName} ({formatPrice(o.priceCents)})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-card-foreground">{formatPrice(it.priceCents)}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex justify-between border-t border-border pt-5 text-base font-semibold">
            <span className="text-card-foreground">Total</span>
            <span className="text-primary">{formatPrice(booking.totalCents)}</span>
          </div>
        </div>

        {isCancelled ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Ce rendez-vous est annulé. Vous pouvez réserver un nouveau créneau quand vous le souhaitez.
            </p>
            <Link
              href={newBookingHref}
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Réserver un nouveau créneau
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            <ManageBookingActions
              token={booking.manageToken ?? ""}
              canCancel={cancellable}
              hasDeposit={booking.depositCents > 0}
              newBookingHref={newBookingHref}
            />
            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Info className="mr-1 inline h-3.5 w-3.5" />
              Pour changer de créneau, annulez ce rendez-vous puis choisissez un nouveau créneau.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
