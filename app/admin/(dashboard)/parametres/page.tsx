import type { Metadata } from "next"
import { requireCompanyMember } from "@/lib/admin"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSettings, getBusinessHours, getTimeOff } from "@/lib/booking/queries"
import { getFullSettings } from "@/lib/invoice/queries"
import { BusinessContact } from "@/components/admin/settings/business-contact"
import { SiteBranding } from "@/components/admin/settings/site-branding"
import { AppearanceSettings } from "@/components/admin/settings/appearance-settings"
import { TravelSettings } from "@/components/admin/settings/travel-settings"
import { PlanningSettings } from "@/components/admin/settings/planning-settings"
import { HoursSettings } from "@/components/admin/settings/hours-settings"
import { TimeOffSettings } from "@/components/admin/settings/timeoff-settings"
import { InvoicingSettings } from "@/components/admin/settings/invoicing-settings"
import { SecuritySettings } from "@/components/admin/settings/security-settings"
import { SupportForm } from "@/components/admin/settings/support-form"

export const metadata: Metadata = { title: "Paramètres" }

export default async function ParametresPage() {
  const { tenant } = await requireCompanyMember()

  const [settings, hours, timeOff, fullSettings] = await Promise.all([
    getSettings(),
    getBusinessHours(),
    getTimeOff(),
    getFullSettings(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">Paramètres</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Configurez votre activité : déplacement, horaires, congés, planning et acompte.
        </p>
      </div>

      <Tabs defaultValue="business" className="w-full">
        {/* Barre d'onglets : une seule ligne, défilement horizontal sur mobile. */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start gap-1 p-1">
            <TabsTrigger value="business" className="flex-none px-3 py-1.5">
              Entreprise
            </TabsTrigger>
            <TabsTrigger value="site" className="flex-none px-3 py-1.5">
              Site public
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex-none px-3 py-1.5">
              Apparence
            </TabsTrigger>
            <TabsTrigger value="travel" className="flex-none px-3 py-1.5">
              Déplacement
            </TabsTrigger>
            <TabsTrigger value="hours" className="flex-none px-3 py-1.5">
              Horaires
            </TabsTrigger>
            <TabsTrigger value="timeoff" className="flex-none px-3 py-1.5">
              Congés
            </TabsTrigger>
            <TabsTrigger value="planning" className="flex-none px-3 py-1.5">
              Planning &amp; acompte
            </TabsTrigger>
            <TabsTrigger value="invoicing" className="flex-none px-3 py-1.5">
              Facturation
            </TabsTrigger>
            <TabsTrigger value="security" className="flex-none px-3 py-1.5">
              Sécurité
            </TabsTrigger>
            <TabsTrigger value="data" className="flex-none px-3 py-1.5">
              Mes données
            </TabsTrigger>
            <TabsTrigger value="support" className="flex-none px-3 py-1.5">
              Support
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="business" className="mt-6">
          <BusinessContact
            businessName={settings.businessName ?? ""}
            businessEmail={settings.businessEmail ?? ""}
            businessPhone={settings.businessPhone ?? ""}
          />
        </TabsContent>
        <TabsContent value="site" className="mt-6">
          <SiteBranding logoPathname={tenant.logoUrl ?? null} cgv={tenant.cgv ?? ""} />
        </TabsContent>
        <TabsContent value="appearance" className="mt-6">
          <AppearanceSettings
            brandPrimary={tenant.brandPrimary ?? null}
            brandSecondary={tenant.brandSecondary ?? null}
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
            vacationMode={settings.vacationMode}
            vacationMessage={settings.vacationMessage ?? ""}
          />
        </TabsContent>
        <TabsContent value="invoicing" className="mt-6">
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
          />
        </TabsContent>
        <TabsContent value="security" className="mt-6">
          <SecuritySettings />
        </TabsContent>
        <TabsContent value="support" className="mt-6">
          <SupportForm />
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
      </Tabs>
    </div>
  )
}
