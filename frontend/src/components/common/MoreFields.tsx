import { useState, type ReactNode } from 'react'

/**
 * A form's optional fields. Phones: hidden behind "More details" so an Add sheet shows only what's
 * needed and Save stays in reach. Tablet and desktop: always shown, laid out in the form grid exactly as
 * before (`md:contents` makes the wrapper invisible to the grid).
 */
export function MoreFields({ children, label = 'More details' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="md:hidden form-full text-left text-[13px] font-medium py-1" style={{ color: 'var(--orange)' }}>
        {open ? 'Fewer details ▴' : `${label} ▾`}
      </button>
      <div className={`${open ? 'flex' : 'hidden'} flex-col gap-3 form-full md:contents`}>{children}</div>
    </>
  )
}
