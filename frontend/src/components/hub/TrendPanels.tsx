import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { debtTrajectory, debtFreeMonth } from '../../utils/trajectory'
import type { RawData, ProjectOpts } from '../../utils/projection'
import { horizonLabel } from '../../utils/projection'
import { fmtINR } from '../../utils/format'

const lakh = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L` : n >= 1e3 ? `₹${Math.round(n / 1e3)}k` : `₹${Math.round(n)}`

/** Debt over the coming months — drawn from the same projection as Look ahead. Hover to read a month, click to jump there. */
export function DebtTrend({ raw, opts, horizon, onPick, maxMonths }: { raw: RawData; opts: ProjectOpts; horizon: number; onPick: (m: number) => void; maxMonths: number }) {
  const N = Math.max(12, Math.min(60, Math.ceil(maxMonths / 6) * 6 || 12))
  const pts = useMemo(() => debtTrajectory(raw, N, opts), [raw, N, opts.typicalSpend, opts.noDeposits]) // eslint-disable-line react-hooks/exhaustive-deps
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<SVGSVGElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  // Draw at the real pixel width so labels stay 10px on a phone instead of shrinking with the picture.
  const [W, setW] = useState(640)
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return
    const set = () => setW(Math.max(260, Math.round(el.clientWidth)))
    set()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(set); ro.observe(el); return () => ro.disconnect()
  }, [])
  const H = 150, L = 8, R = 8, T = 10, B = 22
  const top = Math.max(1, ...pts.map(p => p.debt))
  const x = (m: number) => L + (m / N) * (W - L - R)
  const y = (v: number) => T + (1 - v / top) * (H - T - B)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.month).toFixed(1)},${y(p.debt).toFixed(1)}`).join(' ')
  const area = `${line} L${x(N)},${H - B} L${x(0)},${H - B} Z`
  const free = debtFreeMonth(pts)
  const shown = hover ?? (horizon > 0 && horizon <= N ? horizon : 0)
  const at = (clientX: number) => { const r = box.current!.getBoundingClientRect(); return Math.max(0, Math.min(N, Math.round(((clientX - r.left) / r.width * W - L) / (W - L - R) * N))) }
  const step = W < 420 || N > 36 ? 12 : 6
  const ticks = Array.from({ length: Math.floor(N / step) + 1 }, (_, i) => i * step)

  return (
    <div className="rounded-2xl p-4 sm:p-5 min-w-0" style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)' }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <div className="text-[14px] font-semibold">Debt over time</div>
        <div className="text-[12px]" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {shown === 0 ? 'Today' : horizonLabel(shown)} · <b style={{ color: 'var(--danger)' }}>{fmtINR(pts[shown]?.debt ?? 0)}</b>
        </div>
      </div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--text-faint)' }}>
        {free != null ? <>Debt-free in about <b style={{ color: 'var(--success)' }}>{free} months</b> ({horizonLabel(free)}) if every EMI is paid on time — click the chart to look ahead to any month.</> : `Falling over the next ${N} months — click the chart to look ahead to any month.`}
      </div>
      <div ref={wrap} className="w-full"><svg ref={box} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block touch-none select-none" style={{ cursor: 'pointer' }} role="img" aria-label="Total debt for each of the coming months"
        onPointerMove={e => setHover(at(e.clientX))} onPointerLeave={() => setHover(null)} onClick={e => onPick(at(e.clientX))}>
        <defs><linearGradient id="debtFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--danger)" stopOpacity=".28" /><stop offset="100%" stopColor="var(--danger)" stopOpacity="0" /></linearGradient></defs>
        {[0, .5, 1].map(f => <line key={f} x1={L} x2={W - R} y1={T + f * (H - T - B)} y2={T + f * (H - T - B)} stroke="currentColor" strokeOpacity=".07" />)}
        <path d={area} fill="url(#debtFill)" />
        <path d={line} fill="none" stroke="var(--danger)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {free != null && free <= N && <circle cx={x(free)} cy={y(0)} r="4" fill="var(--success)" />}
        <line x1={x(shown)} x2={x(shown)} y1={T} y2={H - B} stroke="#f97316" strokeWidth="1.5" strokeDasharray={shown === 0 ? '0' : '4 3'} />
        <circle cx={x(shown)} cy={y(pts[shown]?.debt ?? 0)} r="5" fill="#f97316" stroke="var(--bg-card)" strokeWidth="2" />
        <text x={W - R} y={T + 8} fontSize="10" textAnchor="end" fill="currentColor" fillOpacity=".45">{lakh(top)}</text>
        {ticks.map(m => <text key={m} x={x(m)} y={H - 6} fontSize="10" textAnchor={m === 0 ? 'start' : m >= N - step / 3 ? 'end' : 'middle'} fill="currentColor" fillOpacity=".45">{m === 0 ? 'Today' : `+${m} mo`}</text>)}
      </svg></div>
    </div>
  )
}

export interface Split { label: string; value: number; color: string }

/** Where this month's income goes, as one bar — so "75% committed" is something you can see. */
export function IncomeSplit({ income, parts, horizonText, fill = false }: { income: number; parts: Split[]; horizonText?: string; fill?: boolean }) {
  const used = parts.reduce((a, p) => a + p.value, 0)
  const free = income - used
  const all: Split[] = [...parts.filter(p => p.value > 0), ...(free > 0 ? [{ label: 'Free', value: free, color: 'var(--success)' }] : [])]
  const base = Math.max(income, used) || 1
  const pct = (v: number) => `${Math.round(v / (income || 1) * 100)}%`
  return (
    <div className={`rounded-2xl min-w-0 ${fill ? 'p-4 sm:p-5 h-full flex flex-col' : 'px-4 py-3'}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)' }}>
      <div className="flex items-baseline justify-between gap-x-3 gap-y-0.5 flex-wrap mb-2">
        <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap min-w-0">
          <div className="text-[14px] font-semibold">Where your income goes</div>
          <div className="text-[11px]" style={{ color: free >= 0 ? 'var(--text-faint)' : 'var(--warning)' }}>
            {free >= 0 ? <><b style={{ color: 'var(--text-muted)' }}>{pct(used)}</b> committed · <b style={{ color: 'var(--success)' }}>{fmtINR(free)}</b> ({pct(free)}) free</> : `Commitments are ${fmtINR(-free)} more than income (${pct(used)})`}
          </div>
        </div>
        <div className="text-[12px]" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtINR(income)}/mo{horizonText ? ` · ${horizonText}` : ''}</div>
      </div>
      <div className="relative">
        <div className={`flex rounded-full overflow-hidden gap-px ${fill ? 'h-3.5 mt-1' : 'h-2.5'}`} style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)' }} role="img" aria-label="Income split">
          {all.map(p => <div key={p.label} title={`${p.label} ${fmtINR(p.value)} (${pct(p.value)})`} style={{ width: `${p.value / base * 100}%`, background: p.color, minWidth: 3, transition: 'width .3s' }} />)}
        </div>
        {/* When commitments exceed income the bar is stretched to the bigger number, so mark where income ends — everything right of the line is overspend. */}
        {used > income && income > 0 && (
          <>
            <div aria-hidden className="absolute w-0.5 rounded-full" style={{ left: `${income / base * 100}%`, top: fill ? 0 : -3, bottom: fill ? -3 : -3, background: 'var(--text)', boxShadow: '0 0 0 1.5px var(--bg-card)' }} />
            <div className="absolute text-[10px] font-semibold whitespace-nowrap" style={{ left: `${income / base * 100}%`, top: '100%', transform: 'translateX(-100%)', paddingRight: 5, paddingTop: 2, color: 'var(--text-muted)' }}>your income ▸</div>
            <div className="absolute text-[10px] font-semibold whitespace-nowrap" style={{ left: `${income / base * 100}%`, top: '100%', paddingLeft: 5, paddingTop: 2, color: 'var(--danger)' }}>over by {fmtINR(used - income)}</div>
          </>
        )}
      </div>
      {used > income && income > 0 && <div className="h-3" />}
      <div className={fill ? 'mt-3 flex-1 flex flex-col justify-around gap-1.5 text-[12px]' : 'mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px]'}>
        {all.map(p => (
          <div key={p.label} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className={fill ? 'flex-1 min-w-0 truncate' : ''} style={{ color: 'var(--text-muted)' }}>{p.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtINR(p.value)}</span>
            <span className={fill ? 'w-9 text-right' : ''} style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{pct(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
