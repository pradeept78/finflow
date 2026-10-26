import { create } from 'zustand'

const isLight = localStorage.getItem('ff_theme') === 'light'
if (isLight) document.documentElement.classList.add('light')

interface ThemeStore {
  dark: boolean
  toggle: () => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  dark: !isLight,
  toggle: () => set(s => {
    const nextLight = s.dark // switching dark→light
    localStorage.setItem('ff_theme', nextLight ? 'light' : 'dark')
    document.documentElement.classList.toggle('light', nextLight)
    return { dark: !s.dark }
  })
}))
