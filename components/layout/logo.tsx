import Link from "next/link"
import Image from "next/image"
import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"

type LogoProps = {
  className?: string
  /** Nom de la marque du tenant (repli : siteConfig). */
  brandName?: string
  /**
   * Source du logo de l'ENTREPRISE courante (multi-tenant), typiquement
   * `/api/company-logo?company={slug}`. Repli : `siteConfig.brand.logo`.
   * Chaque site n'affiche donc que SON propre logo, jamais celui d'un autre.
   */
  logoSrc?: string
  /**
   * Destination du lien. Doit conserver le contexte tenant (`?tenant=`) :
   * les appelants passent `withTenant("/", tenant)`. Repli : "/".
   */
  href?: string
}

/**
 * Logo de la marque.
 * - Si un `logoSrc` (logo du tenant) est fourni, affiche cette image.
 * - Sinon si `siteConfig.brand.logo` est renseigné, l'affiche.
 * - Sinon, affiche le nom de la marque en texte stylé (secours élégant).
 */
export function Logo({ className, brandName, logoSrc, href = "/" }: LogoProps) {
  const { name: fallbackName, logo, tagline } = siteConfig.brand
  const name = brandName || fallbackName
  const src = logoSrc || logo

  return (
    <Link href={href} className={cn("flex items-center gap-2", className)} aria-label={`${name} — accueil`}>
      {src ? (
        logoSrc ? (
          // Logo distant du tenant (Blob privé servi via route) : <img> simple
          // pour éviter d'avoir à autoriser un domaine dans next.config.
          // Taille responsive plus visible, proportions préservées (object-contain).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src || "/placeholder.svg"}
            alt={name}
            className="h-12 w-auto max-w-[180px] object-contain sm:h-14 lg:h-16"
          />
        ) : (
          <Image
            src={src || "/placeholder.svg"}
            alt={name}
            width={220}
            height={64}
            className="h-12 w-auto max-w-[180px] object-contain sm:h-14 lg:h-16"
            priority
          />
        )
      ) : (
        <span className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight text-foreground">
            {name}
            <span className="text-primary">.</span>
          </span>
          <span className="sr-only">{tagline}</span>
        </span>
      )}
    </Link>
  )
}
