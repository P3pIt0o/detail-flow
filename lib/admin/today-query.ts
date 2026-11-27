import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { invoices } from "@/lib/db/schema"
import { todayInTimezone, TODAY_BOOKINGS_MAX } from "@/lib/admin/queries"
import { COLLECTED_STATUSES } from "@/lib/admin/financials"
import { RELAUNCH_AFTER_DAYS, type TodayData } from "@/lib/admin/today"
import {
  netRevenueSumExpr,
  revenuePeriodDateExpr,
  revenueDocumentFilter,
  excludeCancelledOrDeletedBooking,
} from "@/lib/finance/revenue-sql"
import { addDaysYmd, zonedStartOfDayUtc } from "@/lib/leads/model"
import { isMissingRelationError } from "@/lib/leads/server"

/**
 * L96 — UNE seule requête pour tout l'écran « Aujourd'hui ».
 *
 * SÉCURITÉ : `companyId` est résolu côté serveur par l'appelant ; CHAQUE
 * sous-requête sur une table tenant filtre par ce `companyId` (booking_items,
 * sans colonne propre, n'est lue qu'à travers une réservation déjà filtrée).
 *
 * Les colonnes ajoutées par des migrations optionnelles sont lues via
 * `to_jsonb(...)->>'colonne'` (NULL si absente, jamais d'erreur).
 */

type Options = {
  timezone: string | null | undefined
  canStats: boolean
  canLeads: boolean
  now?: Date
}

function monthBounds(today: string) {
  const monthStart = `${today.slice(0, 7)}-01`
  const prevEnd = addDaysYmd(monthStart, -1)
  const nextStart = `${addDaysYmd(monthStart, 32).slice(0, 7)}-01`
  return { monthStart, monthEnd: addDaysYmd(nextStart, -1), prevStart: `${prevEnd.slice(0, 7)}-01`, prevEnd }
}

function safeTimezone(timezone: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: timezone || "Europe/Paris" })
    return timezone || "Europe/Paris"
  } catch {
    return "Europe/Paris"
  }
}

function buildQuery(cid: number, today: string, tz: string, o: Options, withOptional: boolean): SQL {
  const b = monthBounds(today)
  const optional = (query: SQL, fallback: SQL) => (withOptional ? query : fallback)
  const zero = sql`0`

  const revenue = (start: string, end: string) => sql`(
    select coalesce(${netRevenueSumExpr}, 0) from ${invoices}
    where ${invoices.companyId} = ${cid}
      and ${revenueDocumentFilter(cid)}
      and ${revenuePeriodDateExpr} >= ${start}::date
      and ${revenuePeriodDateExpr} <= ${end}::date
      and ${excludeCancelledOrDeletedBooking(cid)}
  )`
  const monthBookings = (start: string, end: string) => sql`(
    select count(*)::int from bookings
    where "companyId" = ${cid} and date >= ${start}::date and date <= ${end}::date and status <> 'cancelled'
  )`

  const collected = sql.join(
    COLLECTED_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  )

  const figures = o.canStats
    ? sql`jsonb_build_object(
        'revenueCents', ${revenue(b.monthStart, b.monthEnd)},
        'prevRevenueCents', ${revenue(b.prevStart, b.prevEnd)},
        'bookings', ${monthBookings(b.monthStart, b.monthEnd)},
        'prevBookings', ${monthBookings(b.prevStart, b.prevEnd)},
        'payments', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'status', status, 'grossAmountCents', "grossAmountCents", 'refundedAmountCents', "refundedAmountCents",
            'paidAt', "paidAt", 'refundedAt', "refundedAt")), '[]'::jsonb)
          from payments
          where "companyId" = ${cid} and status in (${collected})
            and (("paidAt"::date >= ${b.prevStart}::date and "paidAt"::date <= ${b.monthEnd}::date)
              or ("refundedAt"::date >= ${b.prevStart}::date and "refundedAt"::date <= ${b.monthEnd}::date))
        ),
        'visits30', ${optional(
          sql`(select coalesce(sum("uniqueVisitors"), 0)::int from tenant_analytics_daily
               where "companyId" = ${cid} and date >= ${addDaysYmd(today, -29)})`,
          zero,
        )}
      )`
    : sql`null::jsonb`

  const dueBefore = zonedStartOfDayUtc(addDaysYmd(today, 1), tz).toISOString()

  return sql`select jsonb_build_object(
    'settings', (
      select jsonb_build_object(
        'businessName', s."businessName", 'businessPhone', s."businessPhone", 'businessAddress', s."businessAddress",
        'billingConfirmed', s."billingProfileConfirmedAt" is not null,
        'vatEnabled', coalesce(to_jsonb(s)->>'vatEnabled', 'false') = 'true',
        'mobileEnabled', coalesce(to_jsonb(s)->>'mobile_service_enabled', 'true') <> 'false',
        'workshopEnabled', coalesce(to_jsonb(s)->>'workshop_enabled', 'false') = 'true',
        'workshopAddress', coalesce(to_jsonb(s)->>'workshop_address', ''),
        'workshopPostalCode', coalesce(to_jsonb(s)->>'workshop_postal_code', ''),
        'workshopCity', coalesce(to_jsonb(s)->>'workshop_city', ''),
        'hasBaseLocation', coalesce(to_jsonb(s)->>'businessLat', '') <> '' and coalesce(to_jsonb(s)->>'businessLng', '') <> '')
      from settings s where s."companyId" = ${cid} limit 1
    ),
    'serviceCount', (select count(*)::int from services where "companyId" = ${cid} and visible = true),
    'vehicleTypeCount', (select count(*)::int from vehicle_types where "companyId" = ${cid} and active = true),
    'openDayCount', (select count(*)::int from business_hours where "companyId" = ${cid} and "isOpen" = true),
    'publishedPage', ${optional(
      sql`exists (select 1 from public_page_config where "companyId" = ${cid} and "publishedAt" is not null)`,
      sql`false`,
    )},
    'hasBooking', exists (select 1 from bookings where "companyId" = ${cid} and "isDemoData" = false),
    'todayBookings', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t."startTime", t.id), '[]'::jsonb) from (
        select bk.id, bk."customerName", bk."customerPhone", bk.address, bk."startTime", bk.status,
               bk."totalCents", bk."depositCents", bk."isDemoData" as "isDemo",
               to_jsonb(bk)->>'location_type' as "locationType",
               (select coalesce(sum(p."grossAmountCents" - coalesce(p."refundedAmountCents", 0)), 0)::int
                from payments p
                where p."companyId" = ${cid} and p."bookingId" = bk.id and p.status in (${collected})) as "paidOnlineCents",
               (select coalesce(jsonb_agg(jsonb_build_object(
                  'service', i."serviceName", 'brand', i."vehicleBrand", 'model', i."vehicleModel",
                  'type', i."vehicleTypeName") order by i.id), '[]'::jsonb)
                from booking_items i where i."bookingId" = bk.id) as items
        from bookings bk
        where bk."companyId" = ${cid} and bk.date = ${today}::date
          and bk.status in ('confirmed', 'pending_deposit', 'completed')
        order by bk."startTime", bk.id
        limit ${TODAY_BOOKINGS_MAX}
      ) t
    ),
    'nextBooking', (
      select jsonb_build_object('date', date, 'startTime', "startTime") from bookings
      where "companyId" = ${cid} and date > ${today}::date and status in ('confirmed', 'pending_deposit')
      order by date, "startTime" limit 1
    ),
    'lapsed', (
      select jsonb_build_object('name', c.name, 'bookingId', c.anchor, 'lastDate', c.last_done) from (
        select
          coalesce(nullif(lower(btrim("customerEmail")), ''), regexp_replace(coalesce("customerPhone", ''), '[^0-9]', '', 'g')) as client_key,
          max(date) filter (where status = 'completed') as last_done,
          (array_agg(id order by date desc, id desc) filter (where status = 'completed'))[1] as anchor,
          (array_agg("customerName" order by date desc, id desc) filter (where status = 'completed'))[1] as name,
          bool_or(date >= ${today}::date and status in ('confirmed', 'pending_deposit')) as has_upcoming
        from bookings
        where "companyId" = ${cid} and "isDemoData" = false
        group by 1
      ) c
      where c.client_key <> '' and c.last_done <= ${addDaysYmd(today, -RELAUNCH_AFTER_DAYS)}::date and not c.has_upcoming
      order by c.last_done desc limit 1
    ),
    'pendingDeposit', (
      select count(*)::int from bookings
      where "companyId" = ${cid} and status = 'pending_deposit' and date >= ${today}::date
    ),
    'requests', (
      select jsonb_build_object(
        'newCount', count(*) filter (where status = 'new'),
        'acceptedCount', count(*) filter (where status = 'accepted'),
        'quoteSentCount', count(*) filter (where status = 'proposal_sent'),
        'firstActionId', max(id) filter (where status in ('new', 'accepted')))
      from custom_requests where "companyId" = ${cid}
    ),
    'unpaid', (
      select jsonb_build_object(
        'count', count(*), 'cents', coalesce(sum(u.remaining), 0),
        'currencies', coalesce(jsonb_agg(distinct u.currency), '[]'::jsonb), 'firstId', max(u.id))
      from (
        select i.id, coalesce(nullif(upper(btrim(i."currencyCode")), ''), 'EUR') as currency,
          i."balanceCents" - coalesce((
            select sum(cn."totalCents") from invoices cn
            where cn."companyId" = ${cid} and cn."originalInvoiceId" = i.id
              and cn."documentType" = 'credit_note' and cn.status in ('issued', 'paid')
          ), 0) as remaining
        from invoices i
        where i."companyId" = ${cid} and i."documentType" = 'invoice' and i.status = 'issued'
      ) u
      where u.remaining > 0
    ),
    'subscriptionRequests', ${optional(
      sql`(select count(*)::int from maintenance_subscription_requests
           where "companyId" = ${cid} and status = 'pending' and ("expiresAt" is null or "expiresAt" > now()))`,
      zero,
    )},
    'cancellationRequests', ${optional(
      sql`(select count(*)::int from maintenance_cancellation_requests where "companyId" = ${cid} and status = 'pending')`,
      zero,
    )},
    'leadsDue', ${
      o.canLeads
        ? optional(
            sql`(select count(*)::int from leads
                 where "companyId" = ${cid} and "nextFollowUpAt" <= ${dueBefore}::timestamp
                   and status in ('NEW', 'CONTACTED', 'APPOINTMENT_BOOKED'))`,
            zero,
          )
        : zero
    },
    'figures', ${figures}
  ) as data`
}

export async function loadTodayData(companyId: number, o: Options): Promise<TodayData> {
  const tz = safeTimezone(o.timezone)
  const today = todayInTimezone(tz, o.now)

  const run = async (withOptional: boolean) => {
    const result = await db.execute(buildQuery(companyId, today, tz, o, withOptional))
    return (result as unknown as { rows: { data: Omit<TodayData, "today"> }[] }).rows[0].data
  }

  let data: Omit<TodayData, "today">
  try {
    data = await run(true)
  } catch (err) {
    // Table optionnelle absente (migration non appliquée) : l'accueil reste utilisable.
    if (!isMissingRelationError(err)) throw err
    data = await run(false)
  }

  return {
    ...data,
    today,
    settings: data.settings ?? {
      businessName: null,
      businessPhone: null,
      businessAddress: null,
      billingConfirmed: false,
      mobileEnabled: true,
      workshopEnabled: false,
      workshopAddress: "",
      workshopPostalCode: "",
      workshopCity: "",
      hasBaseLocation: false,
      vatEnabled: false,
    },
    figures: data.figures ? { ...data.figures, ...monthBounds(today) } : null,
  }
}
