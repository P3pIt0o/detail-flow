import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsTabs } from "@/components/admin/settings/settings-tabs"
import { getSettings, getBusinessHours, getTimeOff, getServices } from "@/lib/booking/queries"
import { getFullSettings } from "@/lib/invoice/queries"
import { BusinessContact } from "@/components/admin/settings/business-contact"
import { SiteBranding } from "@/components/admin/settings/site-branding"
import { PublicSiteContent } from "@/components/admin/settings/public-site-content"
import { SectionOrderSettings } from "@/components/admin/settings/section-order-settings"
import { resolveSiteContent, resolveSectionOrder, HOME_SECTION_LABELS } from "@/lib/site-content"
import { GallerySettings } from "@/components/admin/settings/gallery-settings"
import { listGalleryItems } from "./gallery-actions"
import { PhotoGallerySettings } from "@/components/admin/settings/photo-gallery-settings"
import { listPhotoGalleryItems } from "./photo-gallery-actions"
import { ReviewsSourceSettings } from "@/components/admin/settings/reviews-source-settings"
import { listReviews } from "./review-actions"
import { getReviewsSourceConfig } from "@/lib/reviews/config"
import { getGooglePlaceDetails } from "@/lib/reviews/google-places"
import { AppearanceSettings } from "@/components/admin/settings/appearance-settings"
import { LocationSettings } from "@/components/admin/settings/location-settings"
import { getLocationConfig, locationColumnsExist } from "@/lib/booking/location"
import { DEFAULT_LOCATION_CONFIG, describeLocation, sanitizeLocationLabels } from "@/lib/booking/location-shared"
import { redirect } from "next/navigation"
import { LinkActions, LinkDisplay } from "@/components/admin/booking-hub/link-actions"
import { humanReservationUrl } from "@/lib/admin/public-link"
import { buildSettingsStatus } from "@/lib/admin/settings-status"

/** Libellés de lieu tels que saisis (vide = texte par défaut affiché en placeholder). */
function storedLocationLabels(raw: unknown) {
  const res = sanitizeLocationLabels(raw)
  return res.ok ? res.value : {}
}
import { PlanningSettings } from "@/components/admin/settings/planning-settings"
import { HoursSettings } from "@/components/admin/settings/hours-settings"
import { TimeOffSettings } from "@/components/admin/settings/timeoff-settings"
import { InvoicingSettings } from "@/components/admin/settings/invoicing-settings"
import { SellerBillingProfile } from "@/components/admin/settings/seller-billing-profile"
import { BillingSetupCard } from "@/components/admin/settings/billing-setup-card"
import { computeBillingSetup } from "@/lib/billing/setup-checklist"
import { SecuritySettings } from "@/components/admin/settings/security-settings"
import { SupportForm } from "@/components/admin/settings/support-form"
import { CustomRequestsSettings } from "@/components/admin/settings/custom-requests-settings"
import { resolveCustomRequestsConfig } from "@/lib/custom-requests"
import { SpiritSiteTexts } from "@/components/admin/settings/spirit-site-texts"
import { getSpiritSiteTexts } from "./spirit-texts-actions"
import { SpiritServicePhotos } from "@/components/admin/settings/spirit-service-photos"
import { getSpiritServicePhotos } from "./spirit-photos-actions"
import { SmsSettings } from "@/components/admin/settings/sms-settings"
import { NotificationsSettings } from "@/components/admin/settings/notifications-settings"
import { getLotDSettings, notificationsSchemaReady } from "@/lib/notifications/settings-store"
import { resolveTenantReviewLink } from "@/lib/notifications/review-resolver"
import { reviewRequestInfrastructureReady } from "@/lib/notifications/runtime"
import { PromoSettings } from "@/components/admin/settings/promo-settings"
import { listPromoCodes } from "./promo-actions"
import { PaymentsSettings } from "@/components/admin/settings/payments-settings"
import { getTenantPaymentConfig } from "@/lib/payments/config"
import { getSmsBalance, ensureMonthlySmsGrant } from "@/lib/sms/credits"
import { getStripeRechargeStatus } from "@/lib/sms/checkout"
import { monthlyIncludedSms } from "@/lib/sms/config"
import { SMS_DEFAULT_TEMPLATE } from "@/lib/sms/config"
import { canUseFeature } from "@/lib/licensing/enforce"
import { SettingsCategoryGrid } from "@/components/admin/settings/settings-category-grid"
import { SettingsSearch } from "@/components/admin/settings/settings-search"
import { SettingsHighlight } from "@/components/admin/settings/settings-highlight"
import {
  findCategoryByTab,
  getSettingsHome,
  getVisibleSettingsCategories,
  legacySettingsRedirect,
} from "@/lib/admin/settings-nav"
import { resolveDashboardIntent } from "@/lib/onboarding/intent"
import { withTenant } from "@/lib/tenant-link"
import { tenantPublicPathUrl } from "@/lib/tenant-shared"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { smsCredits } from "@/lib/db/schema"
import { OnlineBookingSettings } from "@/components/admin/settings/online-booking-settings"
import { buildWidgetPrimaryAction, resolveDashboardPrimaryMode } from "@/lib/admin/primary-action"
import { getBookingDistributionMode } from "@/lib/company/booking-distribution"
import { buildEmbedScriptSnippet } from "@/lib/embed/snippet"

export const metadata: Metadata = { title: "Paramètres" }

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; tenant?: string; sms_session?: string; bloc?: string }>
}) {
  const { tenant, role, isSuperAdmin } = await requireCompanyMember()
  // `tab` (historique) => sous-section ; `tenant` (URL) => isolation en aperçu.
  // `bloc` (recherche) est lu côté navigateur par SettingsHighlight.
  const { tab, tenant: tenantParam, sms_session, bloc } = await searchParams
  // Ancien lien de l'acompte (bloc de « planning ») => son nouvel onglet.
  const moved = legacySettingsRedirect({ tab, bloc, tenant: tenantParam })
  if (moved) redirect(moved)
  const smsSession = typeof sms_session === "string" && sms_session.startsWith("cs_") ? sms_session : null

  // Site Spirit ACS : shell 100 % personnalisé. On masque UNIQUEMENT pour lui les
  // réglages du site standard sans effet (couleurs, ordre des sections, logo
  // standard, libellés de boutons Hero, sections « Pourquoi nous choisir » et
  // intro « Prestations » non rendues) et les modules non utilisés (Réservations,
  // Paiements en ligne, Codes promo). Les autres tenants restent inchangés.
  const isSpiritSite = tenant.customSiteKey === "spirit-acs"
  // Éditeur « Textes du site » réservé aux administrateurs (OWNER/ADMIN) ou au
  // super-admin plateforme. Un EMPLOYEE voit un message, sans faire échouer la
  // page. Les valeurs effectives (override → fallback) sont résolues côté
  // serveur, jamais depuis le client.
  const canEditSpiritTexts = isSpiritSite && (isSuperAdmin || role === "OWNER" || role === "ADMIN")
  const spiritTextsResult = canEditSpiritTexts ? await getSpiritSiteTexts() : null
  const spiritPhotosResult = canEditSpiritTexts ? await getSpiritServicePhotos() : null
  // Parcours d'onboarding RÉSOLU côté serveur (customSiteKey non nul => null,
  // priorité au comportement custom). booking_only => la catégorie « Site
  // public » (réglages de vitrine) est masquée : le pro a déjà son site.
  const dashboardIntent = resolveDashboardIntent({
    persisted: tenant.onboardingIntent,
    customSiteKey: tenant.customSiteKey,
  })
  // Catégories visibles pour CE tenant (filtrage centralisé, isolé par
  // customSiteKey + intention). Standard/legacy/public_page => liste complète.
  const visibleCategories = getVisibleSettingsCategories(tenant.customSiteKey, dashboardIntent)
  // Catégorie active déduite de l'onglet historique, en respectant le masquage
  // tenant : un ?tab= inconnu OU masqué (Spirit / booking_only) renvoie null => grille.
  const activeCategory = findCategoryByTab(tab, tenant.customSiteKey, dashboardIntent)
  const activeTab = activeCategory && tab ? tab : undefined
  const CategoryIcon = activeCategory?.icon
  const visibleSubTabs = activeCategory?.subTabs ?? []

  // Attribution mensuelle SMS incluse (idempotente) : un nouvel abonné PRO n'attend pas le cron.
  try {
    await ensureMonthlySmsGrant(tenant.id)
  } catch (e) {
    console.error("[sms] grant mensuel échoué:", e instanceof Error ? e.message : e)
  }
  const smsCheckoutReturn = smsSession ? await getStripeRechargeStatus(tenant.id, smsSession) : null

  const [
    settings,
    hours,
    timeOff,
    fullSettings,
    galleryItems,
    photoGalleryItems,
    reviewItems,
    smsBalance,
    smsCreditRow,
    promoCodesList,
    servicesList,
  ] = await Promise.all([
    getSettings(tenant.id),
    getBusinessHours(tenant.id),
    getTimeOff(tenant.id),
    getFullSettings(tenant.id),
    listGalleryItems(),
    listPhotoGalleryItems(),
    listReviews(),
    getSmsBalance(tenant.id),
    db
      .select({ betaBonusGrantedAt: smsCredits.betaBonusGrantedAt })
      .from(smsCredits)
      .where(eq(smsCredits.companyId, tenant.id))
      .limit(1),
    listPromoCodes(),
    getServices(tenant.id),
  ])

  // Lieu : écran « Mon entreprise » et ligne d'état de l'accueil.
  const [locationConfig, locationAvailable] =
    !activeCategory || activeCategory.id === "entreprise"
      ? await Promise.all([getLocationConfig(tenant.id), locationColumnsExist()])
      : [null, false]

  // Liste allégée des prestations du tenant pour le ciblage des codes promo.
  const promoServiceOptions = servicesList.map((s) => ({ id: s.id, name: s.name }))

  // Source des avis (manuel/Google) + aperçu de l'établissement Google enregistré.
  // Défensif : sans migration ou hors Google, on reste en manuel sans aperçu.
  const reviewsSourceConfig = await getReviewsSourceConfig(tenant.id)
  let googlePlacePreview = null
  if (reviewsSourceConfig.source === "google" && reviewsSourceConfig.googlePlaceId) {
    const res = await getGooglePlaceDetails(reviewsSourceConfig.googlePlaceId)
    if (res.ok) {
      googlePlacePreview = {
        placeId: res.data.placeId,
        name: res.data.name,
        rating: res.data.rating,
        userRatingCount: res.data.userRatingCount,
        googleMapsUri: res.data.googleMapsUri,
      }
    }
  }

  // Droit d'ACTIVER/UTILISER les SMS (feature sms). LEGACY => true (inchangé).
  // Purement indicatif pour l'UI : la sécurité reste côté serveur (actions + cron).
  const smsFeatureEnabled = await canUseFeature(tenant.id, "sms")

  // Réglages LOT D (rappel pro + demande d'avis) + droits d'offre. Indicatif pour
  // l'UI ; la garde réelle est côté serveur (actions + cron). Le lien d'avis
  // effectif est résolu serveur (Place ID Google configuré) sans jamais l'inventer.
  const [lotDSettings, lotDMigrationApplied, canEmailReminders, canReviewRequests, resolvedReviewLink] =
    await Promise.all([
      getLotDSettings(tenant.id),
      notificationsSchemaReady(),
      canUseFeature(tenant.id, "email_reminders"),
      canUseFeature(tenant.id, "review_requests"),
      resolveTenantReviewLink(tenant.id),
    ])

  // Config paiements du tenant (commission résolue côté serveur : override → global).
  const paymentConfig = await getTenantPaymentConfig(tenant.id)

  // Réservation en ligne : uniquement pour les tenants en mode widget, à partir
  // du tenant authentifié (NULL / link => rien ne change).
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const onlineBooking =
    resolveDashboardPrimaryMode(await getBookingDistributionMode(tenant.id)) === "widget"
      ? buildWidgetPrimaryAction({
          slug: tenant.slug,
          active: true,
          scriptSnippet: buildEmbedScriptSnippet(tenant.slug, rootDomain),
          rootDomain,
        })
      : null

  const revolutUrl = process.env.REVOLUT_PAYMENT_URL ?? null
  const revolutQrSrc = process.env.REVOLUT_PAYMENT_QR_URL ?? null

  // Avancement de facturation calculé UNE fois : réutilisé par la carte de la
  // catégorie facturation ET l'indicateur de la carte d'accueil.
  const billingSetup = computeBillingSetup({
    country: (tenant.country ?? "FR").toUpperCase(),
    confirmed: Boolean(fullSettings?.billingProfileConfirmedAt),
    legalForm: fullSettings?.legalForm,
    legalRegistrationNumber:
      fullSettings?.legalRegistrationNumber ??
      ((tenant.country ?? "FR").toUpperCase() === "FR" ? fullSettings?.invoiceSiret : ""),
    vatNumber: fullSettings?.vatNumber,
    vatStatus: fullSettings?.vatStatus,
    vatEnabled: fullSettings?.vatEnabled ?? false,
    vatExemptNote: fullSettings?.vatExemptNote,
    defaultCurrency: fullSettings?.defaultCurrency,
    invoiceCompanyAddress: fullSettings?.invoiceCompanyAddress,
    invoiceIban: fullSettings?.invoiceIban,
    invoiceDueDays: fullSettings?.invoiceDueDays,
    invoicePrefix: fullSettings?.invoicePrefix,
    frBusinessCategory: fullSettings?.frBusinessCategory,
  })

  // Accueil : entrées visibles et leur état, à partir des seules lectures du tenant connecté.
  const home = getSettingsHome(tenant.customSiteKey, dashboardIntent)
  const homeStatus = buildSettingsStatus({
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    businessPhone: settings.businessPhone,
    locationSummary: describeLocation(locationConfig ?? DEFAULT_LOCATION_CONFIG),
    servicesCount: servicesList.length,
    openDaysCount: hours.filter((h) => h.isOpen).length,
    vacationMode: settings.vacationMode,
    depositType: settings.depositType,
    depositValue: settings.depositValue,
    paymentsEnabled: paymentConfig.paymentsEnabled,
    paymentsReady: paymentConfig.chargesEnabled,
    billingComplete: billingSetup.allMandatoryDone,
    smsAllowed: smsFeatureEnabled,
    smsEnabled: settings.smsRemindersEnabled,
    smsOffsetHours: settings.smsReminderOffsetHours,
    smsBalance: smsBalance.balance,
    customSiteKey: tenant.customSiteKey,
    onboardingIntent: dashboardIntent,
  })

  const planningProps = {
    maxVehiclesPerDay: settings.maxVehiclesPerDay,
    slotIntervalMin: settings.slotIntervalMin,
    bufferMin: settings.bufferMin,
    minNoticeHours: settings.minNoticeHours,
    depositType: (settings.depositType === "fixed" ? "fixed" : settings.depositType === "none" ? "none" : "percent") as
      | "none"
      | "fixed"
      | "percent",
    depositValue: settings.depositValue,
    depositMethods: (fullSettings?.depositMethods ?? "").split(",").filter(Boolean),
    depositInstructions: fullSettings?.depositInstructions ?? "",
    vacationMode: settings.vacationMode,
    vacationMessage: settings.vacationMessage ?? "",
  }

  // Lien et QR code de la page de réservation (Spirit ACS fonctionne sur devis).
  const reservationUrl = isSpiritSite ? null : humanReservationUrl(tenant.slug, rootDomain)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">Paramètres</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Personnalisez DetailFlow selon le fonctionnement de votre entreprise.
        </p>
      </div>

      <SettingsSearch
        tenantParam={tenantParam ?? null}
        customSiteKey={tenant.customSiteKey ?? null}
        onboardingIntent={dashboardIntent}
      />

      {!activeCategory ? (
        <>
          {onlineBooking ? (
            <OnlineBookingSettings bookingUrl={onlineBooking.bookingUrl} scriptSnippet={onlineBooking.scriptSnippet} />
          ) : null}
          {/* Accueil : une ligne par entrée avec son état, puis « Mon compte ». */}
          <SettingsCategoryGrid
            main={home.main}
            account={home.account}
            status={homeStatus}
            tenantParam={tenantParam ?? null}
          />
        </>
      ) : (
        <div className="space-y-6">
          {/* En-tête de catégorie + retour */}
          <div className="space-y-3">
            <Link
              href={withTenant("/admin/parametres", tenantParam ?? null)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour aux paramètres
            </Link>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {CategoryIcon && <CategoryIcon className="size-5" aria-hidden="true" />}
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">{activeCategory.label}</h2>
                <p className="text-sm text-muted-foreground text-pretty">{activeCategory.description}</p>
              </div>
            </div>
          </div>

          {activeCategory.id === "site" && reservationUrl ? (
            <section aria-label="Lien et QR code" className="max-w-2xl space-y-3 border-b border-border pb-6">
              <h3 className="text-base font-semibold text-foreground">Votre lien de réservation</h3>
              <p className="text-sm text-muted-foreground text-pretty">
                Vos clients réservent depuis ce lien ou en scannant le QR code.
              </p>
              <LinkDisplay url={reservationUrl} />
              <LinkActions url={reservationUrl} />
            </section>
          ) : null}

          {/* Onglet piloté par l'adresse : un résultat de recherche cliqué depuis
              cette page change toujours d'onglet, même après un clic sur une pastille. */}
          <SettingsTabs defaultTab={activeTab} tabs={visibleSubTabs.map((t) => t.value)} className="w-full">
            {/* Navigation secondaire légère, uniquement si plusieurs sous-sections.
                Les pastilles passent à la ligne : aucune barre coupée sur mobile. */}
            {visibleSubTabs.length > 1 && (
              <TabsList className="flex h-auto flex-wrap justify-start gap-1 p-1">
                {visibleSubTabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="flex-none px-3 py-1.5">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}

            {/* ENTREPRISE */}
            {activeCategory.id === "entreprise" && (
              <>
                <TabsContent value="business" className="mt-6">
                  <div id="reglage-business">
                    <BusinessContact
                      businessName={settings.businessName ?? ""}
                      businessEmail={settings.businessEmail ?? ""}
                      businessPhone={settings.businessPhone ?? ""}
                    />
                  </div>
                </TabsContent>
                {!isSpiritSite && (
                  <TabsContent value="travel" className="mt-6">
                    <div id="reglage-travel">
                      <LocationSettings
                        initial={locationConfig ?? DEFAULT_LOCATION_CONFIG}
                        initialLabels={storedLocationLabels((tenant.siteContent as { locationLabels?: unknown } | null)?.locationLabels)}
                        available={locationAvailable}
                        travel={{
                          businessAddress: settings.businessAddress ?? "",
                          freeDistanceKm: Number.parseFloat(settings.freeDistanceKm),
                          pricePerKmCents: settings.pricePerKmCents,
                          maxDistanceKm: Number.parseFloat(settings.maxDistanceKm),
                          roundTrip: settings.roundTrip,
                          hasCoords: Boolean(settings.businessLat && settings.businessLng),
                        }}
                      />
                    </div>
                  </TabsContent>
                )}
              </>
            )}

            {/* DISPONIBILITÉS */}
            {activeCategory.id === "reservations" && (
              <>
                <TabsContent value="hours" className="mt-6">
                  <div id="reglage-hours">
                    <HoursSettings hours={hours} />
                  </div>
                </TabsContent>
                <TabsContent value="timeoff" className="mt-6">
                  <div id="reglage-timeoff">
                    <TimeOffSettings periods={timeOff} />
                  </div>
                </TabsContent>
                <TabsContent value="planning" className="mt-6">
                  <div id="reglage-planning">
                  <PlanningSettings section="planning" {...planningProps} />
                  </div>
                </TabsContent>
              </>
            )}

            {/* SITE PUBLIC */}
            {activeCategory.id === "site" && (
              <>
                <TabsContent value="site" className="mt-6">
                  <div id="reglage-site">
                  {isSpiritSite ? (
                    <>
                      <div className="mb-6 rounded-2xl border border-border bg-muted/30 p-4">
                        <h2 className="text-lg font-semibold text-foreground">Textes du site Spirit ACS</h2>
                        <p className="mt-1 text-sm text-muted-foreground text-pretty">
                          Votre site utilise un modèle personnalisé. Seuls les textes réellement affichés sont
                          modifiables ici : les réglages du modèle standard (couleurs, logo, ordre des sections) sont
                          masqués car ils n&apos;ont aucun effet sur votre site.
                        </p>
                      </div>
                      {spiritTextsResult?.ok && spiritTextsResult.values ? (
                        <SpiritSiteTexts initialValues={spiritTextsResult.values} />
                      ) : (
                        <p className="text-sm text-muted-foreground text-pretty">
                          Les textes du site sont modifiables par un administrateur du compte.
                        </p>
                      )}
                      {spiritPhotosResult?.ok && spiritPhotosResult.photos ? (
                        <div className="mt-10 border-t border-border pt-8">
                          <SpiritServicePhotos companyId={tenant.id} initialPhotos={spiritPhotosResult.photos} />
                        </div>
                      ) : null}
                      <div className="mt-10 border-t border-border pt-8">
                        <h2 className="mb-4 text-lg font-semibold text-foreground">CGV et réseaux sociaux</h2>
                        <SiteBranding
                          logoPathname={tenant.logoUrl ?? null}
                          cgv={tenant.cgv ?? ""}
                          socialLinks={(tenant.socialLinks as Record<string, string> | null) ?? null}
                          hero={{
                            heroTitle: tenant.heroTitle ?? "",
                            heroHighlight: tenant.heroHighlight ?? "",
                            heroSubtitle: tenant.heroSubtitle ?? "",
                            heroCtaPrimary: tenant.heroCtaPrimary ?? "",
                            heroCtaSecondary: tenant.heroCtaSecondary ?? "",
                          }}
                          simplified
                          hideHeroCard
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <SiteBranding
                        logoPathname={tenant.logoUrl ?? null}
                        cgv={tenant.cgv ?? ""}
                        socialLinks={(tenant.socialLinks as Record<string, string> | null) ?? null}
                        hero={{
                          heroTitle: tenant.heroTitle ?? "",
                          heroHighlight: tenant.heroHighlight ?? "",
                          heroSubtitle: tenant.heroSubtitle ?? "",
                          heroCtaPrimary: tenant.heroCtaPrimary ?? "",
                          heroCtaSecondary: tenant.heroCtaSecondary ?? "",
                        }}
                      />
                      <div className="mt-10 border-t border-border pt-8">
                        <h2 className="mb-1 text-lg font-semibold text-foreground">Autres sections du site</h2>
                        <PublicSiteContent content={resolveSiteContent(tenant.siteContent)} />
                      </div>
                      <div className="mt-10 border-t border-border pt-8">
                        <SectionOrderSettings
                          items={resolveSectionOrder(tenant.siteContent).map((key) => ({
                            key,
                            label: HOME_SECTION_LABELS[key],
                          }))}
                        />
                      </div>
                    </>
                  )}
                  </div>
                </TabsContent>
                {!isSpiritSite && (
                  <TabsContent value="appearance" className="mt-6">
                    <div id="reglage-appearance">
                      <AppearanceSettings
                        brandPrimary={tenant.brandPrimary ?? null}
                        brandSecondary={tenant.brandSecondary ?? null}
                      />
                    </div>
                  </TabsContent>
                )}
                <TabsContent value="gallery" className="mt-6">
                  <div id="reglage-gallery" className="space-y-10">
                    <GallerySettings items={galleryItems} slug={tenant.slug} companyId={tenant.id} />
                    <div className="border-t border-border pt-8">
                      <PhotoGallerySettings items={photoGalleryItems} slug={tenant.slug} companyId={tenant.id} />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="reviews" className="mt-6">
                  <div id="reglage-reviews">
                    <ReviewsSourceSettings
                      items={reviewItems}
                      initialSource={reviewsSourceConfig.source}
                      initialPreview={googlePlacePreview}
                    />
                  </div>
                </TabsContent>
                {!isSpiritSite && (
                  <TabsContent value="custom-requests" className="mt-6">
                    <div id="reglage-custom-requests">
                      <CustomRequestsSettings
                        config={resolveCustomRequestsConfig((tenant.siteContent as { customRequests?: unknown } | null)?.customRequests)}
                        requestPageUrl={
                          dashboardIntent === "booking_only"
                            ? tenantPublicPathUrl("/demande", tenant.slug, process.env.NEXT_PUBLIC_ROOT_DOMAIN)
                            : null
                        }
                      />
                    </div>
                  </TabsContent>
                )}
              </>
            )}

            {/* PAIEMENTS ET FACTURES */}
            {activeCategory.id === "billing" && (
              <>
                {!isSpiritSite && (
                  <TabsContent value="deposit" className="mt-6">
                    <div id="reglage-deposit">
                      <PlanningSettings section="deposit" {...planningProps} />
                    </div>
                  </TabsContent>
                )}
                <TabsContent value="payments" className="mt-6">
                  <div id="reglage-payments">
                  <PaymentsSettings
                    connected={paymentConfig.connected}
                    chargesEnabled={paymentConfig.chargesEnabled}
                    detailsSubmitted={paymentConfig.detailsSubmitted}
                    paymentsEnabled={paymentConfig.paymentsEnabled}
                    paymentMode={paymentConfig.paymentMode}
                    feePercent={paymentConfig.feePercent}
                    depositConfigured={settings.depositType !== "none" && settings.depositValue > 0}
                    depositSummary={
                      settings.depositType === "fixed"
                        ? `${(settings.depositValue / 100).toFixed(2)} €`
                        : settings.depositType === "percent"
                          ? `${settings.depositValue} %`
                          : "non configuré"
                    }
                  />
                  </div>
                </TabsContent>
                <TabsContent value="invoicing" className="mt-6">
                  <div id="reglage-invoicing" className="space-y-6">
                  {/* Carte d'avancement de la configuration de facturation, calculée à
                      partir des données RÉELLES du profil (aucune case cochée à la main). */}
                  <BillingSetupCard data={billingSetup} />
                  <SellerBillingProfile
                    country={(tenant.country ?? "FR").toUpperCase()}
                    confirmed={Boolean(fullSettings?.billingProfileConfirmedAt)}
                    legalForm={fullSettings?.legalForm ?? ""}
                    legalRegistrationNumber={
                      fullSettings?.legalRegistrationNumber ??
                      // Fallback FR uniquement : affiche proprement l'ancien invoiceSiret.
                      ((tenant.country ?? "FR").toUpperCase() === "FR" ? (fullSettings?.invoiceSiret ?? "") : "")
                    }
                    vatNumber={fullSettings?.vatNumber ?? ""}
                    vatStatus={fullSettings?.vatStatus ?? "unknown"}
                    frBusinessCategory={fullSettings?.frBusinessCategory ?? "unknown"}
                    defaultCurrency={fullSettings?.defaultCurrency ?? ""}
                  />
                  <InvoicingSettings
                    invoiceCompanyAddress={fullSettings?.invoiceCompanyAddress ?? ""}
                    invoiceSiret={fullSettings?.invoiceSiret ?? ""}
                    invoiceIban={fullSettings?.invoiceIban ?? ""}
                    invoiceBic={fullSettings?.invoiceBic ?? ""}
                    vatEnabled={fullSettings?.vatEnabled ?? false}
                    vatRate={fullSettings?.vatRate ?? "20"}
                    vatExemptNote={fullSettings?.vatExemptNote ?? "TVA non applicable, art. 293 B du CGI"}
                    invoicePrefix={fullSettings?.invoicePrefix ?? "FAC"}
                    invoiceDueDays={fullSettings?.invoiceDueDays ?? 30}
                    invoiceFooterNote={fullSettings?.invoiceFooterNote ?? ""}
                    invoiceLegalMentions={fullSettings?.invoiceLegalMentions ?? ""}
                    invoiceEmailSubject={fullSettings?.invoiceEmailSubject ?? ""}
                    invoiceEmailBody={fullSettings?.invoiceEmailBody ?? ""}
                    invoiceLogoPathname={fullSettings?.invoiceLogoPathname ?? null}
                    sellerCountry={(tenant.country ?? "FR").toUpperCase()}
                    sellerVatStatus={fullSettings?.vatStatus ?? "unknown"}
                  />
                  </div>
                </TabsContent>
                <TabsContent value="promo" className="mt-6">
                  <div id="reglage-promo">
                    <PromoSettings codes={promoCodesList} services={promoServiceOptions} />
                  </div>
                </TabsContent>
              </>
            )}

            {/* COMMUNICATIONS */}
            {activeCategory.id === "communications" && (
              <TabsContent value="sms" className="mt-6">
                <div id="reglage-sms">
                <SmsSettings
                  featureEnabled={smsFeatureEnabled}
                  balance={smsBalance.balance}
                  monthlyIncluded={monthlyIncludedSms(tenant.licensePlan)}
                  checkoutReturn={smsCheckoutReturn}
                  betaBonusGranted={Boolean(smsCreditRow[0]?.betaBonusGrantedAt)}
                  enabled={settings.smsRemindersEnabled}
                  offsetHours={settings.smsReminderOffsetHours}
                  template={settings.smsReminderTemplate ?? ""}
                  defaultTemplate={SMS_DEFAULT_TEMPLATE}
                  revolutUrl={revolutUrl}
                  revolutQrSrc={revolutQrSrc}
                />
                </div>
              </TabsContent>
            )}
            {activeCategory.id === "communications" && (
              <TabsContent value="notifications" className="mt-6">
                <div id="reglage-notifications">
                <NotificationsSettings
                  canReminders={canEmailReminders}
                  canReviews={canReviewRequests}
                  migrationApplied={lotDMigrationApplied}
                  runtimeEnabled={reviewRequestInfrastructureReady()}
                  proRecipient={settings.businessEmail ?? null}
                  proReminderEnabled={lotDSettings.proReminderEnabled}
                  proReminderOffsetHours={lotDSettings.proReminderOffsetHours}
                  reviewRequestEnabled={lotDSettings.reviewRequestEnabled}
                  reviewRequestOffsetHours={lotDSettings.reviewRequestOffsetHours}
                  reviewRequestLink={lotDSettings.reviewRequestLink}
                  resolvedReviewLink={resolvedReviewLink}
                />
                </div>
              </TabsContent>
            )}

            {/* COMPTE ET ASSISTANCE */}
            {activeCategory.id === "account" && (
              <>
                <TabsContent value="security" className="mt-6">
                  <div id="reglage-security">
                    <SecuritySettings />
                  </div>
                </TabsContent>
                <TabsContent value="data" className="mt-6">
                  <div id="reglage-data" className="max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-6">
                    <div>
                      <h2 className="text-lg font-semibold">Vos données vous appartiennent</h2>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
                        Exportez à tout moment l&apos;intégralité de vos données professionnelles (clients, véhicules,
                        réservations, prestations, devis, factures et paramètres) aux formats standard CSV et JSON. L&apos;archive
                        ne contient aucune donnée de connexion ou de sécurité.
                      </p>
                    </div>
                    <a
                      href="/admin/export"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
                    >
                      Télécharger mes données (.zip)
                    </a>
                  </div>
                </TabsContent>
                <TabsContent value="support" className="mt-6">
                  <div id="reglage-support">
                    <SupportForm />
                  </div>
                </TabsContent>
              </>
            )}
          </SettingsTabs>
          <SettingsHighlight />
        </div>
      )}
    </div>
  )
}
