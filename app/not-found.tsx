import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ReportProblemButton } from "@/components/report-problem-button"

/**
 * 404 GLOBALE — doit rester entièrement statique et prérenderisable.
 *
 * Aucune dépendance à un tenant, aux en-têtes, à la base de données ou à
 * `useSearchParams()` : cette page est rendue hors contexte de requête (route
 * `/_not-found`). On utilise donc un simple <Link> vers l'accueil plutôt que
 * <CtaButton> (qui lit `useSearchParams()` et provoquerait un bailout CSR +
 * erreur de prerender « useSearchParams() should be wrapped in a suspense
 * boundary »).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70svh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-primary">Erreur 404</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Page introuvable</h1>
      <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
        Désolé, la page que vous recherchez n&apos;existe pas ou a été déplacée.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="group inline-flex h-13 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-medium tracking-tight text-primary-foreground shadow-[0_0_0_0_transparent] transition-all duration-300 hover:brightness-110 hover:shadow-[0_8px_30px_-8px_var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Retour à l&apos;accueil
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
      <div className="mt-6">
        <ReportProblemButton />
      </div>
    </div>
  )
}
