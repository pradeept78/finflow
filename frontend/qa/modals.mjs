import { mk, errors, browser, BASE } from './run.mjs'
const theme=process.argv[2]||'dark'
const p=await mk(1440,900); if(theme==='light') await p.context().addInitScript(()=>localStorage.setItem('ff_theme','light'))
for (const [u,name] of [['/loans','loan'],['/cards','card'],['/savings','saving'],['/insurance','ins'],['/expenses','exp']]) {
  await p.goto(BASE+u,{waitUntil:'load'}); await p.waitForTimeout(900)
  const b=p.locator('button:visible',{hasText:/^\s*\+?\s*Add/}).first(); await b.click(); await p.waitForTimeout(600)
  await p.screenshot({path:`m_${theme}_${name}.png`}); await p.keyboard.press('Escape')
}
// login
const c=await browser.newContext({viewport:{width:1440,height:900}}); const q=await c.newPage()
if(theme==='light') await q.addInitScript(()=>localStorage.setItem('ff_theme','light'))
await q.goto(BASE+'/login',{waitUntil:'load'}); await q.waitForTimeout(800); await q.screenshot({path:`m_${theme}_login.png`})
await q.goto(BASE+'/register',{waitUntil:'load'}); await q.waitForTimeout(800); await q.screenshot({path:`m_${theme}_register.png`})
console.log(errors.slice(0,3)); await browser.close(); process.exit(0)
