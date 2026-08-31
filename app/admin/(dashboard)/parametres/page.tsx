import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSettings, getBusinessHours, getTimeOff, getServices } from "@/lib/booking/queries"
import { getFullSettings } from "@/lib/invoice/queries"
import { BusinessContact } from "@/components/admin/settings/business-contact"
import { SiteBranding } from "@/components/admin/settings/site-branding"
import { PublicSiteContent } from "@/components/admin/settings/public-site-content"
import { SectionOrderSettings } from "@/components/admin/settings/section-order-settings"
import { resolveSiteContent, resolveSectionOrder, HOME_SECTION_LABELS } from "@/lib/site-content"
import { GallerySettings } from "@/components/admin/settings/gallery-settings"
import { listGalleryItems } from "./gallery-actions"
import { ReviewsSourceSettings } from "@/components/admin/settings/reviews-source-settings"
import { listReviews } from "./review-actions"
import { getReviewsSourceConfig } from "@/lib/reviews/config"
import { getGooglePlaceDetails } from "@/lib/reviews/google-places"
import { AppearanceSettings } from "@/components/admin/settings/appearance-settings"
import { TravelSettings } from "@/components/admin/settings/travel-settings"
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
import { SmsSettings } from "@/components/admin/settings/sms-settings"
import { NotificationsSettings } from "@/components/admin/settings/notifications-settings"
import { getLotDSettings, lotDColumnsExist } from "@/lib/notifications/settings-store"
import { resolveTenantReviewLink } from "@/lib/notifications/review-resolver"
import { PromoSettings } from "@/components/admin/settings/promo-settings"
import { listPromoCodes } from "./promo-actions"
import { PaymentsSettings } from "@/components/admin/settings/payments-settings"
import { getTenantPaymentConfig } from "@/lib/payments/config"
import { getSmsBalance } from "@/lib/sms/credits"
import { SMS_DEFAULT_TEMPLATE } from "@/lib/sms/config"
import { canUseFeature } from "@/lib/licensing/enforce"
import { SettingsCategoryGrid } from "@/components/admin/settings/settings-category-grid"
import { findCategoryByTab } from "@/lib/admin/settings-nav"
import { withTenant } from "@/lib/tenant-link"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { smsCredits } from "@/lib/db/schema"

export const metadata: Metadata = { title: "Paramètres" }

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; tenant?: string }>
}) {
  const { tenant } = await requireCompanyMember()
  // `tab` (historique) => sous-section ; `tenant` (URL) => isolation en aperçu.
  const { tab, tenant: tenantParam } = await searchParams
  // Catégorie active déduite de l'onglet historique. Un ?tab= inconnu (ou absent)
  // renvoie null => on affiche la page d'accueil à 6 catégories.
  const activeCategory = findCategoryByTab(tab)
  const activeTab = activeCategory && tab ? tab : undefined
  const CategoryIcon = activeCategory?.icon

  // Site Spirit ACS : shell 100 % personnalisé. On masque UNIQUEMENT pour lui les
  // réglages du site standard sans effet (couleurs, ordre des sections, logo
  // standard, libellés de boutons Hero, sections « Pourquoi nous choisir » et
  // intro « Prestations » non rendues). Les autres tenants restent inchangés.
  const isSpiritSite = tenant.customSiteKey === "spirit-acs"
  const visibleSubTabs =
    activeCategory && isSpiritSite && activeCategory.id === "site"
      ? activeCategory.subTabs.filter((t) => t.value !== "appearance")
      : (activeCategory?.subTabs ?? [])

  const [
    settings,
    hours,
    timeOff,
    fullSettings,
    galleryItems,
    reviewItems,
    smsBalance,
    smsCreditRow,
    promoCodesList,
    servicesList,
  ] = await Promise.all([
    getSettings(),
    getBusinessHours(),
    getTimeOff(),
    getFullSettings(),
    listGalleryItems(),
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
      lotDColumnsExist(),
      canUseFeature(tenant.id, "email_reminders"),
      canUseFeature(tenant.id, "review_requests"),
      resolveTenantReviewLink(tenant.id),
    ])

  // Config paiements du tenant (commission résolue côté serveur : override → global).
  const paymentConfig = await getTenantPaymentConfig(tenant.id)

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">Paramètres</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Personnalisez DetailFlow selon le fonctionnement de votre entreprise.
        </p>
      </div>

      {!activeCategory ? (
        // Accueil : 6 cartes (grille sur ordinateur, liste verticale sur mobile).
        <SettingsCategoryGrid tenantParam={tenantParam ?? null} billingPercent={billingSetup.percent} />
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

          <Tabs defaultValue={activeTab} className="w-full">
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
              <TabsContent value="business" className="mt-6">
                <BusinessContact
                  businessName={settings.businessName ?? ""}
                  businessEmail={settings.businessEmail ?? ""}
                  businessPhone={settings.businessPhone ?? ""}
                />
              </TabsContent>
            )}

            {/* RÉSERVATIONS */}
            {activeCategory.id === "reservations" && (
              <>
                <TabsContent value="hours" className="mt-6">
                  <HoursSettings hours={hours} />
                </TabsContent>
                <TabsContent value="timeoff" className="mt-6">
                  <TimeOffSettings periods={timeOff} />
                </TabsContent>
                <TabsContent value="planning" className="mt-6">
                  <PlanningSettings
                    maxVehiclesPerDay={settings.maxVehiclesPerDay}
                    slotIntervalMin={settings.slotIntervalMin}
                    bufferMin={settings.bufferMin}
                    minNoticeHours={settings.minNoticeHours}
                    depositType={settings.depositType === "fixed" ? "fixed" : settings.depositType === "none" ? "none" : "percent"}
                    depositValue={settings.depositValue}
                    depositMethods={(fullSettings?.depositMethods ?? "").split(",").filter(Boolean)}
                    depositInstructions={fullSettings?.depositInstructions ?? ""}
                    vacationMode={settings.vacationMode}
                    vacationMessage={settings.vacationMessage ?? ""}
                  />
                </TabsContent>
                <TabsContent value="travel" className="mt-6">
                  <TravelSettings
                    businessAddress={settings.businessAddress ?? ""}
                    freeDistanceKm={Number.parseFloat(settings.freeDistanceKm)}
                    pricePerKmCents={settings.pricePerKmCents}
                    maxDistanceKm={Number.parseFloat(settings.maxDistanceKm)}
                    roundTrip={settings.roundTrip}
                    hasCoords={Boolean(settings.businessLat && settings.businessLng)}
                  />
                </TabsContent>
              </>
            )}

            {/* SITE PUBLIC */}
            {activeCategory.id === "site" && (
              <>
                <TabsContent value="site" className="mt-6">
                  {isSpiritSite && (
                    <div className="mb-6 rounded-2xl border border-border bg-muted/30 p-4">
                      <h2 className="text-lg font-semibold text-foreground">Contenu du site Spirit ACS</h2>
                      <p className="mt-1 text-sm text-muted-foreground text-pretty">
                        Votre site utilise un modèle personnalisé. Seuls les textes réellement affichés sont
                        modifiables ici : les réglages du modèle standard (couleurs, logo, ordre des sections) sont
                        masqués car ils n&apos;ont aucun effet sur votre site.
                      </p>
                    </div>
                  )}
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
                    simplified={isSpiritSite}
                  />
                  <div className="mt-10 border-t border-border pt-8">
                    {!isSpiritSite && (
                      <h2 className="mb-1 text-lg font-semibold text-foreground">Autres sections du site</h2>
                    )}
                    <PublicSiteContent content={resolveSiteContent(tenant.siteContent)} simplified={isSpiritSite} />
                  </div>
                  {!isSpiritSite && (
                    <div className="mt-10 border-t border-border pt-8">
                      <SectionOrderSettings
                        items={resolveSectionOrder(tenant.siteContent).map((key) => ({
                          key,
                          label: HOME_SECTION_LABELS[key],
                        }))}
                      />
                    </div>
                  )}
                </TabsContent>
                {!isSpiritSite && (
                  <TabsContent value="appearance" className="mt-6">
                    <AppearanceSettings
                      brandPrimary={tenant.brandPrimary ?? null}
                      brandSecondary={tenant.brandSecondary ?? null}
                    />
                  </TabsContent>
                )}
                <TabsContent value="gallery" className="mt-6">
                  <GallerySettings items={galleryItems} slug={tenant.slug} companyId={tenant.id} />
                </TabsContent>
                <TabsContent value="reviews" className="mt-6">
                  <ReviewsSourceSettings
                    items={reviewItems}
                    initialSource={reviewsSourceConfig.source}
                    initialPreview={googlePlacePreview}
                  />
                </TabsContent>
                <TabsContent value="custom-requests" className="mt-6">
                  <CustomRequestsSettings config={resolveCustomRequestsConfig((tenant.siteContent as { customRequests?: unknown } | null)?.customRequests)} />
                </TabsContent>
              </>
            )}

            {/* PAIEMENTS ET FACTURATION */}
            {activeCategory.id === "billing" && (
              <>
                <TabsContent value="payments" className="mt-6">
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
                </TabsContent>
                <TabsContent value="invoicing" className="mt-6 space-y-6">
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
                </TabsContent>
                <TabsContent value="promo" className="mt-6">
                  <PromoSettings codes={promoCodesList} services={promoServiceOptions} />
                </TabsContent>
              </>
            )}

            {/* COMMUNICATIONS */}
            {activeCategory.id === "communications" && (
              <TabsContent value="sms" className="mt-6">
                <SmsSettings
                  featureEnabled={smsFeatureEnabled}
                  balance={smsBalance.balance}
                  betaBonusGranted={Boolean(smsCreditRow[0]?.betaBonusGrantedAt)}
                  enabled={settings.smsRemindersEnabled}
                  offsetHours={settings.smsReminderOffsetHours}
                  template={settings.smsReminderTemplate ?? ""}
                  defaultTemplate={SMS_DEFAULT_TEMPLATE}
                  revolutUrl={revolutUrl}
                  revolutQrSrc={revolutQrSrc}
                />
              </TabsContent>
            )}
            {activeCategory.id === "communications" && (
              <TabsContent value="notifications" className="mt-6">
                <NotificationsSettings
                  canReminders={canEmailReminders}
                  canReviews={canReviewRequests}
                  migrationApplied={lotDMigrationApplied}
                  proRecipient={settings.businessEmail ?? tenant.email ?? null}
                  proReminderEnabled={lotDSettings.proReminderEnabled}
                  proReminderOffsetHours={lotDSettings.proReminderOffsetHours}
                  reviewRequestEnabled={lotDSettings.reviewRequestEnabled}
                  reviewRequestOffsetHours={lotDSettings.reviewRequestOffsetHours}
                  reviewRequestLink={lotDSettings.reviewRequestLink}
                  resolvedReviewLink={resolvedReviewLink}
                />
              </TabsContent>
            )}

            {/* COMPTE ET ASSISTANCE */}
            {activeCategory.id === "account" && (
              <>
                <TabsContent value="security" className="mt-6">
                  <SecuritySettings />
                </TabsContent>
                <TabsContent value="data" className="mt-6">
                  <div className="max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-6">
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
                  <SupportForm />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      )}
    </div>
  )
}
