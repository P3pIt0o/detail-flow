import type { ReactNode } from "react"

/**
 * Réglages avancés repliés. `<details>` natif : le contenu reste monté, aucune
 * saisie n'est perdue à la fermeture et l'enregistrement les inclut toujours.
 */
export function MoreOptions({ hint, children }: { hint: string; children: ReactNode }) {
  return (
    <details className="border-y border-border">
      <summary className="flex min-h-11 cursor-pointer items-center py-2 text-sm font-medium text-foreground">
        <span>
          Plus d&apos;options <span className="font-normal text-muted-foreground">({hint})</span>
        </span>
      </summary>
      <div className="space-y-5 pb-4 pt-2">{children}</div>
    </details>
  )
}

/**
 * Bouton d'enregistrement : fixé en bas de l'écran sur mobile (au-dessus de la
 * barre de navigation), à sa place à partir de `sm`. `fixed` et non `sticky` :
 * le `<main>` de l'admin coupe le débordement, `sticky` n'y tiendrait pas.
 */
export function StickySaveBar({ children, pinned = true }: { children: ReactNode; pinned?: boolean }) {
  // `pinned={false}` : bouton à sa place, quand l'écran porte un autre formulaire.
  if (!pinned) return <div className="flex flex-wrap items-center gap-3">{children}</div>
  return (
    <>
      {/* Réserve la place de la barre fixe : le dernier champ reste accessible. */}
      <div className="h-20 sm:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {children}
      </div>
    </>
  )
}
