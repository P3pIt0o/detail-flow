"use client"

import { useState } from "react"
import { ArrowLeft, Globe, Link2, MonitorSmartphone, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { CopyLinkButton } from "./link-actions"
import { btnOutline, btnPrimary } from "./styles"

type View = "choose" | "embed"

/**
 * « Vous avez déjà un site internet ? » — action SECONDAIRE.
 * Deux possibilités simples ; le code d'intégration n'apparaît QUE si le pro
 * choisit d'afficher la réservation directement sur son site.
 */
export function AddToSite({
  url,
  scriptSnippet,
  iframeSnippet,
  compact,
}: {
  url: string
  scriptSnippet: string
  iframeSnippet: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>("choose")

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setView("choose")
  }

  return (
    <div className={cn("flex flex-col gap-2", compact ? "" : "rounded-2xl border border-border bg-card p-4 sm:p-5")}>
      <p className="text-sm text-muted-foreground">Vous avez déjà un site internet ?</p>
      <button type="button" onClick={() => setOpen(true)} className={cn(btnOutline, "w-full sm:w-auto sm:self-start")}>
        <Globe className="size-5" aria-hidden="true" />
        Ajouter la réservation à mon site
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto p-5 sm:max-w-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              {view === "embed" && (
                <button
                  type="button"
                  onClick={() => setView("choose")}
                  className="-ml-1 mb-1 inline-flex items-center gap-1 self-start rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Retour
                </button>
              )}
              <DialogTitle className="text-lg font-semibold text-balance">
                {view === "choose" ? "Ajouter la réservation à mon site" : "Afficher la réservation sur mon site"}
              </DialogTitle>
              <DialogDescription className="text-pretty">
                {view === "choose"
                  ? "Choisissez la solution la plus simple pour vous."
                  : "Collez ce code dans votre site, à l'endroit où la réservation doit apparaître."}
              </DialogDescription>
            </div>
            <DialogClose
              aria-label="Fermer"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogClose>
          </div>

          {view === "choose" ? (
            <div className="flex flex-col gap-3">
              <OptionCard
                icon={<Link2 className="size-5" aria-hidden="true" />}
                title="Ajouter un bouton Réserver"
                text="Ajoutez simplement votre lien DetailFlow à votre bouton Réserver."
                badge="Le plus simple"
              >
                <CopyLinkButton url={url} label="Copier mon lien" primary />
              </OptionCard>
              <OptionCard
                icon={<MonitorSmartphone className="size-5" aria-hidden="true" />}
                title="Afficher la réservation directement sur mon site"
                text="Votre client réserve sans quitter votre site."
              >
                <button type="button" onClick={() => setView("embed")} className={btnOutline}>
                  Voir les instructions
                </button>
              </OptionCard>
            </div>
          ) : (
            <EmbedInstructions scriptSnippet={scriptSnippet} iframeSnippet={iframeSnippet} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OptionCard({
  icon,
  title,
  text,
  badge,
  children,
}: {
  icon: React.ReactNode
  title: string
  text: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-base font-semibold leading-snug text-foreground text-balance">{title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{text}</p>
          {badge && (
            <span className="mt-1 self-start rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {badge}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function EmbedInstructions({ scriptSnippet, iframeSnippet }: { scriptSnippet: string; iframeSnippet: string }) {
  const [mode, setMode] = useState<"script" | "iframe">("script")
  const [copied, setCopied] = useState(false)
  const snippet = mode === "script" ? scriptSnippet : iframeSnippet

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* l'utilisateur peut sélectionner le texte manuellement. */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-foreground">
        <li>Copiez le code ci-dessous</li>
        <li>Dans l&apos;éditeur de votre site, ajoutez un bloc « HTML » ou « Intégration »</li>
        <li>Collez le code puis publiez votre site</li>
      </ol>

      <pre className="max-h-40 overflow-auto rounded-xl border border-border bg-background p-3 text-xs leading-relaxed text-foreground">
        <code className="break-all whitespace-pre-wrap">{snippet}</code>
      </pre>

      <button type="button" onClick={copy} className={btnPrimary}>
        {copied ? "Code copié" : "Copier le code"}
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === "script" ? "iframe" : "script")}
        className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {mode === "script" ? "Le code ne fonctionne pas sur mon site ?" : "Revenir au code recommandé"}
      </button>
      {mode === "iframe" && (
        <p className="text-sm text-muted-foreground text-pretty">
          Cette version fonctionne sur les éditeurs qui refusent le code précédent.
        </p>
      )}
    </div>
  )
}
