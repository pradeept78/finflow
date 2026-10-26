import { mk, browser, BASE } from './run.mjs'
import './data.mjs'
const theme=process.argv[2]||'dark'
const p=await mk(1440,900); if(theme==='light') await p.context().addInitScript(()=>localStorage.setItem('ff_theme','light'))
await p.goto(BASE+'/loans',{waitUntil:'load'}); await p.waitForTimeout(900)
await p.screenshot({path:`sb_${theme}_exp.png`,clip:{x:0,y:0,width:520,height:900}})
await p.locator('button[aria-label="Collapse sidebar"]').click(); await p.waitForTimeout(500)
await p.screenshot({path:`sb_${theme}_col.png`,clip:{x:0,y:0,width:520,height:900}})
await p.locator('button[aria-label="Expand sidebar"]').click(); await p.waitForTimeout(400)
await p.locator('button[aria-label="Quick add"]').first().click(); await p.waitForTimeout(500)
await p.screenshot({path:`sb_${theme}_qa.png`}); await p.keyboard.press('Escape')
await p.setViewportSize({width:390,height:844}); await p.goto(BASE+'/loans',{waitUntil:'load'}); await p.waitForTimeout(600)
await p.locator('header, div').locator('button:has(svg.lucide-menu)').first().click(); await p.waitForTimeout(500)
await p.screenshot({path:`sb_${theme}_mob.png`})
await browser.close(); process.exit(0)
