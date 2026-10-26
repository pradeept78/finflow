import { useEffect, useRef } from 'react'

/** "g" then a key jumps to a page (Gmail/GitHub style); "f" toggles full screen; "?" shows this list. */
export const GO_SHORTCUTS: { key: string; to: string; label: string }[] = [
  { key: 'h', to: '/hub/overview', label: 'Home' },
  { key: 'm', to: '/master', label: 'All commitments' },
  { key: 'd', to: '/dashboard', label: 'Dashboard' },
  { key: 'c', to: '/calendar', label: 'Calendar' },
  { key: 'b', to: '/budget', label: 'Budget rules' },
  { key: 'q', to: '/lookup', label: 'Quick lookup' },
  { key: 'l', to: '/loans', label: 'Loans' },
  { key: 'r', to: '/cards', label: 'Credit cards' },
  { key: 'i', to: '/personal', label: 'I Owe' },
  { key: 'e', to: '/expenses', label: 'Expenses' },
  { key: 's', to: '/savings', label: 'Savings / Chit' },
  { key: 'v', to: '/investments', label: 'Investments' },
  { key: 'n', to: '/income', label: 'Income' },
  { key: 'p', to: '/payoff', label: 'Payoff plan' },
  { key: 't', to: '/statements/overview', label: 'Statements' },
]

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useShortcuts(opts: { go: (to: string) => void; toggleFullScreen: () => void; canFullScreen: boolean; toggleHelp: () => void; closeHelp: () => void }) {
  const o = useRef(opts)
  o.current = opts
  useEffect(() => {
    let armed = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      // a modal is open — leave the keyboard alone
      if (document.querySelector('.modal-overlay') && e.key !== 'Escape') return
      const k = e.key
      if (k === '?') { e.preventDefault(); o.current.toggleHelp(); return }
      if (k === 'Escape') { o.current.closeHelp(); armed = 0; return }
      if (armed && Date.now() - armed < 1200) {
        armed = 0
        const hit = GO_SHORTCUTS.find(s => s.key === k.toLowerCase())
        if (hit) { e.preventDefault(); o.current.go(hit.to) }
        return
      }
      if (k === 'g') { armed = Date.now(); return }
      if (k === 'f' && o.current.canFullScreen) { e.preventDefault(); o.current.toggleFullScreen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
