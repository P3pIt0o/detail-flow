import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { marketing } from "@/config/marketing"
import { siteConfig } from "@/config/site"

/**
 * Écran de maintenance PREMIUM de la vitrine marketing DetailFlow.
 *
 * Sobre, moderne, parfaitement responsive et fidèle à la charte (tokens de
 * thème : `background`, `foreground`, `primary`, `muted-foreground`, `border`).
 * Aucune apparence de page d'erreur : ton positif « quelque chose de nouveau
 * arrive », la plateforme reste présentée comme pleinement opérationnelle.
 *
 * Accès client conservé via « Je suis déjà client » → `/admin/login`.
 */
export function MaintenanceScreen() {
  const contactEmail = siteConfig.contact.email

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-foreground">
      {/* Voile de fond très discret, dérivé des tokens — texture, pas décor. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
        {/* Logo (wordmark) — identité DetailFlow, point d'accent en primary. */}
        <Link
          href="/admin/login"
          className="mb-10 text-2xl font-bold tracking-tight text-foreground"
          aria-label={`${marketing.brand.name} — espace client`}
        >
          {marketing.brand.name}
          <span className="text-primary">.</span>
        </Link>

        {/* Badge de contexte, sobre. */}
        <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
          Nouvelle version en préparation
        </span>

        <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl">
          Quelque chose de nouveau arrive.
        </h1>

        <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Nous préparons actuellement la nouvelle version de DetailFlow. La
          plateforme reste pleinement opérationnelle pour nos clients.
        </p>

        <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/admin/login"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 sm:w-auto"
          >
            Je suis déjà client
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>

          <a
            href={`mailto:${contactEmail}`}
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-transparent px-7 text-sm font-semibold text-foreground transition-colors hover:bg-card sm:w-auto"
          >
            Une question ? Contactez-nous
          </a>
        </div>
      </div>

      <footer className="absolute bottom-6 left-0 right-0 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {marketing.brand.name}. Tous droits réservés.
      </footer>
    </main>
  )
}
