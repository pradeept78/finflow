import { mk, browser, BASE } from './run.mjs'
import { mockStatements } from './stmock.mjs'
import fs from 'node:fs'
const axeSrc=fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url),'utf8')
const urls=['/hub/overview','/hub/debt','/hub/savings','/dashboard','/master','/loans','/cards','/budget','/payoff','/savings','/investments','/calendar','/lookup','/history','/insurance','/expenses','/income','/people-owe','/closed-loans','/earnings','/export','/statements/overview','/statements/transactions']
const p=await mk(1440,900); await mockStatements(p)
await p.context().addInitScript(()=>localStorage.setItem('ff_theme','dark'))
const agg={}
for(const u of urls){ await p.goto(BASE+u,{waitUntil:'load'}); await p.waitForTimeout(1200)
  await p.evaluate(axeSrc)
  const res=await p.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'rule',values:['color-contrast']},resultTypes:['violations']}))
  for(const v of res.violations) for(const n of v.nodes){ const d=n.any[0]?.data||{}; const k=`${d.fgColor}|${d.bgColor}|${d.contrastRatio}`; agg[k]=agg[k]||{n:0,pages:new Set(),html:n.html.slice(0,110)}; agg[k].n++; agg[k].pages.add(u) }
}
for(const [k,v] of Object.entries(agg).sort((a,b)=>b[1].n-a[1].n)) console.log(v.n,k,[...v.pages].slice(0,4).join(','),'\n    ',v.html)
await browser.close(); process.exit(0)
