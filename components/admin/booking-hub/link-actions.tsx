"use client"

import { useCallback, useState } from "react"
import useSWR from "swr"
import { Check, Copy, Download, Loader2, QrCode, Share2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

import { btnOutline, btnPrimary } from "./styles"

/** Le lien public, affiché UNE seule fois, lisible sans débordement. */
export function LinkDisplay({ url }: { url: string }) {
  const display = url.replace(/^https?:\/\//, "")
  return (
    <p
      className="truncate rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm text-foreground"
      title={url}
    >
      {display}
    </p>
  )
}

/** Absolutise un lien relatif (aperçus) pour copie / partage / QR. */
function absolute(url: string) {
  if (/^https?:\/\//.test(url) || typeof window === "undefined") return url
  return new URL(url, window.location.origin).toString()
}

export function CopyLinkButton({ url, label = "Copier le lien", primary }: { url: string; label?: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const copy = useCallback(async () => {
    setError(false)
    try {
      await navigator.clipboard.writeText(absolute(url))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(true)
    }
  }, [url])
  return (
    <>
      <button type="button" onClick={copy} className={primary ? btnPrimary : btnOutline}>
        {copied ? <Check className="size-5" aria-hidden="true" /> : <Copy className="size-5" aria-hidden="true" />}
        {copied ? "Lien copié" : label}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          Copie impossible. Sélectionnez le lien et copiez-le.
        </p>
      )}
    </>
  )
}

export function ShareLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const share = useCallback(async () => {
    const target = absolute(url)
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Réserver en ligne", text: "Réservez en ligne :", url: target })
        return
      }
      await navigator.clipboard.writeText(target)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* partage annulé : rien à signaler. */
    }
  }, [url])
  return (
    <button type="button" onClick={share} className={btnOutline}>
      {copied ? <Check className="size-5" aria-hidden="true" /> : <Share2 className="size-5" aria-hidden="true" />}
      {copied ? "Lien copié" : "Partager"}
    </button>
  )
}

export function QrCodeButton({ url }: { url: string }) {
  const [open, setOpen] = useState(false)
  const { data: qr, isLoading } = useSWR(open ? ["qr", url] : null, async () => {
    const QR = await import("qrcode")
    return QR.toDataURL(absolute(url), { width: 512, margin: 2, errorCorrectionLevel: "M" })
  })

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnOutline}>
        <QrCode className="size-5" aria-hidden="true" />
        QR code
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="flex flex-col gap-4 p-5 sm:max-w-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-lg font-semibold">Votre QR code</DialogTitle>
              <DialogDescription>À imprimer ou afficher : vos clients le scannent pour réserver.</DialogDescription>
            </div>
            <DialogClose
              aria-label="Fermer"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogClose>
          </div>
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-card">
            {isLoading || !qr ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code de votre page de réservation" className="size-full" />
            )}
          </div>
          {qr && (
            <a href={qr} download="qr-code-reservation.png" className={btnPrimary}>
              <Download className="size-5" aria-hidden="true" />
              Télécharger
            </a>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Copier · Partager · QR code — en grille, jamais de débordement horizontal. */
export function LinkActions({ url, primaryCopy }: { url: string; primaryCopy?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
        <CopyLinkButton url={url} primary={primaryCopy} />
      </div>
      <ShareLinkButton url={url} />
      <QrCodeButton url={url} />
    </div>
  )
}
