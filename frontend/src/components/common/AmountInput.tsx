import { useEffect, useRef, useState } from 'react'
import { evalAmount, isExpression } from '../../utils/calcExpr'
import { fmtINR } from '../../utils/format'

/**
 * A money field you can type a sum into: "15000+2500" works and shows "= ₹17,500" under the box. The form always
 * receives the calculated NUMBER (onValue fires as you type whenever the text parses), and on blur / Enter the
 * box is replaced by the result. A plain <input type="number"> cannot hold "+" at all.
 */
export function AmountInput({ value, onValue, className = 'input', placeholder, min }: {
  value: number | null | undefined
  onValue: (n: number | null) => void
  className?: string
  placeholder?: string
  min?: number
}) {
  const fmt = (n: number | null | undefined) => (n == null || n === 0 ? '' : String(n))
  const [text, setText] = useState(fmt(value))
  const last = useRef<number | null>(value ?? null)
  // The form changed from outside (edit opened, form reset): follow it. Our own updates are skipped.
  useEffect(() => {
    if ((value ?? null) !== last.current && !(value == null && last.current == null)) { last.current = value ?? null; setText(fmt(value)) }
  }, [value])
  const parsed = evalAmount(text)
  const calc = isExpression(text)
  const bad = text.trim() !== '' && parsed == null
  const push = (t: string) => { const n = evalAmount(t); const out = t.trim() === '' ? null : n; if (t.trim() === '' || n != null) { last.current = out; onValue(out) } }
  const settle = () => { if (parsed != null) { setText(fmt(parsed)) } }
  return (
    <div>
      <input
        className={className + (bad ? ' border-red-500' : '')}
        type="text" inputMode="decimal" autoComplete="off" placeholder={placeholder}
        value={text}
        onChange={e => { setText(e.target.value); push(e.target.value) }}
        onBlur={settle}
        onKeyDown={e => { if (e.key === 'Enter' && calc && parsed != null) { e.preventDefault(); settle() } }}
      />
      {calc && parsed != null && <div className="text-[11px] mono mt-1" style={{ color: 'var(--text-faint)' }}>= {fmtINR(parsed)}</div>}
      {bad && <div className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>Type a number or a sum like 15000+2500</div>}
      {min != null && parsed != null && parsed < min && <div className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>Must be at least {min}</div>}
    </div>
  )
}
