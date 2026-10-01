import { CustomerSubscriptionError, type FieldIssue } from "./errors"

export type VehicleInput = {
  brand: unknown
  model: unknown
  plate?: unknown
  typeName?: unknown
}

export type NormalizedVehicle = {
  vehicleBrand: string
  vehicleModel: string
  vehiclePlate: string | null
  vehicleTypeName: string | null
}

const MAX_TEXT = 60
const MAX_PLATE = 16

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""
}

/** Plaque : majuscules, seuls lettres/chiffres/tirets conservés. */
export function normalizePlate(v: unknown): string | null {
  if (v == null || v === "") return null
  if (typeof v !== "string") return null
  const plate = v.toUpperCase().replace(/[\s.]+/g, "-").replace(/[^A-Z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "")
  return plate.length ? plate : null
}

export function normalizeVehicle(input: VehicleInput): NormalizedVehicle {
  const issues: FieldIssue[] = []
  const brand = cleanText(input.brand)
  const model = cleanText(input.model)
  const typeName = cleanText(input.typeName)
  const plate = normalizePlate(input.plate)

  if (!brand || brand.length > MAX_TEXT) issues.push({ field: "vehicle.brand", code: "INVALID_VEHICLE" })
  if (!model || model.length > MAX_TEXT) issues.push({ field: "vehicle.model", code: "INVALID_VEHICLE" })
  if (typeName.length > MAX_TEXT) issues.push({ field: "vehicle.typeName", code: "INVALID_VEHICLE" })
  if (plate && plate.length > MAX_PLATE) issues.push({ field: "vehicle.plate", code: "INVALID_VEHICLE" })
  if (issues.length) throw new CustomerSubscriptionError("INVALID_VEHICLE", issues)

  return { vehicleBrand: brand, vehicleModel: model, vehiclePlate: plate, vehicleTypeName: typeName || null }
}
