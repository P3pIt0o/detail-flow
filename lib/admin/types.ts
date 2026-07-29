/** Réservation résumée telle qu'affichée dans le calendrier admin. */
export type CalendarBooking = {
  id: number
  reference: string
  customerName: string
  date: string
  startTime: string
  endTime: string
  status: string
  totalCents: number
  totalDurationMin: number
  vehicles: number
}
