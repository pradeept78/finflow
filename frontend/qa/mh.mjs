import { mk, browser, BASE } from './run.mjs'
for (const [w,h] of [[1366,768],[1280,720]]) {
  const p=await mk(w,h)
  for (const u of ['/loans','/cards','/savings','/insurance','/expenses','/investments','/income','/personal-emi']) {
    await p.goto(BASE+u,{waitUntil:'load'}); await p.waitForTimeout(700)
    const b=p.locator('button:visible',{hasText:/^\s*\+?\s*Add/}).first()
    if(!(await b.count())){console.log(w,u,'no add btn');continue}
    await b.click(); await p.waitForTimeout(500)
    const r=await p.evaluate(()=>{const m=[...document.querySelectorAll('div')].filter(d=>{const s=getComputedStyle(d);return s.position==='fixed'&&d.children.length}).pop(); if(!m)return null; const card=m.firstElementChild; let sc=[...card.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+2&&/auto|scroll/.test(getComputedStyle(e).overflowY)); return {card:Math.round(card.getBoundingClientRect().height), scrolls:!!sc, inner: sc?sc.scrollHeight:0}})
    console.log(w+'x'+h,u,JSON.stringify(r)); await p.screenshot({path:`mh_${w}_${u.slice(1)}.png`}); await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }
}
await browser.close(); process.exit(0)
