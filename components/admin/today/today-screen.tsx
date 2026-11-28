import Link from "next/link"
import { ChevronRight, Navigation, Phone } from "lucide-react"
import type { Appointment, Suggestion, TodayModel } from "@/lib/admin/today"
import { StatusBadge } from "@/components/admin/status-badge"
import { btnOutline, btnPrimary } from "@/components/admin/booking-hub/styles"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { FinishVisitButton, FinishVisitProvider } from "./finish-visit"
import { SetupList } from "./setup-list"
import { ShareLink } from "./share-link"

const heroClass = "rounded-2xl border border-primary/40 bg-primary/5 p-4 sm:p-5"

/** Le seul bloc mis en avant : le prochain rendez-vous de la journée. */
function NextAppointment({ a }: { a: Appointment }) {
  return (
    <section aria-labelledby="next-title" className={heroClass}>
      <h2 id="next-title" className="text-sm font-semibold text-primary">
        Prochain rendez-vous
      </h2>
      <p className="mt-1 text-5xl font-bold tracking-tight text-foreground">{a.time}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{a.name}</p>
      <p className="text-sm text-muted-foreground">{[a.vehicle, a.services].filter(Boolean).join(" · ")}</p>
      {a.address ? <p className="mt-2 text-base text-foreground">{a.address}</p> : null}
      {a.atWorkshop ? <p className="mt-2 text-base text-foreground">À l&apos;atelier</p> : null}
      {a.status === "pending_deposit" ? (
        <div className="mt-2">
          <StatusBadge status={a.status} />
        </div>
      ) : null}

      {a.paidOnlineCents > 0 ? (
        <p className="mt-2 text-base font-semibold text-foreground">
          {a.paidInFull ? "Déjà payé en ligne" : `${formatPrice(a.paidOnlineCents)} déjà payés en ligne`}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {a.mapsUrl ? (
          <a href={a.mapsUrl} target="_blank" rel="noopener noreferrer" className={cn(btnOutline, "sm:flex-1")}>
            <Navigation className="size-5" aria-hidden="true" />
            Itinéraire
          </a>
        ) : null}
        {a.phone ? (
          <a href={`tel:${a.phone.replace(/[^+\d]/g, "")}`} className={cn(btnOutline, "sm:flex-1", !a.mapsUrl && "col-span-2")}>
            <Phone className="size-5" aria-hidden="true" />
            Appeler
          </a>
        ) : null}
        {a.canFinish ? (
          <FinishVisitButton
            id={a.id}
            name={a.name}
            amountCents={a.amountCents}
            paidInFull={a.paidInFull}
            paymentNotes={a.paymentNotes}
            className="col-span-2 sm:flex-[2]"
          />
        ) : (
          <Link href={a.href} className={cn(btnPrimary, "col-span-2 sm:flex-[2]")}>
            Voir la réservation
          </Link>
        )}
      </div>
    </section>
  )
}

function Timeline({ list }: { list: Appointment[] }) {
  return (
    <section aria-labelledby="day-title">
      <h2 id="day-title" className="text-base font-semibold text-foreground">
        Votre journée
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {list.map((a) => (
          <li key={a.id}>
            <Link href={a.href} className="flex min-h-14 items-center gap-3 py-2 hover:text-primary">
              <span className="w-14 shrink-0 text-base font-semibold tabular-nums text-foreground">{a.time}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base text-foreground">{a.name}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {[a.vehicle, a.atWorkshop ? "à l'atelier" : null].filter(Boolean).join(" · ") || a.services}
                </span>
              </span>
              {a.status !== "confirmed" ? <StatusBadge status={a.status} /> : null}
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Journée vide ou terminée : une seule action, choisie côté serveur. */
function IdleAction({ s, shareUrl }: { s: Suggestion; shareUrl: string }) {
  return (
    <section className={heroClass}>
      {s.kind === "relaunch" ? (
        <>
          <p className="text-lg font-semibold text-foreground text-balance">
            Aucune visite de {s.name} depuis {s.days} jours
          </p>
          <p className="mt-1 text-sm text-muted-foreground">C&apos;est le bon moment pour reprendre contact.</p>
          <Link href={s.href} className={cn(btnPrimary, "mt-3 w-full sm:w-auto")}>
            Voir sa fiche et le relancer
          </Link>
        </>
      ) : s.kind === "share" ? (
        <>
          <p className="mb-1 text-lg font-semibold text-foreground">Partagez votre lien de réservation</p>
          <ShareLink url={shareUrl} />
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-foreground">Vous ne travaillez pas aujourd&apos;hui ?</p>
          <p className="mt-1 text-sm text-muted-foreground">Bloquez la journée pour ne recevoir aucune réservation.</p>
          <Link href={s.href} className={cn(btnPrimary, "mt-3 w-full sm:w-auto")}>
            Bloquer la journée
          </Link>
        </>
      )}
    </section>
  )
}

export function TodayScreen({
  model,
  firstName,
  tenant,
  statsHref,
}: {
  model: TodayModel
  firstName: string | null
  tenant: string | null
  statsHref: string
}) {
  const { setup, day, headline, suggestion, todo, figures, visits, shareUrl } = model
  const setupList = setup ? <SetupList steps={setup.steps} doneCount={setup.doneCount} shareUrl={shareUrl} /> : null
  const hasAside = todo.length > 0 || figures !== null || visits !== null
  const count = day?.list.length ?? 0

  return (
    <FinishVisitProvider tenant={tenant}>
      {/* `data-today-home` : le shell masque « Copier mon lien » sur mobile pour cet écran. */}
      <div data-today-home className={cn("mx-auto", hasAside ? "max-w-5xl" : "max-w-2xl")}>
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            {firstName ? `Bonjour ${firstName}` : "Bonjour 👋"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {model.dateLabel}
            {count > 0 ? ` · ${count} rendez-vous` : ""}
          </p>
        </header>

        <div className={cn("mt-5 grid grid-cols-1 gap-7", hasAside && "lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-9")}>
          <div className="flex min-w-0 flex-col gap-7">
            {day?.next ? <NextAppointment a={day.next} /> : setupList}
            {headline ? (
              <p className="text-lg text-foreground">
                {headline.title}
                {headline.next ? (
                  <>
                    {" "}
                    · prochain rendez-vous <b className="font-semibold">{headline.next}</b>
                  </>
                ) : null}
              </p>
            ) : null}
            {suggestion ? <IdleAction s={suggestion} shareUrl={shareUrl} /> : null}
            {day ? <Timeline list={day.list} /> : null}
            {day?.next ? setupList : null}
          </div>

          {hasAside ? (
            <div className="flex min-w-0 flex-col gap-7">
              {todo.length > 0 ? (
                <section aria-labelledby="todo-title">
                  <h2 id="todo-title" className="text-base font-semibold text-foreground">
                    À traiter
                  </h2>
                  <ul className="flex flex-col divide-y divide-border">
                    {todo.map((item) => (
                      <li key={item.label}>
                        <Link href={item.href} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:text-primary">
                          <span className="min-w-0">
                            <span className="block text-base text-foreground">{item.label}</span>
                            {item.detail ? <span className="block text-sm text-muted-foreground">{item.detail}</span> : null}
                          </span>
                          <span className="flex shrink-0 items-center text-sm font-semibold text-primary">
                            {item.action}
                            <ChevronRight className="size-4" aria-hidden="true" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {figures || visits !== null ? (
                <section aria-label="Vos chiffres" className="border-t border-border pt-4">
                  {figures ? (
                    <dl className={cn("grid gap-3", figures.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                      {figures.map((f) => (
                        <div key={f.label} className="flex min-w-0 flex-col" title={f.hint}>
                          <dt className="order-2 text-sm text-muted-foreground">{f.label}</dt>
                          <dd className="order-1 text-xl font-bold tabular-nums text-foreground">{f.value}</dd>
                          <dd className="order-3 text-sm text-muted-foreground">{f.previous}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <Link href={statsHref} className="mt-1 flex min-h-11 items-center gap-1 text-sm text-muted-foreground">
                    {visits !== null ? `${visits.toLocaleString("fr-FR")} ${visits > 1 ? "visites" : "visite"} sur 30 jours · ` : ""}
                    <span className="font-semibold text-primary">Statistiques</span>
                    <ChevronRight className="size-4 text-primary" aria-hidden="true" />
                  </Link>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </FinishVisitProvider>
  )
}
