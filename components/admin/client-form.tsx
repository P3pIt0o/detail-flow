"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClientAction, updateClientAction } from "@/app/admin/(dashboard)/clients/actions"
import { CustomerIdentityFields, type CustomerIdentityValue } from "@/components/admin/customer-identity-fields"

/**
 * Formulaire client PARTAGÉ create / edit. En mode edit, `clientId` est fourni
 * et l'action `updateClientAction` est utilisée (n'entame jamais maxCustomers).
 * L'identité B2C/B2B est rendue par le composant partagé `CustomerIdentityFields`
 * (piloté par le pays DU CLIENT via CountryBillingProfile).
 */
export type ClientFormInitial = {
  id: number
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  customerType: string | null
  country: string | null
  legalRegistrationNumber: string | null
  legalRegistrationScheme: string | null
  vatNumber: string | null
}

export function ClientForm({ initial }: { initial?: ClientFormInitial }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenantParam = searchParams.get("tenant")
  const clientsHref = tenantParam ? `/admin/clients?tenant=${tenantParam}` : "/admin/clients"
  const isEdit = Boolean(initial)

  const [name, setName] = useState(initial?.name ?? "")
  const [email, setEmail] = useState(initial?.email ?? "")
  const [phone, setPhone] = useState(initial?.phone ?? "")
  const [address, setAddress] = useState(initial?.address ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [identity, setIdentity] = useState<CustomerIdentityValue>({
    customerType: initial?.customerType ?? "",
    country: initial?.country ?? "",
    legalRegistrationNumber: initial?.legalRegistrationNumber ?? "",
    vatNumber: initial?.vatNumber ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set("name", name)
    fd.set("email", email)
    fd.set("phone", phone)
    fd.set("address", address)
    fd.set("notes", notes)
    fd.set("customerType", identity.customerType)
    fd.set("country", identity.country)
    fd.set("legalRegistrationNumber", identity.legalRegistrationNumber)
    fd.set("vatNumber", identity.vatNumber)
    // Conserve le scheme historique en mode edit si aucune ré-validation ne le remplace.
    if (initial?.legalRegistrationScheme) fd.set("legalRegistrationScheme", initial.legalRegistrationScheme)
    return fd
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = isEdit
        ? await updateClientAction(initial!.id, buildFormData())
        : await createClientAction(buildFormData())
      if (res.success) {
        router.push(clientsHref)
        router.refresh()
      } else {
        setError(res.message)
      }
    })
  }

  const legacyUnconfirmed = isEdit && !initial?.customerType

  return (
    <Card className="max-w-2xl p-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">
            Nom / raison sociale <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jean Dupont / Garage Dupont SARL"
            required
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jean.dupont@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Adresse</Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="12 rue des Lilas, 75000 Paris"
          />
        </div>

        {/* Identité de facturation (B2C / B2B) pilotée par le pays du client */}
        <div className="space-y-2 rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-foreground">Informations de facturation</p>
          {legacyUnconfirmed && (
            <p className="text-xs text-amber-600">Type à confirmer : choisissez Particulier ou Entreprise.</p>
          )}
          <CustomerIdentityFields value={identity} onChange={(patch) => setIdentity((v) => ({ ...v, ...patch }))} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Informations complémentaires (véhicule, préférences…)"
            rows={4}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : isEdit ? "Enregistrer les modifications" : "Enregistrer le client"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push(clientsHref)}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  )
}
