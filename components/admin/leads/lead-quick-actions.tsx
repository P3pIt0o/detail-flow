"use client"

import { useState } from "react"
import { Check, Copy, Mail, MessageCircle, Phone } from "lucide-react"

/**
 * Actions de contact rapides d'une fiche prospect. Utilise les schémas sûrs
 * `tel:` / `mailto:` / `wa.me` (aucune API WhatsApp). Le lien de réservation est
 * résolu CÔTÉ SERVEUR (aucune reconstruction d'URL technique, aucune donnée
 * personnelle dans l'URL) et simplement copié ici.
 */
export function LeadQuickActions({
  phone,
  whatsappDigits,
  email,
  bookingUrl,
}: {
  phone: string | null
  whatsappDigits: string | null
  email: string | null
  bookingUrl: string | null
}) {
  const [copied, setCopied] = useState(false)

  async function copyBooking() {
    if (!bookingUrl) return
    try {
      await navigator.clipboard.writeText(bookingUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard indisponible : on n'affiche pas d'erreur bloquante */
    }
  }

  const base =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"

  return (
    <div className="flex flex-wrap gap-2">
      {phone ? (
        <a href={`tel:${phone.replace(/\s+/g, "")}`} className={base}>
          <Phone className="size-4" aria-hidden="true" />
          Appeler
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className={base}>
          <Mail className="size-4" aria-hidden="true" />
          Email
        </a>
      ) : null}
      {whatsappDigits ? (
        <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className={base}>
          <MessageCircle className="size-4" aria-hidden="true" />
          WhatsApp
        </a>
      ) : null}
      {bookingUrl ? (
        <button type="button" onClick={copyBooking} className={base}>
          {copied ? (
            <>
              <Check className="size-4" aria-hidden="true" />
              Lien copié
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" />
              Copier le lien de réservation
            </>
          )}
        </button>
      ) : null}
    </div>
  )
}
