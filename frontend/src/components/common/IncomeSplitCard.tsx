import { IncomeSplit } from '../hub/TrendPanels'
import { horizonLabel } from '../../utils/projection'
import { useHorizonState } from '../../utils/horizonStore'
import type { OutflowComponents } from '../../utils/calcOutflow'

/** "Where your income goes" — the same split bar the Hub shows, driven by the page's own
 *  calcOutflow result so every page tells the same story. Hidden when there is no income. */
export default function IncomeSplitCard({ o, income }: { o: OutflowComponents; income: number }) {
  const { horizon } = useHorizonState()
  if (!(income > 0)) return null
  const emis = o.loanEmi + o.ccEmi + o.iOweEmi + o.chitRepay
  return (
    <IncomeSplit income={income} horizonText={horizon ? horizonLabel(horizon) : undefined} parts={[
      { label: 'EMIs', value: emis, color: 'var(--danger)' },
      { label: 'Bills', value: o.expenses, color: 'var(--info)' },
      { label: 'Insurance', value: o.insuranceEmi, color: 'var(--pink)' },
      { label: 'Savings & SIPs', value: o.savings + o.sipInvest, color: 'var(--purple)' },
      { label: 'Card bill', value: o.card, color: 'var(--warning)' },
      { label: 'Renewals & one-offs', value: o.dueNow, color: 'var(--text-faint)' },
    ]} />
  )
}
