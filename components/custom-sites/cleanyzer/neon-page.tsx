import type { ReactNode } from "react"
import { getPublicContact } from "@/lib/public-contact"
import { resolveCustomSite } from "@/lib/custom-sites/server"
import { CleanyzerShell } from "./site-shell"
import { CLZ_SITE_NAV_ITEMS } from "./nav"
import { clzBookingNeon } from "./tokens"

/**
 * L59 — pages communes à tous les tenants (demande, pages légales) : coquille et thème néon si le
 * site personnalisé PUBLIÉ du tenant (résolu côté serveur) est Cleanyzer ; sinon contenu inchangé.
 */
export async function clzNeonPage(page: ReactNode): Promise<ReactNode> {
  if (!clzBookingNeon((await resolveCustomSite())?.key, false)) return page
  const contact = await getPublicContact()
  return (
    <CleanyzerShell navItems={CLZ_SITE_NAV_ITEMS} contact={{ phone: contact.phone, phoneRaw: contact.phoneRaw, email: contact.email }}>
      <div className="clz-booking-neon">{page}</div>
    </CleanyzerShell>
  )
}
