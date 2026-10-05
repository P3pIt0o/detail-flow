"use server"

import { headers as nextHeaders } from "next/headers"
import { db } from "@/lib/db"
import { getCurrentTenant } from "@/lib/tenant"
import { checkSubscriptionRequestRateLimit, runSubmitSubscriptionRequest, type PublicRequestResponse } from "./public-request"

/** Server Action publique : le tenant vient UNIQUEMENT de l'en-tête serveur x-tenant-slug. */
export async function submitSubscriptionRequest(body: unknown): Promise<PublicRequestResponse> {
  const h = new Headers(await nextHeaders())
  return runSubmitSubscriptionRequest(body, {
    db,
    resolveCompanyId: async () => (await getCurrentTenant())?.id ?? null,
    checkRateLimit: () => checkSubscriptionRequestRateLimit(h),
  })
}
