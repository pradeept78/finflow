import { isOneOff } from './format'
import { hasEnded } from './ended'

export interface OneOff { key: string; label: string; kind: 'Expense' | 'Premium'; amount: number; on: string; to: string }

/**
 * One-time bills and premiums dated after today and up to the end of the look-ahead window. They aren't part of the
 * monthly figures (a one-off isn't "per month"), so a future month that contains one is lighter on paper than it will
 * be in real life — this lists them so they're not forgotten.
 */
export function oneOffsIn(expenses: any[] = [], insurance: any[] = [], k: number, now: Date = new Date()): OneOff[] {
  if (!k) return []
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth() + k + 1, 0)   // last day of the horizon month
  const inWindow = (iso?: string) => { if (!iso) return false; const d = new Date(iso); return !isNaN(d.getTime()) && d.getTime() > today.getTime() && d.getTime() <= end.getTime() }
  const out: OneOff[] = []
  expenses.forEach(e => { if (e.active !== false && isOneOff(e.frequency) && inWindow(e.startDate) && Number(e.amount ?? 0) > 0) out.push({ key: `e${e.id}`, label: e.label, kind: 'Expense', amount: Number(e.amount), on: e.startDate, to: '/expenses' }) })
  insurance.forEach(v => { if (v.active !== false && !hasEnded(v) && isOneOff(v.frequency) && inWindow(v.startDate) && Number(v.premium ?? 0) > 0) out.push({ key: `i${v.id}`, label: v.name, kind: 'Premium', amount: Number(v.premium), on: v.startDate, to: '/insurance' }) })
  return out.sort((a, b) => a.on.localeCompare(b.on))
}
