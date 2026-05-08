require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const defaultDb = {
  settings: {
    siteName: 'Woodenbridge House',
    logo: '/data/uploads/woodenbridge-logo.jpeg',
    contactName: 'Stephan',
    contactPhone: '3482782639',
    contactEmail: 'woodenbridgehouse@gmail.com',
    wifiPassword: 'moliniditriora',
    checkout: '12:00',
    descriptions: {
      it: 'Scegli le date, controlla disponibilità e invia la richiesta di prenotazione.',
      en: 'Choose your dates, check availability and send a booking request.',
      fr: 'Choisissez vos dates, vérifiez la disponibilité et envoyez une demande.'
    },
    welcomeMessages: {
      it: 'Benvenuti a Woodenbridge House. Vi chiediamo gentilmente di rispettare la casa e lasciare tutto in ordine.',
      en: 'Welcome to Woodenbridge House. Please respect the house and leave everything tidy.',
      fr: 'Bienvenue à Woodenbridge House. Merci de respecter la maison et de laisser tout en ordre.'
    }
  },
  houses: [
    { id:'woodenbridge', name:'Woodenbridge House', capacity:7, bedrooms:3, description:'Casa principale fino a 7 posti letto, immersa nel verde e perfetta per famiglie, gruppi e soggiorni nella Valle Argentina.', photos:[], services:['wifi','stair_gates','kitchen','heating'] },
    { id:'aigoviano', name:"Casa Dell’aigoviano", capacity:2, bedrooms:1, description:'Casa romantica e raccolta con letto matrimoniale, ideale per coppie o piccoli soggiorni.', photos:[], services:['wifi','kitchen','heating'] }
  ],
  services: [
    {id:'wifi', name:{it:'Wi‑Fi gratuito',en:'Free Wi‑Fi',fr:'Wi‑Fi gratuit'}, icon:'📶', description:{it:'Password Wi‑Fi fornita nella conferma booking.',en:'Wi‑Fi password included in the booking confirmation.',fr:'Mot de passe Wi‑Fi fourni dans la confirmation.'}},
    {id:'stair_gates', name:{it:'Cancelletti scale',en:'Stair gates',fr:'Barrières escaliers'}, icon:'🛡️', description:{it:'Installazione su richiesta per famiglie con bambini piccoli.',en:'Available on request for families with small children.',fr:'Disponible sur demande pour familles avec enfants.'}},
    {id:'kitchen', name:{it:'Cucina attrezzata',en:'Equipped kitchen',fr:'Cuisine équipée'}, icon:'🍳', description:{it:'Cucina disponibile per gli ospiti.',en:'Kitchen available for guests.',fr:'Cuisine disponible pour les hôtes.'}},
    {id:'heating', name:{it:'Riscaldamento',en:'Heating',fr:'Chauffage'}, icon:'🔥', description:{it:'Casa riscaldata nei periodi freddi.',en:'Heated house during colder periods.',fr:'Maison chauffée pendant les périodes froides.'}}
  ],
  users: [],
  bookings: [],
  availability: {},
  verifications: [],
  resetTokens: [],
  priceOverrides: {}
};
function readDb(){
  if(!fs.existsSync(DB_FILE)) saveDb(defaultDb);
  const db=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
  db.settings={...defaultDb.settings,...(db.settings||{})};
  if(!db.settings.logo) db.settings.logo='/data/uploads/woodenbridge-logo.jpeg';
  db.houses=db.houses||defaultDb.houses;
  db.services=db.services||defaultDb.services;
  db.bookings=db.bookings||[]; db.users=db.users||[]; db.availability=db.availability||{}; db.priceOverrides=db.priceOverrides||{};
  return db;
}
function saveDb(db){ fs.mkdirSync(DATA_DIR,{recursive:true}); fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2)); }
function id(){ return crypto.randomBytes(8).toString('hex'); }
function hash(p){ return crypto.createHash('sha256').update(String(p)).digest('hex'); }
function token(){ return crypto.randomBytes(24).toString('hex'); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function datesBetween(start,end){ const out=[]; const d=new Date(start+'T00:00:00'); const e=new Date(end+'T00:00:00'); while(d<e){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); } return out; }
function overlaps(a1,a2,b1,b2){ return new Date(a1)<new Date(b2) && new Date(b1)<new Date(a2); }
function publicUser(u){ return { id:u.id, type:u.type, username:u.username, firstName:u.firstName, lastName:u.lastName, agencyName:u.agencyName, email:u.email, phone:u.phone, address:u.address, verified:u.verified }; }
function auth(req){ const h=req.headers.authorization||''; const t=h.replace('Bearer ',''); const db=readDb(); if(t==='admin:'+hash(process.env.ADMIN_PASS||'woodenbridge2026')) return {role:'admin', username:process.env.ADMIN_USER||'admin'}; const u=db.users.find(x=>x.session===t); return u?{role:'user', user:u}:null; }
function requireAdmin(req,res,next){ const a=auth(req); if(!a||a.role!=='admin') return res.status(401).json({error:'Non autorizzato'}); req.auth=a; next(); }
function requireUser(req,res,next){ const a=auth(req); if(!a||a.role!=='user') return res.status(401).json({error:'Login richiesto'}); req.auth=a; next(); }
function availableHouse(db, houseId, start, end, ignoreId){
  const nights=datesBetween(start,end);
  for(const d of nights){ if(db.availability?.[houseId]?.[d]==='blocked') return false; }
  return !db.bookings.some(b=>b.id!==ignoreId && b.status==='confirmed' && b.allocations?.some(x=>x.houseId===houseId) && overlaps(start,end,b.startDate,b.endDate));
}
function nightsCount(start,end){ return Math.max(1, datesBetween(start,end).length); }
function priceFor(houseId, guests, date, db){ if(db.priceOverrides?.[houseId]?.[date]) return db.priceOverrides[houseId][date]; if(houseId==='aigoviano') return 30; if(guests===1) return 50; if(guests===2) return 35; return 30; }
function calcOptions(db, startDate, endDate, adults, minors, babies){
  const paying = Number(adults||0)+Number(minors||0); const totalPeople=paying+Number(babies||0); const nights=datesBetween(startDate,endDate); const options=[];
  const wbFree=availableHouse(db,'woodenbridge',startDate,endDate); const aiFree=availableHouse(db,'aigoviano',startDate,endDate);
  const totalFor=(alloc)=> alloc.reduce((sum,a)=>sum+nights.reduce((s,d)=>s + priceFor(a.houseId,a.guests,d,db)*a.guests,0),0);
  if(totalPeople<=7 && wbFree){ const alloc=[{houseId:'woodenbridge', guests:totalPeople, payingGuests:paying}]; options.push({id:'wb', label:'Woodenbridge House', allocations:alloc, total:totalFor([{houseId:'woodenbridge', guests:paying}]), nights:nights.length}); }
  if(totalPeople<=2 && aiFree){ const alloc=[{houseId:'aigoviano', guests:totalPeople, payingGuests:paying}]; options.push({id:'ai', label:"Casa Dell’aigoviano", allocations:alloc, total:totalFor([{houseId:'aigoviano', guests:paying}]), nights:nights.length}); }
  if(totalPeople>=6 && totalPeople<=9 && wbFree && aiFree){
    const wbGuests=Math.min(7,totalPeople-1); const aiGuests=totalPeople-wbGuests; if(aiGuests<=2){
      const wbPay=Math.min(paying, wbGuests), aiPay=Math.max(0, paying-wbPay);
      const alloc=[{houseId:'woodenbridge', guests:wbGuests, payingGuests:wbPay},{houseId:'aigoviano', guests:aiGuests, payingGuests:aiPay}];
      options.push({id:'combo', label:'Woodenbridge House + Casa Dell’aigoviano', allocations:alloc, total:totalFor([{houseId:'woodenbridge', guests:wbPay},{houseId:'aigoviano', guests:aiPay}]), nights:nights.length});
    }
  }
  return options.sort((a,b)=>a.total-b.total);
}
async function mail(to, subject, html){
  if(!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return {sent:false, reason:'SMTP non configurato'};
  const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST, port:Number(process.env.SMTP_PORT||587), secure:false, auth:{user:process.env.SMTP_USER, pass:process.env.SMTP_PASS}});
  await transporter.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER, to, subject, html}); return {sent:true};
}

const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,UPLOAD_DIR), filename:(req,file,cb)=>cb(null, Date.now()+'-'+file.originalname.replace(/[^a-z0-9._-]/gi,'_'))});
const upload=multer({storage});
app.use(express.json({limit:'2mb'}));
app.use('/data/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname,'public')));

app.get('/api/public', (req,res)=>{ const db=readDb(); res.json({settings:db.settings,houses:db.houses,services:db.services,bookings:db.bookings.filter(b=>['pending','confirmed'].includes(b.status)).map(b=>({id:b.id,startDate:b.startDate,endDate:b.endDate,status:b.status,allocations:b.allocations})), availability:db.availability, priceOverrides:db.priceOverrides}); });
app.post('/api/admin/login',(req,res)=>{ const {username,password}=req.body; if(username===(process.env.ADMIN_USER||'admin') && password===(process.env.ADMIN_PASS||'woodenbridge2026')) return res.json({token:'admin:'+hash(process.env.ADMIN_PASS||'woodenbridge2026'), admin:true}); res.status(401).json({error:'Credenziali errate'}); });
app.post('/api/register', async (req,res)=>{ const db=readDb(); const b=req.body; if(!b.email||!b.phone||!b.username||!b.password||!b.firstName||!b.lastName||!b.address) return res.status(400).json({error:'Compila tutti i campi obbligatori'}); if(db.users.some(u=>u.email.toLowerCase()===b.email.toLowerCase()||u.username.toLowerCase()===b.username.toLowerCase())) return res.status(400).json({error:'Utente o email già registrati'}); if(b.type==='agency'&&!b.agencyName) return res.status(400).json({error:'Inserisci nome struttura/agenzia'});
  const code=String(Math.floor(100000+Math.random()*900000)); const user={id:id(),type:b.type==='agency'?'agency':'person',username:b.username,passwordHash:hash(b.password),firstName:b.firstName,lastName:b.lastName,agencyName:b.agencyName||'',address:b.address,phone:b.phone,email:b.email,verified:false,createdAt:new Date().toISOString()}; db.users.push(user); db.verifications.push({email:b.email, code, expiresAt:Date.now()+1000*60*30}); saveDb(db);
  let mailResult; try{mailResult=await mail(b.email,'Codice verifica Woodenbridge House',`<h2>Codice verifica</h2><p>Il tuo codice è <b>${code}</b></p>`);}catch(e){mailResult={sent:false,error:e.message};}
  res.json({ok:true, message:'Registrazione completata. Verifica la mail e poi accedi.', devCode: mailResult.sent?undefined:code, mailResult}); });
app.post('/api/verify',(req,res)=>{ const db=readDb(); const v=db.verifications.find(x=>x.email.toLowerCase()===String(req.body.email||'').toLowerCase()&&x.code===String(req.body.code||'')&&x.expiresAt>Date.now()); if(!v) return res.status(400).json({error:'Codice non valido'}); const u=db.users.find(x=>x.email.toLowerCase()===v.email.toLowerCase()); if(u) u.verified=true; db.verifications=db.verifications.filter(x=>x!==v); saveDb(db); res.json({ok:true}); });
app.post('/api/login',(req,res)=>{ const db=readDb(); const u=db.users.find(x=>(x.username===req.body.username||x.email===req.body.username)&&x.passwordHash===hash(req.body.password)); if(!u) return res.status(401).json({error:'Credenziali errate'}); if(!u.verified) return res.status(403).json({error:'Email non verificata'}); u.session=token(); saveDb(db); res.json({token:u.session,user:publicUser(u)}); });
app.post('/api/password-reset', async (req,res)=>{ const db=readDb(); const u=db.users.find(x=>x.email.toLowerCase()===String(req.body.email||'').toLowerCase()); if(!u) return res.json({ok:true}); const t=token(); db.resetTokens.push({userId:u.id, token:t, expiresAt:Date.now()+1000*60*60}); saveDb(db); const link=(process.env.PUBLIC_BASE_URL||'')+`/reset.html?token=${t}`; try{await mail(u.email,'Reset password Woodenbridge House',`<p>Apri questo link per reimpostare la password:</p><p><a href="${link}">${link}</a></p>`);}catch(e){} res.json({ok:true, devToken:t}); });
app.post('/api/password-reset/confirm',(req,res)=>{ const db=readDb(); const r=db.resetTokens.find(x=>x.token===req.body.token&&x.expiresAt>Date.now()); if(!r) return res.status(400).json({error:'Token non valido'}); const u=db.users.find(x=>x.id===r.userId); if(u) u.passwordHash=hash(req.body.password); db.resetTokens=db.resetTokens.filter(x=>x!==r); saveDb(db); res.json({ok:true}); });

app.post('/api/quote',(req,res)=>{ const db=readDb(); res.json({options:calcOptions(db,req.body.startDate,req.body.endDate,req.body.adults,req.body.minors,req.body.babies)}); });
app.post('/api/bookings', requireUser, (req,res)=>{ const db=readDb(); const options=calcOptions(db,req.body.startDate,req.body.endDate,req.body.adults,req.body.minors,req.body.babies); const opt=options.find(o=>o.id===req.body.optionId); if(!opt) return res.status(400).json({error:'Opzione non disponibile'}); const u=req.auth.user; const b={id:id(),status:'pending',source:u.type,agencyId:u.type==='agency'?u.id:null,userId:u.type==='person'?u.id:null,guestName:req.body.guestName||`${u.firstName} ${u.lastName}`,guestPhone:req.body.guestPhone||u.phone,guestEmail:req.body.guestEmail||u.email,startDate:req.body.startDate,endDate:req.body.endDate,adults:Number(req.body.adults||0),minors:Number(req.body.minors||0),babies:Number(req.body.babies||0),needStairGates:!!req.body.needStairGates,notes:req.body.notes||'',allocations:opt.allocations,total:opt.total,createdAt:new Date().toISOString(),history:[{at:new Date().toISOString(),text:'Richiesta creata'}]}; db.bookings.push(b); saveDb(db); res.json({ok:true,booking:b}); });
app.get('/api/my/bookings', requireUser, (req,res)=>{ const u=req.auth.user; const db=readDb(); const list=db.bookings.filter(b=>u.type==='agency'?b.agencyId===u.id:b.userId===u.id); res.json({bookings:list}); });
app.post('/api/my/bookings/:id/cancel-request', requireUser, (req,res)=>{ const u=req.auth.user; const db=readDb(); const b=db.bookings.find(x=>x.id===req.params.id && (x.userId===u.id||x.agencyId===u.id)); if(!b) return res.status(404).json({error:'Booking non trovato'}); b.cancelRequest={reason:req.body.reason||'',status:'pending',requestedAt:new Date().toISOString()}; b.history=b.history||[]; b.history.push({at:new Date().toISOString(),text:'Richiesta cancellazione inviata'}); saveDb(db); res.json({ok:true}); });

app.get('/api/admin/db', requireAdmin, (req,res)=>res.json(readDb()));
app.post('/api/admin/settings', requireAdmin, (req,res)=>{ const db=readDb(); db.settings={...db.settings,...req.body}; saveDb(db); res.json({ok:true,settings:db.settings}); });
app.post('/api/admin/houses/:id', requireAdmin, (req,res)=>{ const db=readDb(); const h=db.houses.find(x=>x.id===req.params.id); if(!h) return res.status(404).json({error:'Casa non trovata'}); Object.assign(h,req.body); saveDb(db); res.json({ok:true,house:h}); });
app.post('/api/admin/houses', requireAdmin, (req,res)=>{ const db=readDb(); const b=req.body; const clean=String(b.id||b.name||'house').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||id(); if(db.houses.some(h=>h.id===clean)) return res.status(400).json({error:'Esiste già una casa con questo ID'}); const h={id:clean,name:b.name||'Nuova casa',capacity:Number(b.capacity||2),bedrooms:Number(b.bedrooms||1),description:b.description||'',photos:[],services:Array.isArray(b.services)?b.services:[]}; db.houses.push(h); saveDb(db); res.json({ok:true,house:h}); });
app.delete('/api/admin/houses/:id', requireAdmin, (req,res)=>{ const db=readDb(); if(['woodenbridge','aigoviano'].includes(req.params.id)) return res.status(400).json({error:'Non cancellare le case principali, modificale.'}); db.houses=db.houses.filter(h=>h.id!==req.params.id); saveDb(db); res.json({ok:true}); });
app.post('/api/admin/services', requireAdmin, (req,res)=>{ const db=readDb(); const b=req.body; const sid=String(b.id||b.nameIt||'service').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||id(); const svc={id:sid, icon:b.icon||'✓', name:{it:b.nameIt||'Servizio',en:b.nameEn||b.nameIt||'Service',fr:b.nameFr||b.nameIt||'Service'}, description:{it:b.descIt||'',en:b.descEn||b.descIt||'',fr:b.descFr||b.descIt||''}}; const i=db.services.findIndex(s=>s.id===sid); if(i>=0) db.services[i]=svc; else db.services.push(svc); saveDb(db); res.json({ok:true,service:svc}); });
app.delete('/api/admin/services/:id', requireAdmin, (req,res)=>{ const db=readDb(); db.services=db.services.filter(s=>s.id!==req.params.id); db.houses.forEach(h=>h.services=(h.services||[]).filter(x=>x!==req.params.id)); saveDb(db); res.json({ok:true}); });
app.post('/api/admin/upload/:houseId', requireAdmin, upload.array('photos',30), (req,res)=>{ const db=readDb(); const h=db.houses.find(x=>x.id===req.params.houseId); if(!h) return res.status(404).json({error:'Casa non trovata'}); const files=req.files.map(f=>'/data/uploads/'+path.basename(f.filename)); h.photos=[...(h.photos||[]),...files]; saveDb(db); res.json({ok:true,files,house:h}); });
app.post('/api/admin/logo', requireAdmin, upload.single('logo'), (req,res)=>{ const db=readDb(); db.settings.logo='/data/uploads/'+path.basename(req.file.filename); saveDb(db); res.json({ok:true,logo:db.settings.logo}); });
app.post('/api/admin/availability', requireAdmin, (req,res)=>{ const db=readDb(); const {houseId,startDate,endDate,status}=req.body; db.availability[houseId]=db.availability[houseId]||{}; for(const d of datesBetween(startDate,endDate)){ if(status==='free') delete db.availability[houseId][d]; else db.availability[houseId][d]='blocked'; } saveDb(db); res.json({ok:true}); });
app.post('/api/admin/prices', requireAdmin, (req,res)=>{ const db=readDb(); const {houseId,startDate,endDate,price}=req.body; db.priceOverrides[houseId]=db.priceOverrides[houseId]||{}; for(const d of datesBetween(startDate,endDate)){ if(price===''||price==null) delete db.priceOverrides[houseId][d]; else db.priceOverrides[houseId][d]=Number(price); } saveDb(db); res.json({ok:true}); });
app.post('/api/admin/bookings', requireAdmin, (req,res)=>{ const db=readDb(); const options=calcOptions(db,req.body.startDate,req.body.endDate,req.body.adults||1,req.body.minors||0,req.body.babies||0); const opt=options.find(o=>o.id===req.body.optionId)||options[0]; if(!opt) return res.status(400).json({error:'Nessuna struttura disponibile'}); const b={id:id(),status:req.body.status||'confirmed',source:req.body.agencyId?'agency':'admin',agencyId:req.body.agencyId||null,userId:null,guestName:req.body.guestName,guestPhone:req.body.guestPhone||'',guestEmail:req.body.guestEmail||'',startDate:req.body.startDate,endDate:req.body.endDate,adults:Number(req.body.adults||1),minors:Number(req.body.minors||0),babies:Number(req.body.babies||0),needStairGates:!!req.body.needStairGates,notes:req.body.notes||'',allocations:opt.allocations,total:req.body.total?Number(req.body.total):opt.total,createdAt:new Date().toISOString(),history:[{at:new Date().toISOString(),text:'Booking creato da admin'}]}; db.bookings.push(b); saveDb(db); res.json({ok:true,booking:b}); });
app.patch('/api/admin/bookings/:id', requireAdmin, (req,res)=>{ const db=readDb(); const b=db.bookings.find(x=>x.id===req.params.id); if(!b) return res.status(404).json({error:'Booking non trovato'}); if(req.body.startDate||req.body.endDate||req.body.adults!==undefined||req.body.minors!==undefined||req.body.babies!==undefined){ const start=req.body.startDate||b.startDate, end=req.body.endDate||b.endDate; const opts=calcOptions(db,start,end,req.body.adults??b.adults,req.body.minors??b.minors,req.body.babies??b.babies); const opt=opts.find(o=>o.id===(req.body.optionId||'wb'))||opts[0]; if(opt){ b.allocations=opt.allocations; b.total=opt.total; } }
  Object.assign(b, req.body); b.history=b.history||[]; b.history.push({at:new Date().toISOString(),text:'Booking modificato da admin'}); saveDb(db); res.json({ok:true,booking:b}); });
app.post('/api/admin/bookings/:id/accept', requireAdmin, (req,res)=>{ const db=readDb(); const b=db.bookings.find(x=>x.id===req.params.id); if(!b) return res.status(404).json({error:'Booking non trovato'}); b.status='confirmed'; b.history=b.history||[]; b.history.push({at:new Date().toISOString(),text:'Booking confermato'}); saveDb(db); res.json({ok:true,booking:b}); });
app.post('/api/admin/bookings/:id/cancel', requireAdmin, (req,res)=>{ const db=readDb(); const b=db.bookings.find(x=>x.id===req.params.id); if(!b) return res.status(404).json({error:'Booking non trovato'}); b.status='cancelled'; b.cancelReason=req.body.reason||''; if(b.cancelRequest) b.cancelRequest.status='approved'; b.history=b.history||[]; b.history.push({at:new Date().toISOString(),text:'Booking annullato'}); saveDb(db); res.json({ok:true}); });
app.delete('/api/admin/bookings/:id', requireAdmin, (req,res)=>{ const db=readDb(); db.bookings=db.bookings.filter(x=>x.id!==req.params.id); saveDb(db); res.json({ok:true}); });
app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log('Woodenbridge Booking v3 on port '+PORT));
