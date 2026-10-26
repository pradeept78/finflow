import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { loansApi, cardsApi, paidMarksApi } from '../api'
import { getEff } from '../utils/format'

export function useDueNotifications() {
  const { data: loans = [] } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: markedKeys = [] } = useQuery({ queryKey: ['paid-marks'], queryFn: paidMarksApi.getAll })

  useEffect(() => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }
    if (Notification.permission !== 'granted') return

    const today = new Date().getDate()
    const notified = JSON.parse(localStorage.getItem('ff_notified') || '{}')
    const todayKey = new Date().toISOString().slice(0, 10)

    if (notified[todayKey]) return // already notified today

    const dueSoon: string[] = []

    loans.forEach(l => {
      const eff = getEff(l)
      if (eff.pending <= 0) return
      if (markedKeys.includes(`loan-${l.id}`)) return
      const diff = (l.dueDay ?? 0) - today
      if (diff >= 0 && diff <= 2) dueSoon.push(`${l.lender} EMI ₹${l.emi?.toLocaleString()} — Day ${l.dueDay}`)
    })

    cards.forEach(c => {
      const emiTotal = (c.emis ?? []).filter(e => getEff(e).pending > 0).reduce((a, e) => a + (e.emi ?? 0), 0)
      const hasDebt = (c.outstanding ?? 0) > 0 || emiTotal > 0
      if (!hasDebt) return
      if (markedKeys.includes(`card-${c.id}`)) return
      const diff = (c.dueDay ?? 0) - today
      if (diff >= 0 && diff <= 2) dueSoon.push(`${c.banker} due — Day ${c.dueDay}`)
    })

    if (dueSoon.length > 0) {
      new Notification('FinFlow — Upcoming Dues', {
        body: dueSoon.slice(0, 3).join('\n') + (dueSoon.length > 3 ? `\n+${dueSoon.length - 3} more` : ''),
        icon: '/favicon.svg',
        tag: 'finflow-dues'
      })
      localStorage.setItem('ff_notified', JSON.stringify({ ...notified, [todayKey]: true }))
    }
  }, [loans, cards, markedKeys])
}
