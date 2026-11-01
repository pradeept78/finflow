import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { Info } from 'lucide-react'
import { Modal } from '.'
import { PAGE_HELP, GLOSSARY } from '../../utils/pageHelp'

/** Opens the intro again (components/global/IntroTour listens for this). */
export const openIntro = () => window.dispatchEvent(new Event('ff:intro'))

/**
 * ⓘ "About this page": what the current page shows and what its terms mean (utils/pageHelp). Sits in the
 * phone top bar and in the tab bar on wider screens. Renders nothing on a page with no text.
 */
export function PageHelpButton({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const help = PAGE_HELP[pathname]
  if (!help) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`About this page: ${help.title}`} title="About this page"
        className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors ${dark ? 'text-[#aab2c2] hover:text-[#eef0f6] hover:bg-white/5' : 'hover:bg-[var(--bg-hover)]'} ${className}`}
        style={dark ? undefined : { color: 'var(--text-muted)' }}>
        <Info size={18} strokeWidth={2} />
      </button>
      {/* Portalled to <body>: the button sits inside the sticky top bar, whose stacking level would
          otherwise keep the sheet under the bottom tab bar (its buttons were hidden). */}
      {open && createPortal(
        <Modal title={help.title} onClose={() => setOpen(false)}
          footer={<>
            <button className="btn-secondary btn-sm" onClick={() => { setOpen(false); openIntro() }}>How FinFlow works</button>
            <button className="btn-primary btn-sm" onClick={() => setOpen(false)}>Got it</button>
          </>}>
          <p className="text-[14px] mb-3" style={{ color: 'var(--text)' }}>{help.summary}</p>
          <ul className="space-y-2">
            {help.points.map(p => (
              <li key={p} className="flex gap-2 text-[13px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                <span aria-hidden className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--info)' }} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          {!help.points.some(p => GLOSSARY.includes(p)) && (pathname === '/lookup' || pathname === '/budget' || pathname === '/calendar') && (
            <p className="text-[12px] mt-3" style={{ color: 'var(--text-faint)' }}>{GLOSSARY.join(' ')}</p>
          )}
        </Modal>,
        document.body,
      )}
    </>
  )
}
