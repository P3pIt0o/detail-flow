import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { marketingOrigin } from "@/lib/tenant-shared"
import { ensureSyncSettings } from "@/lib/calendar-sync/store"
import { feedGoogleUrl, feedHttpsUrl, feedIphoneUrl, syncErrorMessage } from "@/lib/calendar-sync/ics-feed"
import { maskExternalUrl } from "@/lib/calendar-sync/safe-fetch"
import { CalendarSyncPanel } from "@/components/admin/calendar-sync-panel"

export const metadata = { title: "Mon agenda" }
export const dynamic = "force-dynamic"

export default async function MonAgendaPage() {
  const { tenant } = await requireCompanyMember(["OWNER", "ADMIN"])
  const settings = await ensureSyncSettings(tenant.id)
  const httpsUrl = feedHttpsUrl(marketingOrigin(process.env.NEXT_PUBLIC_ROOT_DOMAIN), settings.feedToken)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin/calendrier" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour au calendrier
      </Link>
      <CalendarSyncPanel
        iphoneUrl={feedIphoneUrl(httpsUrl)}
        googleUrl={feedGoogleUrl(httpsUrl)}
        rawAddress={httpsUrl}
        externalMasked={maskExternalUrl(settings.externalUrl)}
        lastSuccessAt={settings.lastSuccessAt ? settings.lastSuccessAt.toISOString() : null}
        errorMessage={syncErrorMessage(settings.lastError)}
      />
    </div>
  )
}
