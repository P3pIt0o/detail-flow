"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { withTenant } from "@/lib/tenant-link"

/**
 * Bouton d'action principal réutilisable, rendu comme un lien Next.js.
 * On ne s'appuie pas sur le <Button> shadcn/base-ui ici pour garder un
 * contrôle total du style premium et permettre le passage d'un href.
 */

type CtaButtonProps = {
  href: string
  children: React.ReactNode
  variant?: "primary" | "outline"
  size?: "md" | "lg"
  showArrow?: boolean
  className?: string
  /** Ouvrir dans un nouvel onglet (liens externes) */
  external?: boolean
}

export function CtaButton({
  href,
  children,
  variant = "primary",
  size = "md",
  showArrow = false,
  className,
  external = false,
}: CtaButtonProps) {
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

  const variants = {
    primary:
      "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_0_0_transparent] hover:shadow-[0_8px_30px_-8px_var(--color-primary)]",
    outline: "border border-border text-foreground hover:border-primary hover:text-primary bg-transparent",
  }

  const sizes = {
    md: "h-11 px-6 text-sm",
    lg: "h-13 px-8 text-base",
  }

  const classes = cn(base, variants[variant], sizes[size], className)

  // Conserve le ?tenant= courant sur les liens internes (aperçu v0). Sans effet
  // sur les liens externes (tel:, https:) ni sur les sous-domaines en prod.
  const tenant = useSearchParams().get("tenant")
  const resolvedHref = external ? href : withTenant(href, tenant)

  const content = (
    <>
      {children}
      {showArrow && (
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
      )}
    </>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {content}
      </a>
    )
  }

  return (
    <Link href={resolvedHref} className={classes}>
      {content}
    </Link>
  )
}
