import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { AppWindow, Container } from "./primitives"
import { DashboardMock } from "./dashboard-mock"

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="df-ink relative overflow-hidden bg-background text-foreground">
      <Container className="flex flex-col items-center pt-24 text-center sm:pt-32">
        <h2
          id="cta-title"
          className="max-w-3xl text-balance text-3xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl"
        >
          Votre activité mérite mieux qu&apos;un agenda et des messages WhatsApp.
        </h2>
        <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Centralisez votre site, vos réservations, vos clients et votre gestion dans DetailFlow.
        </p>
        <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/demarrer"
            className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
          >
            Créer mon espace gratuitement
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link
            href="/admin/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border px-6 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 sm:w-auto"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
      </Container>

      <Container className="relative mt-16 max-w-5xl sm:mt-20">
        <div className="relative h-[300px] overflow-hidden sm:h-[380px]" aria-hidden="true">
          <AppWindow url="votre-entreprise.detailflow.fr/admin" className="border-foreground/10">
            <DashboardMock />
          </AppWindow>
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
        </div>
      </Container>
    </section>
  )
}
