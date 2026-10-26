import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { routes } from './data.mjs'
import { fileURLToPath } from 'node:url'
// Frontend project root (where `npx vite` runs). Override with FF_FRONTEND if you move this folder.
const FRONTEND=process.env.FF_FRONTEND||fileURLToPath(new URL('..',import.meta.url))
const BASE='http://127.0.0.1:5200'
const up=async()=>{try{return (await fetch(BASE+'/')).ok}catch{return false}}
let server=null
if(!(await up())){server=spawn('npx',['vite','--port','5200','--host','127.0.0.1','--strictPort'],{cwd:FRONTEND,stdio:'ignore',detached:true});for(let i=0;i<120&&!(await up());i++)await new Promise(r=>setTimeout(r,500))}
const errors=[]
const browser=await chromium.launch({...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{}),args:['--no-sandbox']})
export async function mk(w=1440,h=900){
 const ctx=await browser.newContext({viewport:{width:w,height:h},locale:'en-IN',timezoneId:'Asia/Kolkata'})
 await ctx.addInitScript(()=>{localStorage.setItem('ff_token','x');localStorage.setItem('ff_user',JSON.stringify({id:1,name:'T',email:'t@t.com',role:'USER'}))})
 const p=await ctx.newPage()
 p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!/Future Flag|favicon|ERR_/.test(m.text()))errors.push(m.text())})
 await p.route(u=>u.hostname!=='127.0.0.1',r=>r.fulfill({status:200,contentType:'text/css',body:''}))
 await p.route(u=>u.hostname==='127.0.0.1'&&u.pathname.startsWith('/api/'),r=>{const q=r.request();const pp=new URL(q.url()).pathname.replace(/^\/api/,'').replace(/\/$/,'')
  r.fulfill({status:200,headers:{'content-type':'application/json'},body:JSON.stringify({success:true,data:q.method()==='GET'&&pp in routes?routes[pp]:q.method()==='GET'?[]:{}})})})
 return p}
export {errors,browser,BASE,server}
