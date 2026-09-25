import Link from "next/link"
import { ArrowRight, CalendarPlus, CreditCard } from "lucide-react"
import { AppWindow, Container, EventToast, PhoneFrame } from "./primitives"
import { DashboardMock } from "./dashboard-mock"
import { TrustpilotProof } from "./trustpilot"

const SLOTS = ["09:00", "09:30", "14:00", "14:30", "15:00", "15:30"]

function PhoneBookingPreview() {
  return (
    <div className="px-3.5 pb-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Étape 3 sur 4</p>
      <p className="mt-1 text-[15px] font-semibold leading-tight">Choisissez votre créneau</p>
      <p className="mt-1 text-[11px] text-muted-foreground">Nettoyage intérieur · 3 h</p>
      <div className="mt-3 flex gap-1.5">
        {["Jeu 24", "Ven 25", "Lun 28"].map((d, i) => (
          <span
            key={d}
            className={
              i === 0
                ? "rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground"
                : "rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground"
            }
          >
            {d}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {SLOTS.map((s) => (
          <span
            key={s}
            className={
              s === "14:30"
                ? "rounded-lg border border-primary bg-primary/10 py-2 text-center font-mono text-[11px] font-semibold text-foreground"
                : "rounded-lg border border-border py-2 text-center font-mono text-[11px] text-muted-foreground"
            }
          >
            {s}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
        <div>
          <p className="text-[10px] text-muted-foreground">Total · 3 h</p>
          <p className="text-[14px] font-semibold">114 €</p>
        </div>
        <span className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">Continuer</span>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden pt-28 sm:pt-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(to_right,oklch(0.2_0.02_262/0.05)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.2_0.02_262/0.05)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_30%,black,transparent)]"
      />

      <Container className="flex flex-col items-center text-center">
        <p className="df-rise inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Logiciel de gestion pour le detailing automobile
        </p>

        <h1
          id="hero-title"
          className="df-rise mt-7 max-w-4xl text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground [animation-delay:80ms] sm:text-6xl lg:text-7xl"
        >
          Tout votre detailing.
          <span className="block text-muted-foreground/70">Une seule plateforme.</span>
        </h1>

        <p className="df-rise mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground [animation-delay:160ms] sm:text-lg">
          Site internet, réservations, planning, clients, paiements et facturation réunis dans un seul outil conçu
          pour les professionnels du detailing.
        </p>

        <div className="df-rise mt-9 flex w-full flex-col items-center justify-center gap-3 [animation-delay:240ms] sm:w-auto sm:flex-row">
          <Link
            href="/demarrer"
            className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
          >
            Créer mon espace gratuitement
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link
            href="#reservation"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
          >
            Voir la plateforme
          </Link>
        </div>
        <p className="df-rise mt-4 text-xs text-muted-foreground [animation-delay:280ms]">
          Offre Starter gratuite, sans engagement.
        </p>
        <div className="df-rise mt-6 [animation-delay:320ms]">
          <TrustpilotProof variant="compact" />
        </div>
      </Container>

      <Container className="relative mt-16 max-w-7xl pb-8 sm:mt-20">
        <div className="df-rise relative mx-auto max-w-5xl [animation-delay:360ms]">
          <AppWindow url="votre-entreprise.detailflow.fr/admin">
            <DashboardMock />
          </AppWindow>

          <div className="pointer-events-none absolute -right-10 top-16 hidden w-72 lg:block xl:-right-24">
            <div className="df-float">
              <EventToast
                icon={CalendarPlus}
                title="Nouvelle réservation"
                meta="Audi A3 · Nettoyage intérieur · Jeu. 14:30"
              />
            </div>
          </div>

          <div className="pointer-events-none absolute -left-10 bottom-28 hidden w-64 lg:block xl:-left-24">
            <div className="df-float-delayed">
              <EventToast icon={CreditCard} tone="success" title="Acompte payé" meta="34,20 € · carte bancaire" />
            </div>
          </div>

          <div className="pointer-events-none absolute -bottom-16 -right-6 hidden lg:block xl:-right-16" aria-hidden="true">
            <PhoneFrame className="w-[230px]">
              <PhoneBookingPreview />
            </PhoneFrame>
          </div>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:hidden">
          <EventToast icon={CalendarPlus} title="Nouvelle réservation" meta="Audi A3 · Nettoyage intérieur · Jeu. 14:30" />
          <EventToast icon={CreditCard} tone="success" title="Acompte payé" meta="34,20 € · carte bancaire" />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground lg:mt-24">
          Interface DetailFlow réelle — données de démonstration.
        </p>
      </Container>
    </section>
  )
}
