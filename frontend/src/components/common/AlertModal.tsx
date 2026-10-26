import { useState, useEffect, useRef } from 'react'

interface AlertLine {
  label: string
  value: string
  color?: string
  bold?: boolean
  separator?: boolean
}

interface AlertAction {
  label: string
  color?: string
  onClick: () => void
}

interface AlertModalProps {
  title: string
  lines: AlertLine[]
  onClose: () => void
  actions?: AlertAction[]
}

export function AlertModal({ title, lines, onClose, actions }: AlertModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{borderColor:'var(--border)'}}>
          <div className="font-bold text-base">{title}</div>
          <button className="btn-ghost btn-xs w-7 h-7 flex items-center justify-center text-lg leading-none" onClick={onClose}>×</button>
        </div>

        {/* Lines */}
        <div className="px-5 py-4 space-y-2.5">
          {lines.map((line, i) => line.separator
            ? <div key={i} className="border-t" style={{borderColor:'var(--border)'}} />
            : (
              <div key={i} className="flex justify-between items-center gap-4">
                <div className="text-sm flex-1" style={{color:'var(--text-muted)'}}>{line.label}</div>
                <div className={`mono text-right ${line.bold ? 'font-bold text-base' : 'text-sm'} ${line.color || ''}`}>
                  {line.value}
                </div>
              </div>
            )
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t flex gap-2 justify-end" style={{borderColor:'var(--border)'}}>
          {actions?.map((a, i) => (
            <button key={i}
              className={`btn btn-sm ${a.color || 'btn-primary'}`}
              onClick={a.onClick}>
              {a.label}
            </button>
          ))}
          <button className="btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

interface InputModalProps {
  title: string
  message: string
  placeholder?: string
  defaultValue?: string
  type?: 'number' | 'text'
  suffix?: string
  onConfirm: (value: string) => void
  onClose: () => void
}

export function InputModal({ title, message, placeholder, defaultValue, type = 'number', suffix, onConfirm, onClose }: InputModalProps) {
  const [value, setValue] = useState(defaultValue || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select?.() }, 50)
  }, [])

  const handleConfirm = () => {
    if (value) onConfirm(value)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{borderColor:'var(--border)'}}>
          <div className="font-bold">{title}</div>
          <button className="btn-ghost btn-xs w-7 h-7 flex items-center justify-center text-lg" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {message && (
            <div className="text-sm mb-4 whitespace-pre-line leading-relaxed" style={{color:'var(--text-muted)'}}>
              {message}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{color:'var(--text-muted)'}}>₹</span>
            <input
              ref={inputRef}
              className="input flex-1 mono font-bold text-lg text-right"
              type={type}
              placeholder={placeholder || '0'}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && value) handleConfirm() }}
            />
            {suffix && <span className="text-sm" style={{color:'var(--text-muted)'}}>{suffix}</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex gap-2 justify-end" style={{borderColor:'var(--border)'}}>
          <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" onClick={handleConfirm} disabled={!value}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
