"use client"

/**
 * PILULE DE CONTACT CLEANYZER (L35) : Réserver (BookingV2) · Appeler · WhatsApp, fixée en bas.
 * Numéro : celui du tenant (`getContact().phoneRaw`), jamais en dur. Sans numéro (aperçu sans
 * tenant) : Réserver seul. L'affichage (après le haut de page) est piloté par la coquille.
 */

import Link from "next/link"
import { CLZ_BOOKING_HREF } from "./tokens"

/** Numéro WhatsApp international sans « + » (wa.me) depuis un numéro français ou international. */
export function clzWhatsappNumber(phoneRaw: string | null | undefined): string | null {
  // « +33 (0)6… » : le (0) national ne fait pas partie du numéro international.
  const digits = (phoneRaw ?? "").replace(/\(0\)/g, "").replace(/[^\d+]/g, "")
  if (!digits) return null
  if (digits.startsWith("+")) return digits.slice(1) || null
  if (digits.startsWith("00")) return digits.slice(2) || null
  if (digits.startsWith("0") && digits.length === 10) return `33${digits.slice(1)}`
  return digits
}

export function ClzContactPill({ phoneRaw, visible = true }: { phoneRaw: string | null; visible?: boolean }) {
  const wa = clzWhatsappNumber(phoneRaw)
  return (
    <nav
      className={`clz-neon-dock${visible ? " show" : ""}`}
      aria-label="Contact rapide"
      inert={!visible}
      aria-hidden={!visible}
    >
      <Link className="clz-neon-dock-book" href={CLZ_BOOKING_HREF}>
        Réserver
      </Link>
      {phoneRaw && (
        <a className="clz-neon-dock-ghost" href={`tel:${phoneRaw}`} aria-label="Appeler Cleanyzer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"
            />
          </svg>
          <span>Appeler</span>
        </a>
      )}
      {wa && (
        <a
          className="clz-neon-dock-ghost"
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Écrire à Cleanyzer sur WhatsApp"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .78.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.64.8-.79.97-.14.16-.29.18-.54.06a6.7 6.7 0 0 1-3.3-2.9c-.25-.43.25-.4.71-1.33.08-.16.04-.3-.02-.42l-.76-1.83c-.2-.48-.4-.41-.56-.42h-.48a.9.9 0 0 0-.66.31 2.8 2.8 0 0 0-.86 2.07 4.9 4.9 0 0 0 1.02 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.69 2.23.75 3.03.63.49-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.16-.48-.28z"
            />
          </svg>
          <span>WhatsApp</span>
        </a>
      )}
    </nav>
  )
}
