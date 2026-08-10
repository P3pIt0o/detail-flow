/** Contenu narratif de l'étape "faq" — atterrissage final de l'expérience. */

import { marketing } from "@/config/marketing"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"

export function SceneFaq() {
  return (
    <div className="flex h-full max-h-[85vh] w-full flex-col items-center justify-center overflow-y-auto py-6 md:max-h-none md:overflow-visible">
      <h2 className="text-balance text-center text-2xl font-bold tracking-tight sm:text-3xl">Questions fréquentes</h2>
      <Accordion className="mt-8 w-full max-w-2xl divide-y divide-border rounded-2xl border border-border bg-card/80 px-2 backdrop-blur">
        {marketing.faq.map((item, i) => (
          <AccordionItem key={item.q} value={`faq-${i}`} className="px-4">
            <AccordionTrigger className="text-left text-base font-medium">{item.q}</AccordionTrigger>
            <AccordionContent className="text-pretty leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
