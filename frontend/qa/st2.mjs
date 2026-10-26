import { mk, errors, browser, BASE } from './run.mjs'
import { mockStatements } from './stmock.mjs'
import fs from 'node:fs'
const theme=process.argv[2]||'dark'
const p=await mk(1440,900); await mockStatements(p)
if(theme==='light') await p.context().addInitScript(()=>localStorage.setItem('ff_theme','light'))
fs.mkdirSync('st_'+theme,{recursive:true})
for(const u of ['overview','spending','people','accounts','transactions','ledger','debt-match','data']){ await p.goto(BASE+'/statements/'+u,{waitUntil:'load'}); await p.waitForTimeout(1300); await p.screenshot({path:`st_${theme}/${u}.png`}) }
console.log('errors',errors.length,errors.slice(0,3).map(e=>String(e).slice(0,160))); await browser.close(); process.exit(0)
