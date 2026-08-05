"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClientAction } from "@/app/admin/(dashboard)/clients/actions"

/**
 * Formulaire de création d'un client. Consomme la Server Action existante
 * `createClientAction` (validation + anti-doublon côté serveur). En cas de
 * succès, redirige vers /admin/clients en conservant le tenant courant
 * (paramètre `?tenant=` en aperçu ; sans effet en production sous-domaine).
 */
export function ClientForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenantParam = searchParams.get("tenant")
  const clientsHref = tenantParam ? `/admin/clients?tenant=${tenantParam}` : "/admin/clients"

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set("name", name)
    fd.set("email", email)
    fd.set("phone", phone)
    fd.set("address", address)
    fd.set("notes", notes)
    startTransition(async () => {
      const res = await createClientAction(fd)
      if (res.success) {
        router.push(clientsHref)
        router.refresh()
      } else {
        setError(res.message)
      }
    })
  }

  return (
    <Card className="max-w-2xl p-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">
            Nom <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jean Dupont"
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
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="06 12 34 56 78"
            />
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
            {pending ? "Enregistrement…" : "Enregistrer le client"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push(clientsHref)}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  )
}
