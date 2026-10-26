# FinFlow QA harness

Screenshot, overflow and colour-contrast checks that run the **real frontend** against **mocked API responses**
(`data.mjs`), so no backend or database is needed.

## One-time setup
```bash
cd frontend/qa
npm install
npx playwright install chromium     # once
```
(Point `PW_CHROMIUM=/path/to/chromium` at an existing browser instead if you prefer.)

## Run
Each script starts the Vite dev server on :5200 itself if it is not already running.
```bash
node sweep.mjs dark 1440 900 /loans,/cards      # screenshots -> sw_<theme>_<width>/<page>.png
node final.mjs                                  # 32 pages x 2 themes x 390/768/1440: overflow, blank pages, console errors
node axe2.mjs                                   # colour contrast, light theme (aggregated by fg/bg pair)
node axe3.mjs                                   # colour contrast, dark theme
node modals.mjs dark                            # Add-modals + login/register screenshots
node mh.mjs                                     # modal heights at 1366x768 and 1280x720 (does each fit without scrolling?)
node cons2.mjs                                  # KPI-tile style consistency across pages
node sb.mjs light                               # sidebar expanded / collapsed / quick-add / mobile
node st2.mjs dark                               # Statements pages (uses stmock.mjs)
```
Light theme is switched by `localStorage.ff_theme = 'light'` (the scripts do this for you).

## Notes
- Mock data lives in `data.mjs` (`routes`). A page that needs more data overrides `routes[...]` before calling `mk()`.
- Screenshots are written next to the scripts and are git-ignored.
- These are developer tools only; nothing here ships in the production build.
