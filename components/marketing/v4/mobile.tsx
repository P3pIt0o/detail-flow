import { CalendarPlus, Car, Clock, CreditCard, Sparkles, UserRound } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { Container, EventToast, PhoneFrame, SectionIntro } from "./primitives"

const DETAIL = [
  { icon: UserRound, k: "Client", v: "Thomas Martin" },
  { icon: Car, k: "Véhicule", v: "Audi A3 · Berline" },
  { icon: Sparkles, k: "Prestation", v: "Nettoyage intérieur + poils d'animaux" },
  { icon: Clock, k: "Horaire", v: "Jeu. 24 sept. · 14:30 – 17:30" },
  { icon: CreditCard, k: "Acompte", v: "34,20 € payé" },
]

function MobileAdmin() {
  return (
    <div className="px-3.5 pb-5">
      <div className="flex h-7 items-center justify-center rounded-md bg-muted/70">
        <span className="font-mono text-[10px] text-muted-foreground">detailflow.fr/admin</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[13px] font-bold">DetailFlow Pro</span>
        <span className="size-2 rounded-full bg-primary df-pulse-dot" aria-hidden="true" />
      </div>

      <div className="mt-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold">
          <CalendarPlus className="size-3.5 text-primary" aria-hidden="true" />
          Nouvelle réservation
        </p>
        <p className="mt-0.5 text-[10.5px] text-muted-foreground">Reçue il y a 2 min · via votre site</p>
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        {DETAIL.map((d) => (
          <li key={d.k} className="flex items-start gap-2.5 px-3 py-2.5">
            <d.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">{d.k}</p>
              <p className="text-[12px] font-medium leading-snug">{d.v}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold">
        <span className="rounded-lg border border-border py-2 text-center">Appeler</span>
        <span className="rounded-lg bg-primary py-2 text-center text-primary-foreground">Voir le planning</span>
      </div>
    </div>
  )
}

export function Mobile() {
  return (
    <section aria-labelledby="mobile-title" className="overflow-hidden border-t border-border py-24 sm:py-32">
      <Container>
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div className="order-2 flex flex-col gap-8 lg:order-1">
            <SectionIntro
              titleId="mobile-title"
              eyebrow="Sur mobile"
              title="Votre activité dans la poche, même entre deux véhicules."
              lead="L'administration s'adapte à votre téléphone : réservations, planning, clients et factures, sans installer d'application. Vous pouvez l'ajouter à votre écran d'accueil."
            />
            <div className="grid gap-2.5 sm:max-w-md">
              <EventToast icon={CalendarPlus} title="Nouvelle réservation" meta="Client, véhicule, prestation, horaire" />
              <EventToast icon={CreditCard} tone="success" title="Acompte payé" meta="Visible immédiatement dans la réservation" />
            </div>
          </div>

          <Reveal className="order-1 flex justify-center lg:order-2">
            <div className="relative">
              <PhoneFrame className="w-[280px]">
                <MobileAdmin />
              </PhoneFrame>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}
