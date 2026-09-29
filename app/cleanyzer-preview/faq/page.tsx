import { FaqPage } from "@/components/custom-sites/cleanyzer/pages"
import { getWidgetTenantContactEmail } from "@/lib/public-contact"

export default async function Page() {
  const contactEmail = await getWidgetTenantContactEmail("cleanyzer")
  return <FaqPage contactEmail={contactEmail} />
}
