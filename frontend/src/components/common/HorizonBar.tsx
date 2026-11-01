import { FastForward } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HORIZONS, horizonLabel } from '../../utils/projection'
import { useHorizonState, setHorizonState } from '../../utils/horizonStore'

const PRESETS = HORIZONS as readonly number[]
const useWide = (q = '(min-width: 1024px)') => {
  const [w, setW] = useState(() => typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia(q).matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(q); const on = () => setW(mq.matches)
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on)
  }, [q])
  return w
}

/**
 * "Look ahead" — ONE control for the Hub, Dashboard, Budget and Master (the choice is shared between them).
 *
 * It costs almost no screen: a small "⏩ Look ahead ▾" pill that sits in the tab bar beside Full screen (inline on a phone).
 * Everything else lives in the popover it opens — Today · +3 · +6 · +12 · Custom, the two what-if switches, and (on the
 * Hub) how the projection is worked out. While a future month is selected, one slim banner says so, with a way back.
 */
export default function HorizonBar({ status, details }: { status?: ReactNode; details?: ReactNode }) {
  const { horizon, typicalSpend, noDeposits } = useHorizonState()
  const isCustom = horizon > 0 && !PRESETS.includes(horizon)
  const wide = useWide()
  const narrow = !useWide('(min-width: 640px)')
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => { setSlot(document.getElementById('hub-action-slot')) }, [])
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(isCustom)
  const [typed, setTyped] = useState(isCustom ? String(horizon) : '')
  const input = useRef<HTMLInputElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 8 })

  useEffect(() => { if (customOpen) input.current?.focus() }, [customOpen])
  useEffect(() => { if (PRESETS.includes(horizon)) { setCustomOpen(false); setTyped('') } else { setCustomOpen(true); setTyped(String(horizon)) } }, [horizon])

  const place = () => { const r = pill.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) }) }
  useLayoutEffect(() => { if (open) place() }, [open, wide, slot])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !pill.current?.contains(t)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey); window.addEventListener('resize', place)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', place) }
  }, [open])

  const pick = (k: number) => { setCustomOpen(false); setTyped(''); setHorizonState({ horizon: k }) }
  const onType = (v: string) => {
    setTyped(v)
    const n = Math.round(Number(v))
    if (v === '') setHorizonState({ horizon: 0 })
    else if (n >= 1 && n <= 120) setHorizonState({ horizon: n })
  }
  const seg = (on: boolean): React.CSSProperties => ({ background: on ? '#c2410c' : 'transparent', color: on ? 'white' : 'var(--text-muted)', cursor: 'pointer', border: 'none', boxShadow: on ? '0 1px 3px rgba(0,0,0,.35)' : 'none' })
  const future = horizon > 0

  const pillBtn = (
    <button ref={pill} type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
      title="Look ahead — see your numbers 3, 6, 12 or any number of months from now"
      className="print:hidden inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium whitespace-nowrap transition-colors"
      style={{ background: future ? '#c2410c' : 'color-mix(in srgb, var(--text) 8%, transparent)', color: future ? 'white' : 'var(--text-muted)', border: 'none', cursor: 'pointer', boxShadow: future ? '0 1px 3px rgba(0,0,0,.35)' : 'none' }}>
      {/* Not a calendar icon: it sat next to the Calendar tab's and read as a second calendar. */}
      <FastForward size={13} strokeWidth={2.2} aria-hidden className="flex-shrink-0" /><span>{future ? `${horizonLabel(horizon)} · +${horizon} mo` : 'Look ahead'}</span><span className="opacity-70">▾</span>
    </button>
  )

  const popover = open && createPortal(
    <div ref={pop} role="dialog" aria-label="Look ahead" className="print:hidden fixed z-[60] rounded-2xl p-4 shadow-2xl text-[12px] max-h-[80vh] overflow-y-auto"
      style={{ top: pos.top, ...(narrow ? { left: 8, right: 8 } : { right: pos.right, width: future && details ? 'min(94vw, 760px)' : 'min(94vw, 380px)' }), background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[13px] font-semibold">Look ahead</div>
        {future && <button type="button" onClick={() => pick(0)} className="text-[11px] font-medium" style={{ color: 'var(--orange)', background: 'none', border: 'none', cursor: 'pointer' }}>Back to today</button>}
      </div>
      <div className="flex w-full max-w-[360px] items-stretch gap-0.5 rounded-full p-0.5" style={{ background: 'color-mix(in srgb, var(--text) 11%, transparent)' }} role="tablist" aria-label="How far ahead to view your numbers">
        {HORIZONS.map(k => (
          <button key={k} type="button" role="tab" aria-selected={horizon === k && !customOpen} onClick={() => pick(k)}
            title={k === 0 ? 'Your numbers right now' : `Your numbers in ${k} months (${horizonLabel(k)}), if every EMI is paid on time`}
            className="flex-1 px-2 py-1.5 rounded-full font-medium text-center whitespace-nowrap transition-all duration-200" style={seg(horizon === k && !customOpen)}>
            {k === 0 ? 'Today' : `+${k} mo`}
          </button>
        ))}
        {customOpen ? (
          <label className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-full whitespace-nowrap" style={{ background: isCustom ? '#c2410c' : 'color-mix(in srgb, #f97316 15%, transparent)', color: isCustom ? 'white' : 'var(--text)' }} title="Months ahead, 1 to 120. Clear it (or press Esc) to go back to Today.">
            <input ref={input} type="number" min={1} max={120} inputMode="numeric" placeholder="9" aria-label="Custom number of months ahead" value={typed}
              onChange={e => onType(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); pick(0) } }}
              className="w-9 bg-transparent text-center outline-none font-semibold" style={{ color: 'inherit' }} />
            <span>mo</span>
          </label>
        ) : (
          <button type="button" role="tab" aria-selected={false} onClick={() => setCustomOpen(true)} title="Pick any number of months, 1 to 120"
            className="flex-1 px-2 py-1.5 rounded-full font-medium text-center whitespace-nowrap transition-all duration-200" style={seg(false)}>Custom…</button>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-1.5" style={{ color: 'var(--text-muted)' }}>
        <label className="inline-flex items-center gap-2 cursor-pointer" title="Keeps the card spending you have this cycle going every month, instead of assuming you stop using the cards">
          <input type="checkbox" checked={typicalSpend} onChange={e => setHorizonState({ typicalSpend: e.target.checked })} /> Keep a typical month of card spend
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer" title="Freezes savings, chits you are building and SIPs at today's balance, and removes their monthly amounts">
          <input type="checkbox" checked={noDeposits} onChange={e => setHorizonState({ noDeposits: e.target.checked })} /> No new deposits (stop savings &amp; SIPs)
        </label>
      </div>
      {future && details && <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>{details}</div>}
    </div>, document.body)

  const banner = future && (
    <div className="print:hidden flex items-center gap-x-2 gap-y-1 flex-wrap rounded-xl px-3 py-1.5 text-[12px]" style={{ background: 'color-mix(in srgb, #f97316 10%, transparent)', border: '1px solid color-mix(in srgb, #f97316 25%, transparent)', color: 'var(--text-muted)' }}>
      <span className="min-w-0"><FastForward size={12} aria-hidden className="inline-block -mt-0.5 mr-1" /><b style={{ color: 'var(--text)' }}>{horizonLabel(horizon)}</b> · projection, not today's numbers{status}{typicalSpend ? ' · card spend kept' : ''}{noDeposits ? ' · no new deposits' : ''}</span>
      <button type="button" onClick={() => setOpen(true)} className="font-medium" style={{ color: 'var(--orange)', background: 'none', border: 'none', cursor: 'pointer' }}>How this is worked out</button>
      <button type="button" onClick={() => pick(0)} className="ml-auto font-medium" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Back to today ✕</button>
    </div>
  )

  const inTabBar = wide && slot
  return (
    <>
      {inTabBar ? createPortal(pillBtn, slot!) : <div className="print:hidden">{pillBtn}</div>}
      {popover}
      {banner}
    </>
  )
}
