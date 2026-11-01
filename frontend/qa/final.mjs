import { mk, errors, browser, BASE } from './run.mjs'
import { mockStatements } from './stmock.mjs'
const urls=['/hub/overview','/hub/debt','/hub/savings','/dashboard','/master','/loans','/cards','/personal','/budget','/payoff','/savings','/investments','/calendar','/lookup','/history','/insurance','/expenses','/income','/people-owe','/closed-loans','/earnings','/export','/break-savings','/admin','/account','/messages','/statements/overview','/statements/transactions','/statements/accounts','/statements/spending','/statements/people','/statements/ledger','/statements/data','/statements/debt-match']
const bad=[]
for (const theme of ['dark','light']) for (const [w,h] of [[1440,900],[768,1024],[390,844]]) {
  const p=await mk(w,h); await mockStatements(p)
  if(theme==='light') await p.context().addInitScript(()=>localStorage.setItem('ff_theme','light'))
  const e0=errors.length
  for(const u of urls){ await p.goto(BASE+u,{waitUntil:'load'}); await p.waitForTimeout(700)
    // The page scrolls inside #main-content, so measure that too: a too-wide row there never widens the document.
    const r=await p.evaluate(()=>({ov:Math.max(document.documentElement.scrollWidth-innerWidth,(m=>m?m.scrollWidth-m.clientWidth:0)(document.getElementById('main-content'))), blank:(document.querySelector('main, #main-content')?.innerText||'').trim().length<20, path:location.pathname}))
    if(r.ov>0) bad.push(`OVERFLOW ${theme} ${w} ${u} +${r.ov}`)
    if(r.blank) bad.push(`BLANK ${theme} ${w} ${u} -> ${r.path}`)
  }
  await p.context().close()
  console.log(theme,w,'errors so far',errors.length-e0)
}
console.log(bad.join('\n')||'no overflow/blank'); console.log(errors.slice(0,5))
await browser.close(); process.exit(0)
