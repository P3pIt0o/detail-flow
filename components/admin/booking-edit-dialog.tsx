"use client"

/**
 * Dialog d'édition d'une réservation (admin). Formulaire simple qui envoie
 * ses valeurs à `updateBookingAction` : tout recalcul (prix, durée, créneau,
 * déplacement) est fait côté serveur par le moteur existant. Aucune formule
 * n'est dupliquée ici.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateBookingAction, type UpdateBookingVehicle } from "@/app/admin/(dashboard)/reservations/[id]/actions"

type Service = { id: number; name: string }
type VehicleType = { id: number; name: string }
type OptionRow = { id: number; name: string; priceCents: number }

type ExistingItem = {
  id: number
  serviceId: number | null
  vehicleTypeId: number | null
  vehicleBrand: string | null
  vehicleModel: string | null
  vehiclePlate: string | null
  options: { optionId: number | null }[]
}

export function BookingEditDialog({
  bookingId,
  booking,
  items,
  services,
  vehicleTypes,
  options,
}: {
  bookingId: number
  booking: {
    date: string
    startTime: string
    customerName: string
    customerEmail: string
    customerPhone: string
    address: string
    notes: string | null
  }
  items: ExistingItem[]
  services: Service[]
  vehicleTypes: VehicleType[]
  options: OptionRow[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [date, setDate] = useState(booking.date)
  const [startTime, setStartTime] = useState(booking.startTime)
  const [name, setName] = useState(booking.customerName)
  const [email, setEmail] = useState(booking.customerEmail)
  const [phone, setPhone] = useState(booking.customerPhone)
  const [address, setAddress] = useState(booking.address)
  const [notes, setNotes] = useState(booking.notes ?? "")

  const [vehicles, setVehicles] = useState<UpdateBookingVehicle[]>(
    items.map((it) => ({
      uid: String(it.id),
      serviceId: it.serviceId ?? services[0]?.id ?? 0,
      vehicleTypeId: it.vehicleTypeId ?? vehicleTypes[0]?.id ?? 0,
      optionIds: it.options.map((o) => o.optionId).filter((x): x is number => x != null),
      brand: it.vehicleBrand ?? "",
      model: it.vehicleModel ?? "",
      plate: it.vehiclePlate ?? "",
    })),
  )

  function updateVehicle(uid: string, patch: Partial<UpdateBookingVehicle>) {
    setVehicles((prev) => prev.map((v) => (v.uid === uid ? { ...v, ...patch } : v)))
  }

  function addVehicle() {
    setVehicles((prev) => [
      ...prev,
      {
        uid: `new-${Date.now()}-${prev.length}`,
        serviceId: services[0]?.id ?? 0,
        vehicleTypeId: vehicleTypes[0]?.id ?? 0,
        optionIds: [],
        brand: "",
        model: "",
        plate: "",
      },
    ])
  }

  function removeVehicle(uid: string) {
    setVehicles((prev) => (prev.length > 1 ? prev.filter((v) => v.uid !== uid) : prev))
  }

  function toggleOption(uid: string, optionId: number) {
    setVehicles((prev) =>
      prev.map((v) =>
        v.uid === uid
          ? {
              ...v,
              optionIds: v.optionIds.includes(optionId)
                ? v.optionIds.filter((id) => id !== optionId)
                : [...v.optionIds, optionId],
            }
          : v,
      ),
    )
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await updateBookingAction({
        bookingId,
        date,
        startTime,
        customer: { name, email, phone },
        address,
        notes,
        vehicles,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="mr-2 h-4 w-4" /> Modifier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la réservation</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input id="edit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-time">Heure</Label>
              <Input
                id="edit-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address">Adresse</Label>
            <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom client</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Téléphone</Label>
              <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Véhicules & prestations</Label>
              <Button type="button" size="sm" variant="outline" onClick={addVehicle}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un véhicule
              </Button>
            </div>

            {vehicles.map((v) => (
              <div key={v.uid} className="space-y-3 rounded-lg border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Prestation</Label>
                    <Select
                      value={String(v.serviceId)}
                      onValueChange={(val) => updateVehicle(v.uid, { serviceId: Number(val) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type de véhicule</Label>
                    <Select
                      value={String(v.vehicleTypeId)}
                      onValueChange={(val) => updateVehicle(v.uid, { vehicleTypeId: Number(val) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicleTypes.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Marque</Label>
                    <Input
                      value={v.brand}
                      onChange={(e) => updateVehicle(v.uid, { brand: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Modèle</Label>
                    <Input
                      value={v.model}
                      onChange={(e) => updateVehicle(v.uid, { model: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Immatriculation</Label>
                    <Input
                      value={v.plate}
                      onChange={(e) => updateVehicle(v.uid, { plate: e.target.value })}
                    />
                  </div>
                </div>

                {options.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Options</Label>
                    <div className="flex flex-wrap gap-2">
                      {options.map((o) => {
                        const checked = v.optionIds.includes(o.id)
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => toggleOption(v.uid, o.id)}
                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                              checked
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            {o.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {vehicles.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeVehicle(v.uid)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer ce véhicule
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Le prix, la durée et le créneau sont recalculés automatiquement à l&apos;enregistrement.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Annuler
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
