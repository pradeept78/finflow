import { create } from 'zustand'

/**
 * App-shell UI state shared across pages. `fullScreen` hides the sidebar / mobile top bar / quick-add
 * button (see Layout) so a page — the tabbed hubs and /master — can use the whole window. It's a
 * shell-level flag rather than a per-page overlay so modals and dropdowns inside a page keep their
 * normal stacking and still work in full screen.
 */
interface UiStore {
  fullScreen: boolean
  setFullScreen: (v: boolean) => void
  toggleFullScreen: () => void
  /** Main navigation on desktop: the left sidebar (default) or a horizontal bar across the top. Remembered per browser. */
  navLayout: 'side' | 'top'
  setNavLayout: (v: 'side' | 'top') => void
  /** List each group's pages under it in the menu (as well as in the group's tab bar). Off by default — the tabs are enough. Remembered per browser. */
  navSubLinks: boolean
  setNavSubLinks: (v: boolean) => void
}

const NAV_KEY = 'finflow.navLayout'
const loadNav = (): 'side' | 'top' => { try { return localStorage.getItem(NAV_KEY) === 'top' ? 'top' : 'side' } catch { return 'side' } }

const SUB_KEY = 'finflow.navSubLinks'
const loadSub = (): boolean => { try { return localStorage.getItem(SUB_KEY) === '1' } catch { return false } }

export const useUiStore = create<UiStore>(set => ({
  fullScreen: false,
  setFullScreen: v => set({ fullScreen: v }),
  toggleFullScreen: () => set(s => ({ fullScreen: !s.fullScreen })),
  navLayout: loadNav(),
  setNavLayout: v => { try { localStorage.setItem(NAV_KEY, v) } catch { /* private mode */ } set({ navLayout: v }) },
  navSubLinks: loadSub(),
  setNavSubLinks: v => { try { localStorage.setItem(SUB_KEY, v ? '1' : '0') } catch { /* private mode */ } set({ navSubLinks: v }) },
}))
