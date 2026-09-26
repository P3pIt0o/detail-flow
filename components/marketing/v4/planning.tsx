import {
  Ban,
  CalendarOff,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hourglass,
  MapPin,
  Timer,
  type LucideIcon,
} from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { AppWindow, Container, SectionIntro } from "./primitives"
import { WeekStrip } from "./dashboard-mock"

/**
 * Reproduction de la vue « 7 jours » du vrai Calendrier admin
 * (`components/admin/admin-calendar.tsx`) : une carte par jour, CA du jour,
 * rendez-vous avec barre de statut. Données de démonstration.
 */

type Booking = { name: string; time: string; vehicles: number; price: string; bar: string; place?: string }

const DAYS: { label: string; ca?: string; today?: boolean; bookings: Booking[]; note?: string }[] = [
  {
    label: "Lundi 21 Sept.",
    ca: "CA 208,00 €",
    bookings: [
      { name: "Karim Haddad", time: "09:00–10:30", vehicles: 1, price: "69,00 €", bar: "bg-emerald-500" },
      { name: "Julie Petit", time: "11:00–13:30", vehicles: 1, price: "139,00 €", bar: "bg-emerald-500", place: "Déplacement" },
    ],
  },
  {
    label: "Jeudi 24 Sept.",
    ca: "CA 517,00 €",
    today: true,
    bookings: [
      { name: "Léa Moreau", time: "10:00–13:00", vehicles: 2, price: "403,00 €", bar: "bg-amber-500" },
      { name: "Thomas Martin", time: "14:30–17:30", vehicles: 1, price: "114,00 €", bar: "bg-primary" },
    ],
  },
  {
    label: "Samedi 26 Sept.",
    bookings: [],
    note: "Congés — aucun créneau proposé.",
  },
]

const RULES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Clock, title: "Horaires d'ouverture", text: "Définis jour par jour, jours fermés compris." },
  { icon: CalendarOff, title: "Congés et fermetures", text: "Les jours bloqués disparaissent du parcours client." },
  { icon: Timer, title: "Durée réelle", text: "Chaque prestation occupe exactement son temps, options comprises." },
  { icon: Hourglass, title: "Temps de battement", text: "Une marge entre deux rendez-vous pour préparer le poste." },
  { icon: Car, title: "Véhicules par jour", text: "Une limite quotidienne adaptée à votre capacité." },
  { icon: MapPin, title: "Atelier ou déplacement", text: "Zone d'intervention et frais kilométriques calculés." },
  { icon: Ban, title: "Créneaux bloqués", text: "Un imprévu ? Bloquez une journée ou une plage horaire." },
]

function CalendarMock() {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold tracking-tight">Calendrier</p>
          <p className="text-[12px] text-muted-foreground">21 Sept. – 27 Sept.</p>
        </div>
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="hidden items-center gap-1 sm:flex">
            <span className="flex size-7 items-center justify-center rounded-md border border-border">
              <ChevronLeft className="size-3.5" />
            </span>
            <span className="rounded-md border border-border px-2 py-1 text-[11px] font-medium">Aujourd&apos;hui</span>
            <span className="flex size-7 items-center justify-center rounded-md border border-border">
              <ChevronRight className="size-3.5" />
            </span>
          </span>
          <span className="flex rounded-lg border border-border p-0.5 text-[11px]">
            <span className="px-2 py-1 text-muted-foreground">Jour</span>
            <span className="rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground">7 jours</span>
            <span className="px-2 py-1 text-muted-foreground">Mois</span>
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {DAYS.map((d) => (
          <div
            key={d.label}
            className={cn("rounded-xl border border-border p-3", d.today && "border-primary/40 bg-primary/5")}
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold">
                {d.label}
                {d.today && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Aujourd&apos;hui
                  </span>
                )}
              </p>
              {d.ca && <p className="text-[11px] text-muted-foreground">{d.ca}</p>}
            </div>
            {d.bookings.length > 0 ? (
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {d.bookings.map((b) => (
                  <div key={b.name} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2">
                    <span className={cn("h-7 w-1 shrink-0 rounded-full", b.bar)} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium">{b.name}</p>
                      <p className="truncate text-[10.5px] text-muted-foreground">
                        {b.time} · {b.vehicles} véh.{b.place ? ` · ${b.place}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-[11px] text-muted-foreground">{b.price}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11.5px] text-muted-foreground">{d.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Planning() {
  return (
    <section aria-labelledby="planning-title" className="border-t border-border bg-muted/40 py-24 sm:py-32">
      <Container>
        <SectionIntro
          titleId="planning-title"
          eyebrow="Planning"
          title="Un planning qui connaît réellement vos disponibilités."
          lead="Vos réservations arrivent directement dans votre planning. Vos règles décident de ce que le client peut réserver."
        />

        <div className="mt-14 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8">
          <Reveal>
            <AppWindow url="votre-entreprise.detailflow.fr/admin/calendrier">
              <CalendarMock />
            </AppWindow>
          </Reveal>

          <div className="flex flex-col gap-6">
            <Reveal delay={0.05}>
              <div className="df-product rounded-2xl border border-border bg-card p-4 text-foreground">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[12.5px] font-semibold">Cette semaine</p>
                  <p className="font-mono text-[10.5px] text-muted-foreground">Moteur de disponibilité</p>
                </div>
                <WeekStrip />
              </div>
            </Reveal>
            <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {RULES.map((r) => (
                <li key={r.title} className="flex gap-3">
                  <r.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{r.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  )
}
