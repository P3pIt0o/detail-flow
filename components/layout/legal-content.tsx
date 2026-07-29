/**
 * Conteneur de mise en forme pour les pages juridiques (texte long).
 * Applique une largeur de lecture confortable et un style typographique
 * cohérent sans dépendre du plugin @tailwindcss/typography.
 */

export function LegalContent({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8
        [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground
        [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-foreground
        [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-muted-foreground
        [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul]:text-muted-foreground
        [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4
        [&_strong]:text-foreground"
    >
      {children}
    </div>
  )
}
