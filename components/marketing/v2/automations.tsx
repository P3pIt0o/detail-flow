import { ArrowDown, Bell, Calendar, MessageSquareText } from "lucide-react"
import { marketingV2 } from "@/config/marketing"
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { ScreenshotPlaceholder } from "./screenshot-placeholder"

const ICONS = [Calendar, Bell, MessageSquareText] as const

/** Automatisations — scénarios concrets + capture notification manquante. */
export function AutomationsV2() {
  const { automations } = marketingV2
  return (
    <section id="automatisations" className="scroll-mt-20 border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{automations.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              {automations.lead}
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid items-center gap-8 lg:grid-cols-2">
          <StaggerGroup className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1">
            {automations.scenarios.map((s, i) => {
              const Icon = ICONS[i] ?? Calendar
              return (
                <StaggerItem key={s.trigger}>
                  <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-muted-foreground">{s.trigger}</p>
                    <ArrowDown className="my-2 size-4 text-primary" aria-hidden="true" />
                    <p className="text-pretty font-semibold leading-relaxed text-foreground">{s.action}</p>
                  </div>
                </StaggerItem>
              )
            })}
          </StaggerGroup>

          {/* TODO-SCREENSHOT: notification/rappel */}
          <Reveal delay={0.1}>
            <ScreenshotPlaceholder label={automations.notificationPlaceholder} ratio="4 / 3" />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
