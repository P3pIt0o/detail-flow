/** Contenu narratif de l'étape "overview". Rôle strictement narratif. */

import { marketing } from "@/config/marketing"

export function SceneOverview() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center md:items-start md:text-left">
      <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{marketing.overview.title}</h2>
      <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted-foreground">
        {marketing.overview.description}
      </p>
    </div>
  )
}
