import type { ComponentType } from "react"
import {
  BadgePercent,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  Globe,
  House,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Repeat,
  Settings,
  Sparkles,
  Star,
  UserPlus,
  Users,
} from "lucide-react"
import type { MainNavIcon } from "@/lib/admin/nav"

// Clé d'icône (pure, définie dans lib/admin/nav) → composant lucide.
// Volontairement SANS « use client » : la page serveur « Plus » la lit aussi.
export const NAV_ICONS: Record<MainNavIcon, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  today: House,
  more: LayoutGrid,
  export: Download,
  calendar: CalendarDays,
  reservations: ClipboardList,
  demandes: Inbox,
  leads: UserPlus,
  factures: FileText,
  clients: Users,
  abonnements: Repeat,
  prestations: Sparkles,
  produits: Package,
  offres: BadgePercent,
  analyse: BarChart3,
  reservationLink: CalendarCheck,
  web: Globe,
  settings: Settings,
  billing: CreditCard,
  reviews: Star,
}
