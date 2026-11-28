import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { refundDialogVisibility } from "@/lib/payments/refund-logic"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("L115 correctifs revue métier @9078d6b", () => {
  it("après un remboursement total, la fenêtre reste rendue (message de succès conservé) mais le bouton disparaît", () => {
    const after = refundDialogVisibility([{ refundableCents: 0 }])
    expect(after).toEqual({ render: true, showTrigger: false })
  })

  it("avant remboursement : fenêtre et bouton visibles", () => {
    expect(refundDialogVisibility([{ refundableCents: 0 }, { refundableCents: 1500 }])).toEqual({
      render: true,
      showTrigger: true,
    })
  })

  it("aucun paiement : rien n'est rendu", () => {
    expect(refundDialogVisibility([])).toEqual({ render: false, showTrigger: false })
  })

  it("la page ne conditionne plus le rendu de la fenêtre au reste remboursable", () => {
    const page = read("app/admin/(dashboard)/reservations/[id]/page.tsx")
    expect(page).not.toMatch(/hasRefundableAmount\s*&&\s*\(\s*<RefundPaymentDialog/)
    expect(page).toContain("refundDialogVisibility")
  })

  it("le badge « Remboursement en cours », absent de la maquette validée, n'est pas affiché", () => {
    const page = read("app/admin/(dashboard)/reservations/[id]/page.tsx")
    expect(page).not.toContain("Remboursement en cours")
  })
})
