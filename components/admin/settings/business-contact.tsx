"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveBusinessContact } from "@/app/admin/(dashboard)/parametres/actions"

type Props = {
  businessName: string
  businessEmail: string
  businessPhone: string
}

export function BusinessContact(props: Props) {
  const [name, setName] = useState(props.businessName)
  const [email, setEmail] = useState(props.businessEmail)
  const [phone, setPhone] = useState(props.businessPhone)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setMsg(null)
    startTransition(async () => {
      const res = await saveBusinessContact({
        businessName: name,
        businessEmail: email,
        businessPhone: phone,
      })
      setMsg(
        res.ok
          ? { type: "ok", text: "Coordonnées enregistrées." }
          : { type: "err", text: res.error ?? "Erreur" },
      )
    })
  }

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Coordonnées de l&apos;entreprise</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Ces informations apparaissent dans les emails automatiques envoyés aux clients.
          L&apos;email de contact reçoit aussi les notifications de nouvelles réservations.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessName">Nom de l&apos;entreprise</Label>
        <Input
          id="businessName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="DetailFlow Auto"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="businessEmail">Email de contact</Label>
          <Input
            id="businessEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contact@detailflow.fr"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="businessPhone">Téléphone</Label>
          <Input
            id="businessPhone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="06 12 34 56 78"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {msg && (
          <span className={msg.type === "ok" ? "text-sm text-primary" : "text-sm text-destructive"}>
            {msg.text}
          </span>
        )}
      </div>
    </Card>
  )
}
