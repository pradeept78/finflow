const ld=(id,lender,emi,tenure,start,day)=>({id,lender,loanType:'Personal',amount:emi*tenure,emi,tenure,startDate:start,dueDay:day,interestRate:10})
const emi=(id,label,e,t,start,extra={})=>({id,label,emi:e,tenure:t,startDate:start,...extra})
export const routes={
 '/loans':[ld(1,'HDFC Home Loan',48500,240,'2022-03-05',5),ld(2,'SBI Car Loan',17800,60,'2024-07-10',10),ld(3,'ICICI Personal Loan',13200,36,'2024-01-15',15),ld(4,'Bajaj Finserv',10500,12,'2026-01-03',3),ld(5,'Tata Education',21000,84,'2023-11-02',2),ld(6,'Axis Gold Loan',13900,24,'2025-02-20',20)],
 '/credit-cards':[
  {id:1,banker:'HDFC Regalia',cardLimit:300000,outstanding:84200,billingDay:12,dueDay:12,spends:[{amount:14400,spendDate:'2026-10-02',purpose:'Fuel'}],emis:[emi(11,'iPhone 15',6660,12,'2026-03-12'),emi(12,'Sofa',4500,12,'2026-04-12'),emi(13,'Flights (friend)',3000,7,'2026-06-12',{owedBy:'Karthik'})]},
  {id:2,banker:'ICICI Amazon Pay',cardLimit:200000,outstanding:62000,billingDay:18,dueDay:18,spends:[],emis:[emi(21,'Laptop',8000,12,'2026-02-18'),emi(22,'LIC premium EMI',4000,12,'2026-04-18')]},
  {id:3,banker:'Axis Magnus',cardLimit:400000,outstanding:128500,billingDay:22,dueDay:22,spends:[{amount:36200,spendDate:'2026-10-05',purpose:'Travel'}],emis:[emi(31,'Kitchen',10000,24,'2025-12-22'),emi(32,'Course fees',4000,12,'2026-02-22')]},
  {id:4,banker:'SBI Cashback',cardLimit:150000,outstanding:41300,billingDay:5,dueDay:5,spends:[],emis:[emi(41,'Washing machine',7000,10,'2026-01-05'),emi(42,'Dental',5000,10,'2026-03-05')]}],
 '/personal-emis':[{id:1,person:'Ramesh (friend)',amount:100000,emi:10000,tenure:0,dueDay:10,active:true,interestRate:0}],
 '/expenses':[{id:1,label:'House rent',amount:28000,frequency:'Monthly',category:'Rent',dueDay:1,active:true,startDate:'2024-01-01'},{id:2,label:'Groceries',amount:12000,frequency:'Monthly',category:'Groceries',dueDay:5,active:true,startDate:'2024-01-01'},{id:3,label:'Electricity',amount:3200,frequency:'Monthly',category:'Utilities',dueDay:15,active:true,startDate:'2024-01-01'},{id:4,label:'School fees',amount:45000,frequency:'Quarterly',category:'Education',dueDay:12,active:true,startDate:'2026-01-12'}],
 '/savings':[{id:1,name:'Kuberan Chit 5L',savingType:'Chit',monthly:25000,tenure:20,startDate:'2025-06-05',prizeTaken:true,mode:'won',chitValue:500000,actualReceived:430000,doublePayments:2},{id:2,name:'Gold Scheme',savingType:'Gold',monthly:5000,tenure:24,startDate:'2025-12-08'},{id:3,name:'Withdrew Chit',savingType:'Chit',monthly:7000,tenure:20,startDate:'2025-08-09',mode:'withdrew'}],
 '/investments':[{id:1,name:'Axis Bluechip SIP',investType:'SIP',monthly:10000,startDate:'2024-01-05',active:true,currentValue:200000,investedAmount:150000}],
 '/insurance-policys':[
  {id:1,name:'Star Health',insurer:'Star',policyType:'Health',frequency:'Yearly',premium:20048,startDate:'2025-10-15',endDate:'2027-10-15',active:true,lastPaidDate:'2025-10-15'},
  {id:2,name:'Term Life',insurer:'HDFC',policyType:'Life',frequency:'Monthly',premium:9000,startDate:'2024-01-10',active:true,sumAssured:10000000},
  {id:3,name:'Hyundai',insurer:'Hyundai',policyType:'Vehicle',frequency:'Yearly',premium:32000,startDate:'2026-07-20',active:true,isCardEmi:true},
  {id:4,name:'Family',insurer:'Family',policyType:'Health',frequency:'Single',premium:20048,startDate:'2026-10-15',active:true}],
 '/income-entrys':[{id:1,label:'Salary',amount:245000,frequency:'Monthly',active:true}],
 '/people-owes':[],'/closed-loans':[],'/paid-marks':[],'/snapshots':[]
}
