import { ArrowRight, MapPin, Phone, RefreshCw, Star } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { AppWindow, Container, EventToast, PhoneFrame, SectionIntro } from "./primitives"
import { DEMO_SERVICES, formatEuro, formatMinutes } from "./demo-data"

const SYNCED = ["Prestations", "Tarifs", "Textes", "Galerie", "Logo", "Couleurs", "Avis", "Coordonnées", "Zone d'intervention"]

function TenantSiteDesktop() {
  return (
    <div className="text-left">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
            AL
          </span>
          <span className="text-[12.5px] font-semibold">Atelier Lumière</span>
        </div>
        <div className="hidden items-center gap-4 text-[11px] text-muted-foreground sm:flex">
          <span>Prestations</span>
          <span>Réalisations</span>
          <span>Avis</span>
          <span>Contact</span>
        </div>
        <span className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">Réserver</span>
      </div>

      <div className="px-5 py-8 sm:px-8 sm:py-10">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="size-3" aria-hidden="true" />
          Atelier à Lyon 7e · Déplacement jusqu&apos;à 40 km
        </p>
        <p className="mt-3 max-w-md text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          Le soin de votre véhicule, dans les règles de l&apos;art.
        </p>
        <div className="mt-5 flex gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground">
            Réserver en ligne
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </span>
          <span className="rounded-lg border border-border px-3.5 py-2 text-[12px] font-semibold">Demander un devis</span>
        </div>
      </div>

      <div className="grid gap-2.5 px-5 pb-6 sm:grid-cols-3 sm:px-8">
        {DEMO_SERVICES.slice(0, 3).map((s, i) => (
          <div key={s.id} className="rounded-xl border border-border bg-card p-3.5">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{s.category}</p>
            <p className="mt-1 text-[13px] font-semibold leading-snug">{s.name}</p>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              dès {formatEuro(s.prices[0])} · {formatMinutes(s.durations[0])}
            </p>
            {i === 0 && (
              <span className="mt-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Mis à jour à l&apos;instant
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[11px] text-muted-foreground sm:px-8">
        <span className="flex items-center gap-1">
          <Star className="size-3 fill-current text-amber-400" aria-hidden="true" />
          Avis clients publiés depuis l&apos;admin
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <Phone className="size-3" aria-hidden="true" />
          04 00 00 00 00
        </span>
      </div>
    </div>
  )
}

function TenantSiteMobile() {
  return (
    <div className="px-3.5 pb-5 text-left">
      <div className="flex items-center justify-between py-2">
        <span className="text-[12px] font-semibold">Atelier Lumière</span>
        <span className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">Réserver</span>
      </div>
      <p className="mt-4 text-[18px] font-semibold leading-tight tracking-tight">
        Le soin de votre véhicule, dans les règles de l&apos;art.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {DEMO_SERVICES.slice(0, 3).map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold">{s.name}</p>
              <p className="text-[10.5px] text-muted-foreground">{formatMinutes(s.durations[0])}</p>
            </div>
            <p className="shrink-0 text-[12px] font-semibold">dès {s.prices[0]} €</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Website() {
  return (
    <section id="site" aria-labelledby="site-title" className="scroll-mt-24 overflow-hidden border-t border-border py-24 sm:py-32">
      <Container>
        <div className="grid items-end gap-8 lg:grid-cols-2">
          <SectionIntro
            titleId="site-title"
            eyebrow="Site internet"
            title="Votre site et votre activité enfin connectés."
            lead="Votre site travaille avec votre planning. Modifiez une prestation dans l'admin : le site, le tunnel de réservation et les prix affichés suivent."
          />
          <ul className="flex flex-wrap gap-2 lg:justify-end" aria-label="Contenus synchronisés">
            {SYNCED.map((s) => (
              <li
                key={s}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-14 lg:pr-24">
          <Reveal>
            <AppWindow url="atelier-lumiere.detailflow.fr" className="lg:max-w-4xl">
              <TenantSiteDesktop />
            </AppWindow>
          </Reveal>

          <div className="pointer-events-none absolute -bottom-10 right-0 hidden lg:block" aria-hidden="true">
            <PhoneFrame className="w-[240px]">
              <TenantSiteMobile />
            </PhoneFrame>
          </div>

          <div className="pointer-events-none absolute -top-7 right-40 hidden w-72 lg:block">
            <div className="df-float">
              <EventToast icon={RefreshCw} title="Prestation modifiée" meta="Nettoyage intérieur · site synchronisé" />
            </div>
          </div>
        </div>

        <div className="mt-20 grid gap-6 border-t border-border pt-10 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Votre adresse</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Un site en ligne dès la création de votre espace, sur une adresse DetailFlow. Un domaine personnalisé peut
              être relié avec notre accompagnement.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Réservation intégrable</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Déjà un site ? Partagez votre lien de réservation ou intégrez le tunnel directement dans vos pages.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Présence en ligne</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Des outils conçus pour améliorer progressivement votre présence en ligne : pages indexables, adresses
              canoniques, métadonnées propres.
            </p>
          </div>
        </div>
      </Container>
    </section>
  )
}
