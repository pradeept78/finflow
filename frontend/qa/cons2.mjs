import { mk, browser, BASE } from './run.mjs'
import './data.mjs'
const urls=['/hub/overview','/hub/debt','/hub/savings','/dashboard','/loans','/cards','/personal','/budget','/savings','/investments','/calendar','/lookup','/history','/insurance','/expenses','/income','/people-owe','/closed-loans','/earnings','/export','/break-savings','/admin']
const p=await mk(1440,900)
for(const u of urls){
  await p.goto(BASE+u,{waitUntil:'load'}); await p.waitForTimeout(700)
  const r=await p.evaluate(()=>{
    const els=[...document.querySelectorAll('[style*="5%, var(--bg-card)"]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().width>110&&e.getBoundingClientRect().height<140)
    const seen={}
    for(const e of els){const c=getComputedStyle(e); const lab=e.querySelector('div,span,p'); const lc=lab?getComputedStyle(lab):null
      const dot=!!e.querySelector('.rounded-full'); const val=[...e.querySelectorAll('div,span')].map(x=>parseFloat(getComputedStyle(x).fontSize)).sort((a,b)=>b-a)[0]
      const k=`r${c.borderRadius} pad${c.paddingTop}/${c.paddingLeft} lab${lc?lc.fontSize:''} dot${dot?1:0} val${val}`; seen[k]=(seen[k]||0)+1}
    return seen})
  console.log(u.padEnd(18),JSON.stringify(r))
}
await browser.close(); process.exit(0)
