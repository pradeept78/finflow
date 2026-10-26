import { mk, errors, browser, BASE } from './run.mjs'
import fs from 'node:fs'
const theme=process.argv[2]||'dark'; const w=+process.argv[3]||1440; const h=+process.argv[4]||900
const urls=process.argv[5]?process.argv[5].split(','):['/hub/overview','/hub/debt','/hub/savings','/dashboard','/master','/loans','/cards','/budget','/payoff','/savings','/investments','/calendar','/lookup','/history','/insurance','/expenses','/income','/people-owe','/loans/closed','/earnings','/personal-emi','/export','/admin','/break-savings']
const p=await mk(w,h)
if(theme==='light') await p.context().addInitScript(()=>localStorage.setItem('ff_theme','light'))
fs.mkdirSync(`sw_${theme}_${w}`,{recursive:true})
for(const u of urls){ await p.goto(BASE+u,{waitUntil:'load'}); await p.waitForTimeout(1100); const ov=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth); await p.screenshot({path:`sw_${theme}_${w}/${u.slice(1).replace(/\//g,'_')}.png`}); if(ov>0)console.log('OVERFLOW',u,ov)}
console.log('errors',errors.length,errors.slice(0,3)); await browser.close(); process.exit(0)
