const months=['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09']
const cats=[['Food & Restaurants',18400,42],['Groceries',22100,31],['Shopping',31800,18],['Fuel',9600,14],['Travel',14300,6],['Bills & Utilities',11800,16],['Subscriptions',3200,9],['EMI / Loan',48500,6],['Medical',5400,4],['Other',7200,21]]
const tx=(i)=>({id:i,transactionDate:`2026-09-${String(28-i%27).padStart(2,'0')}`,description:['SWIGGY ORDER','AMAZON PAY','UPI/ZOMATO','HDFC EMI','IOCL FUEL','NETFLIX','SALARY CREDIT','BIGBASKET'][i%8],merchant:['Swiggy','Amazon','Zomato','HDFC Bank','IOCL','Netflix','Employer','BigBasket'][i%8],amount:[540,2310,380,48500,2100,649,245000,1890][i%8],direction:i%8===6?'CREDIT':'DEBIT',category:['Food & Restaurants','Shopping','Food & Restaurants','EMI / Loan','Fuel','Subscriptions','Income / Credits','Groceries'][i%8],transactionType:i%8===6?'INCOME':'SPENDING',account:'HDFC-1234',recurring:i%8===5})
const rank=(n)=>Array.from({length:n},(_,i)=>({name:['Swiggy','Amazon','Zomato','BigBasket','IOCL','Netflix','Uber','Myntra'][i%8],merchant:['Swiggy','Amazon','Zomato','BigBasket','IOCL','Netflix','Uber','Myntra'][i%8],amount:30000-i*3100,transactions:24-i*2,debitAmount:30000-i*3100,debitTransactions:24-i*2,creditAmount:i*400,creditTransactions:i}))
export const stRoutes={
 '/profiles':['Default'],
 '/accounts':[{id:1,bankName:'HDFC Bank',accountType:'DEBIT',maskedNumber:'XX1234',displayName:'HDFC Bank ••1234',accountKey:'HDFC-1234'},{id:2,bankName:'ICICI Bank',accountType:'CREDIT_CARD',maskedNumber:'XX5678',displayName:'ICICI Amazon Pay ••5678',accountKey:'ICICI-5678'}],
 '/analytics/summary':{totalSpending:168400,totalCredits:1470000,netCashFlow:1301600,transactionCount:412,totalDebited:612000,totalCredited:1470000,cardPayments:92000,emiPayments:291000},
 '/analytics/categories':cats.map(c=>({category:c[0],amount:c[1],transactions:c[2]})),
 '/analytics/monthly':months.map((m,i)=>({period:m,amount:24000+i*3800+(i%2)*5200,transactions:60+i*4})),
 '/analytics/yearly':[{year:2025,amount:1520000,transactions:640},{year:2026,amount:1168400,transactions:412}],
 '/analytics/income-monthly':months.map((m,i)=>({period:m,amount:245000+(i===3?40000:0),transactions:2})),
 '/analytics/income-yearly':[{year:2025,amount:2940000},{year:2026,amount:1470000}],
 '/analytics/merchants':rank(8),'/analytics/merchants/all':rank(8),'/analytics/upi':rank(6),'/analytics/upi/all':rank(6),'/analytics/financial':rank(5),'/analytics/financial/all':rank(5),'/analytics/card-payments':rank(3),'/analytics/outflows':rank(6),'/analytics/income':rank(3),
 '/analytics/loans':[{lender:'HDFC Bank',taken:0,paid:291000,transactions:6},{lender:'SBI',taken:0,paid:107000,transactions:6}],
 '/analytics/ledger':[{name:'Karthik',received:12000,paid:4000,transactions:5},{name:'Ramesh',received:0,paid:15000,transactions:2}],
 '/analytics/insights':[{title:'Biggest category',value:'EMI / Loan',amount:48500,detail:'29% of spending'},{title:'Subscriptions',amount:3200,detail:'9 recurring charges'},{title:'Busiest month',value:'Sep 2026'}],
 '/analytics/account-summary':[{account:'HDFC-1234',spending:132000,credits:1470000,transactions:310},{account:'ICICI-5678',spending:36400,credits:0,transactions:102}],
 '/data-management/years':[{year:2026,transactions:412,spending:168400,income:1470000,accounts:2},{year:2025,transactions:640,spending:1520000,income:2940000,accounts:2}],
 '/data-management/statements':[{sourceFile:'hdfc_sep_2026.pdf',transactions:58,account:'HDFC-1234',from:'2026-09-01',to:'2026-09-30'},{sourceFile:'icici_sep_2026.pdf',transactions:31,account:'ICICI-5678',from:'2026-09-01',to:'2026-09-30'}],
 '/transactions/page':{items:Array.from({length:14},(_,i)=>tx(i+1)),page:0,size:50,total:412,pages:9},
 '/transactions/summary':{out:168400,in:1470000,net:1301600,count:412},
}
export async function mockStatements(p){
 await p.route(u=>u.hostname==='127.0.0.1'&&/^\/api\/(profiles|accounts|analytics|transactions|data-management|statements)/.test(u.pathname),r=>{
  const q=r.request(); const pp=new URL(q.url()).pathname.replace(/^\/api/,'').replace(/\/$/,'')
  const body=q.method()==='GET'&&pp in stRoutes?stRoutes[pp]:q.method()==='GET'?[]:{}
  r.fulfill({status:200,headers:{'content-type':'application/json'},body:JSON.stringify(body)})})
}
