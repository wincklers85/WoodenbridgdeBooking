const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'woodenbridge2026', 10);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readDb(){ return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDb(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function authed(req,res,next){ if(req.session?.admin) return next(); res.status(401).json({error:'Non autorizzato'}); }
function cleanDate(d){ return /^\d{4}-\d{2}-\d{2}$/.test(d); }

const storage = multer.diskStorage({ destination: UPLOAD_DIR, filename: (req,file,cb)=> cb(null, Date.now()+'-'+file.originalname.replace(/[^a-z0-9._-]/gi,'_')) });
const upload = multer({ storage, limits:{ fileSize: 8*1024*1024 }, fileFilter:(req,file,cb)=> cb(null, /^image\//.test(file.mimetype)) });

app.use(cors());
app.use(express.json({limit:'1mb'}));
app.use(session({ secret: process.env.SESSION_SECRET || 'change-this-secret', resave:false, saveUninitialized:false, cookie:{ maxAge: 1000*60*60*12 } }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/public', (req,res)=> {
  const db = readDb();
  res.json({ properties: db.properties, availability: db.availability });
});

app.post('/api/request', (req,res)=> {
  const { propertyId, from, to, name, email, phone, message, guests } = req.body;
  if(!['woodenbridge','aigoviano'].includes(propertyId) || !cleanDate(from) || !cleanDate(to) || !name || (!email && !phone)) return res.status(400).json({error:'Dati mancanti'});
  const db = readDb();
  db.requests.unshift({ id: Date.now().toString(), createdAt: new Date().toISOString(), propertyId, from, to, name, email, phone, guests, message, status:'new' });
  writeDb(db);
  res.json({ ok:true, message:'Richiesta inviata. Ti ricontatteremo per conferma.' });
});

app.post('/api/login', async (req,res)=> {
  const { username, password } = req.body;
  if(username === ADMIN_USER && await bcrypt.compare(password, ADMIN_PASS_HASH)){ req.session.admin = true; return res.json({ok:true}); }
  res.status(401).json({error:'Credenziali errate'});
});
app.post('/api/logout', (req,res)=> req.session.destroy(()=>res.json({ok:true})) );
app.get('/api/admin', authed, (req,res)=> res.json(readDb()));

app.put('/api/property/:id', authed, (req,res)=> {
  const id = req.params.id; const { name, beds, description } = req.body;
  if(!['woodenbridge','aigoviano'].includes(id)) return res.status(404).json({error:'Struttura non trovata'});
  const db = readDb();
  db.properties[id] = { ...db.properties[id], name: name || db.properties[id].name, beds: Number(beds) || db.properties[id].beds, description: description ?? db.properties[id].description };
  writeDb(db); res.json({ok:true});
});

app.post('/api/property/:id/photo', authed, upload.single('photo'), (req,res)=> {
  const id = req.params.id; if(!['woodenbridge','aigoviano'].includes(id)) return res.status(404).json({error:'Struttura non trovata'});
  const db = readDb(); const url = '/uploads/' + req.file.filename;
  db.properties[id].photos.push(url); writeDb(db); res.json({ok:true, url});
});

app.delete('/api/property/:id/photo', authed, (req,res)=> {
  const { url } = req.body; const id = req.params.id; const db = readDb();
  db.properties[id].photos = db.properties[id].photos.filter(p => p !== url); writeDb(db); res.json({ok:true});
});

app.put('/api/availability/:id', authed, (req,res)=> {
  const id = req.params.id; const { dates, status } = req.body;
  if(!['woodenbridge','aigoviano'].includes(id) || !Array.isArray(dates) || !['free','busy'].includes(status)) return res.status(400).json({error:'Dati non validi'});
  const db = readDb();
  dates.forEach(d => { if(cleanDate(d)){ if(status === 'free') delete db.availability[id][d]; else db.availability[id][d] = 'busy'; } });
  writeDb(db); res.json({ok:true});
});

app.put('/api/request/:id', authed, (req,res)=> {
  const db = readDb(); const r = db.requests.find(x=>x.id===req.params.id);
  if(!r) return res.status(404).json({error:'Richiesta non trovata'});
  r.status = req.body.status || r.status; writeDb(db); res.json({ok:true});
});

app.get('*', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, ()=> console.log(`Woodenbridge House online on port ${PORT}`));
