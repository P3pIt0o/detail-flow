import type { Metadata } from "next"
import { requireAdmin } from "@/lib/admin"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getAdminServices,
  getAdminVehicleTypes,
  getAdminOptions,
  getPriceMatrix,
} from "@/lib/admin/catalog-queries"
import { ServicesManager } from "@/components/admin/services-manager"
import { VehicleTypesManager } from "@/components/admin/vehicle-types-manager"
import { OptionsManager } from "@/components/admin/options-manager"
import { PriceMatrixEditor } from "@/components/admin/price-matrix-editor"

export const metadata: Metadata = { title: "Prestations" }

export default async function PrestationsAdminPage() {
  await requireAdmin()

  const [services, vehicleTypes, options, prices] = await Promise.all([
    getAdminServices(),
    getAdminVehicleTypes(),
    getAdminOptions(),
    getPriceMatrix(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">Prestations &amp; tarifs</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Gérez votre catalogue : prestations, types de véhicules, options et grille tarifaire.
        </p>
      </div>

      <Tabs defaultValue="services" className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="services">Prestations</TabsTrigger>
          <TabsTrigger value="matrix">Grille tarifaire</TabsTrigger>
          <TabsTrigger value="vehicles">Types de véhicules</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="mt-6">
          <ServicesManager services={services} />
        </TabsContent>
        <TabsContent value="matrix" className="mt-6">
          <PriceMatrixEditor services={services} vehicleTypes={vehicleTypes} prices={prices} />
        </TabsContent>
        <TabsContent value="vehicles" className="mt-6">
          <VehicleTypesManager vehicleTypes={vehicleTypes} />
        </TabsContent>
        <TabsContent value="options" className="mt-6">
          <OptionsManager options={options} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
