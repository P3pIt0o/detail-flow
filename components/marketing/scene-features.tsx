/**
 * Contenu narratif de l'étape "features". Les 6 fonctionnalités se déplient
 * visuellement dans le panneau persistant (`detailflow-panel.tsx`) ; cette
 * scène ne porte que le texte d'accompagnement.
 */

export function SceneFeatures() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center md:items-start md:text-left">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Fonctionnalités</p>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        Tout ce dont votre atelier a besoin
      </h2>
      <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted-foreground">
        Réservation, devis, facturation, tableau de bord : chaque fonctionnalité s&apos;ouvre dans le même outil.
      </p>
    </div>
  )
}
