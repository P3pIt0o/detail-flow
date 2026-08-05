"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { clients } from "@/lib/db/schema"
import { requireCompanyId } from "@/lib/tenant"

export type CreateClientResult = {
  success: boolean
  message: string
}

export async function createClientAction(
  formData: FormData,
): Promise<CreateClientResult> {
  const companyId = await requireCompanyId()

  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const phone = String(formData.get("phone") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const notes = String(formData.get("notes") ?? "").trim()

  if (name.length < 2) {
    return {
      success: false,
      message: "Le nom du client est obligatoire.",
    }
  }

  if (!email && !phone) {
    return {
      success: false,
      message: "Renseignez au moins un email ou un numéro de téléphone.",
    }
  }

  if (email && !email.includes("@")) {
    return {
      success: false,
      message: "L’adresse email n’est pas valide.",
    }
  }

  // Anti-doublon dans l'entreprise : priorité à l'email, sinon le téléphone.
  const existing = await db
    .select({ email: clients.email, phone: clients.phone })
    .from(clients)
    .where(eq(clients.companyId, companyId))

  const normPhone = phone.replace(/\D/g, "")
  const duplicate = existing.find(
    (c) =>
      (email !== "" && (c.email ?? "").trim().toLowerCase() === email) ||
      (normPhone !== "" && (c.phone ?? "").replace(/\D/g, "") === normPhone),
  )
  if (duplicate) {
    return {
      success: false,
      message: "Un client avec cet email ou ce téléphone existe déjà.",
    }
  }

  await db.insert(clients).values({
    companyId,
    name,
    email: email || null,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
    updatedAt: new Date(),
  })

  revalidatePath("/admin/clients")

  return {
    success: true,
    message: "Client ajouté avec succès.",
  }
}
