"use client"

import { useState, useTransition } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { setPublicationFlagAction } from "@/app/super-admin/actions"
import { bookingLinkPath } from "@/lib/company/publication-shared"
import { Switch } from "@/components/ui/switch"

type Props = {
  companyId: number
  slug: string
  hasCustomSite: boolean
  customSitePublished: boolean
  bookingLinkEnabled: boolean
  rootDomain?: string
}

export function PublicationControls({
  companyId,
  slug,
  hasCustomSite,
  customSitePublished,
  bookingLinkEnabled,
  rootDomain,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const root = rootDomain?.replace(/^https?:\/\//, "").replace(/\/$/, "")
  const link = root
    ? `https://${root.startsWith("www.") ? root : `www.${root}`}${bookingLinkPath(slug)}`
    : bookingLinkPath(slug)

  function toggle(key: "customSitePublished" | "bookingLinkEnabled", value: boolean) {
    startTransition(async () => {
      const res = await setPublicationFlagAction(companyId, key, value)
      setFeedback(res.ok ? { ok: true, text: res.message ?? "Enregistré." } : { ok: false, text: res.error })
    })
  }

  async function copyLink() {
    const absolute = link.startsWith("http") ? link : `${window.location.origin}${link}`
    await navigator.clipboard.writeText(absolute)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">Lien de réservation</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{link}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted"
            aria-label="Copier le lien de réservation"
          >
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          </button>
          <Switch
            checked={bookingLinkEnabled}
            disabled={pending}
            onCheckedChange={(v) => toggle("bookingLinkEnabled", v)}
            aria-label="Activer le lien de réservation"
          />
        </div>
      </div>

      {hasCustomSite && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">Site personnalisé publié</p>
            <p className="text-xs text-muted-foreground">
              {customSitePublished ? "Visible publiquement." : "Brouillon : le site standard est servi."}
            </p>
          </div>
          <Switch
            checked={customSitePublished}
            disabled={pending}
            onCheckedChange={(v) => toggle("customSitePublished", v)}
            aria-label="Publier le site personnalisé"
          />
        </div>
      )}

      {pending && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Enregistrement…
        </p>
      )}
      {feedback && !pending && (
        <p role="status" className={`text-xs ${feedback.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}
