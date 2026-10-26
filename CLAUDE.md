# FinFlow — project guide for Claude Code

FinFlow is a personal-finance app: loans, credit cards, "I owe" / "people owe me", savings & chit funds,
investments, insurance, income, expenses, a calendar of due dates, payoff planning and bank-statement analysis.

- **Backend:** Spring Boot 3.2 / Java 21, MySQL (`backend/`)
- **Frontend:** React + TypeScript + Vite + Tailwind + TanStack Query + Recharts (`frontend/`)
- **Run it:** see `RUNNING.md` and `SETUP.md`. Frontend dev server is http://localhost:3000, API on :8080.
- **Secrets:** `.env` (git-ignored) holds `JWT_SECRET` and DB credentials. `.env.example` lists the keys. Never commit real values.
  `application-local.yml` is git-ignored too; copy `application-local.yml.example` and fill it in.

## Commands (run in `frontend/`)
```bash
npm install
npm run dev          # dev server
npm run typecheck    # tsc --noEmit (app + node config)
npm test             # vitest — 67 tests, all must pass
npm run build        # production build
npm run verify       # typecheck + test + build — run before every commit
```
Visual / accessibility QA lives in `frontend/qa/` (see its README). It runs the real UI against mocked API data.

## Where things are
```
frontend/src/
  pages/            one file per route (LoansPage, CreditCardsPage, DashboardPage…); pages/statements/ for the Statements section
  components/
    layout/         Layout.tsx (sidebar / top bar), TabbedHub.tsx (tab bar over a group of pages), hubTabs.ts (tab config)
    common/         shared UI: Modal, PageHeader, EmptyState, KpiTile, SegTabs, FilterMenu, AmountInput, AlertModal, SortHeader…
    hub/            Overview/Debt/Savings hub panels (IncomeSplit, DebtTrend…)
    global/         GlobalSearch (⌘K), QuickAdd (the "+" modal)
    auth/           AuthShell (shared Login/Register frame), PasswordInput
  utils/            ALL money maths lives here (calcOutflow, calcDebt, projection, amortize, trajectory…) — pages must not re-derive totals
  store/            zustand stores: auth, theme, ui (full screen, nav layout)
  api/              axios instance + one *Api object per resource
```

## Rules that keep the numbers right
1. **One calculator per number.** Outflow totals come from `utils/calcOutflow.ts`; debt from `utils/calcDebt.ts`; projections from `utils/projection.ts`.
   Hub, Dashboard, Budget, Calendar and Lookup must show the same figure — never recompute a total inside a page.
2. Money is formatted with `fmtINR` (Indian grouping, ₹). Use `tabular-nums` on every number.
3. A change to a calculation needs a unit test in `src/utils/__tests__/`.

## Design system (read before touching UI)
- **Colours are CSS variables, never raw hex in components:** `--bg-base --bg-card --bg-hover --text --text-muted --text-faint --border --hairline`
  and semantic `--success --danger --warning --info --purple --cyan --orange --pink`. Light theme values are darker so text passes WCAG AA.
  Theme switch = `localStorage.ff_theme` (`.light` class on `<html>`).
- `--hairline` is for **borders only**, never backgrounds.
- **Meaning of colour:** green good / income, red debt or risk, amber upcoming or warning, orange = actions and clickable things only.
- **Shared pieces — use them, don't re-type them:** `KpiTile` (stat tiles), `EmptyState` (with an Add button), `SegTabs`, `Modal`, `PageHeader`
  (puts the page's Add button into the hub tab bar), `AmountInput`, `.card-link` (clickable card: hover lift + orange ring), `.btn-*`, `.input`, `.select`.
- KPI tiles lift on hover (`.kpi-tile`); clickable cards use `.card-link`. Only clickable things get the orange ring.
- Sentence-case labels; filled orange buttons use `#c2410c` (AA with white text).
- Forms: `.form-grid` (2 columns). Keep Add-modals short enough to fit a 1280×720 screen without scrolling.
- Sidebar is intentionally dark in both themes, so its colours are fixed values, not theme variables.

## Gotchas already paid for
- In `index.css`, `@apply btn` inside colour variants overrides earlier size modifiers — `.btn-sm/.btn-xs` are re-declared *after* the variants. Keep that order.
- The `.light` block in `index.css` must stay closed; an unclosed brace silently disables every light override.
- Recharts animates in screenshots and can look cut off — wait ~1s before capturing.
- The "dev :5200 → api …" badge is dev-server only (`stackBadge` in `vite.config.ts`, `apply: 'serve'`); it never ships.
- Playwright: `getByRole('button', {name:/Collect/})` also matches the "Collected" column header — use an anchored `hasText`.

## Quality bar before handover / release
`npm run verify` clean → run the QA harness (`node final.mjs`: no overflow / blank page / console error across 32 pages × 2 themes × 390/768/1440;
`node axe2.mjs` and `axe3.mjs`: 0 colour-contrast violations) → click through with real data.

## Status (end of the UI polish pass)
Done: AA contrast in both themes; consistent KPI tiles, tables, empty states and banners; compact Add-modals; redesigned Login/Register,
Dashboard, /lookup, /budget, /admin, Closed assets, Export; sidebar revamp (Quick add button, icon tiles, icon-button footer, user card);
full-screen mode with slim icon rail.
Known leftovers / ideas:
- Dashboard repeats a few numbers (Free / Month, total debt appear in two places) — decide which copy to keep.
- Closed assets keeps its own "Add Entry" button (its tab group has no Add slot).
- Investments, Income, Earnings and the Hub debt/savings tabs had the lightest review.
- Everything was visually QA'd on **mock data** — test with real data.

## Working style that has suited this project
Make small, verified changes; run `npm run verify` after each batch; show before/after screenshots for UI work; keep answers short.
