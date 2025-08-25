const jsonServer = require('json-server');
const path = require('path');
const dayjs = require('dayjs');
const validator = require('validator');

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const db = router.db;

const middlewares = jsonServer.defaults({ logger: true, static: null, noCors: false });
server.use(middlewares);
server.use(jsonServer.bodyParser);

const nowISO = () => new Date().toISOString();
const ensureString = v => (typeof v === 'string' ? v.trim() : '');
const ensureNumber = v => (typeof v === 'number' ? v : Number(v));
function parseTimeToMinutes(hhmm) { const [h,m] = String(hhmm).split(':').map(n=>parseInt(n,10)); if(Number.isNaN(h)||Number.isNaN(m)) return null; return h*60+m; }
function hoursBetween(start,end){ const s=parseTimeToMinutes(start); const e=parseTimeToMinutes(end); if(s===null||e===null) return null; let diff=e-s; if(diff<=0) diff+=24*60; return diff/60; }

server.get('/health', (_req,res)=>res.json({ok:true, ts: nowISO()}));

server.use((req,res,next)=>{
  if(req.method==='POST'){ req.body=req.body||{}; if(!req.body.createdAt) req.body.createdAt=nowISO(); if(!req.body.updatedAt) req.body.updatedAt=req.body.createdAt; }
  if(req.method==='PUT'||req.method==='PATCH'){ req.body=req.body||{}; req.body.updatedAt=nowISO(); }

  const p = req.path.toLowerCase();

  if(req.method==='POST' && p==='/users'){
    const role=ensureString(req.body.role);
    const name=ensureString(req.body.name);
    const email=ensureString(req.body.email);
    if(!['worker','employer'].includes(role)) return res.status(400).json({error:'role deve essere worker o employer'});
    if(!name) return res.status(400).json({error:'name obbligatorio'});
    if(!email || !validator.isEmail(email)) return res.status(400).json({error:'email non valida'});
    const exists=db.get('users').find({email}).value(); if(exists) return res.status(409).json({error:'email già registrata (demo)'});
  }

  if(req.method==='POST' && p==='/shifts'){
    const title=ensureString(req.body.title);
    const date=ensureString(req.body.date);
    const startTime=ensureString(req.body.startTime);
    const endTime=ensureString(req.body.endTime);
    const hourlyRate=ensureNumber(req.body.hourlyRate);
    const employerId=ensureString(req.body.employerId);
    if(!title) return res.status(400).json({error:'title obbligatorio'});
    if(!date) return res.status(400).json({error:'date obbligatoria (YYYY-MM-DD)'});
    if(!startTime||!endTime) return res.status(400).json({error:'startTime e endTime obbligatori (HH:MM)'});
    if(!hourlyRate||isNaN(hourlyRate)||hourlyRate<=0) return res.status(400).json({error:'hourlyRate deve essere > 0'});
    if(!employerId) return res.status(400).json({error:'employerId obbligatorio'});
    const employer=db.get('users').find({id:employerId, role:'employer'}).value();
    if(!employer) return res.status(400).json({error:'employerId non valido'});
    const hrs=hoursBetween(startTime,endTime); if(hrs===null) return res.status(400).json({error:'startTime/endTime non validi (HH:MM)'});
    let totalEstimated=ensureNumber(req.body.totalEstimated);
    if(!totalEstimated||isNaN(totalEstimated)||totalEstimated<=0){ totalEstimated=Math.round(hrs*hourlyRate); req.body.totalEstimated=totalEstimated; }
    if(!req.body.status) req.body.status='open';
    if(req.body.requiredSkills && !Array.isArray(req.body.requiredSkills)) return res.status(400).json({error:'requiredSkills deve essere un array di stringhe'});
  }

  if(req.method==='POST' && p==='/matches'){
    const shiftId=ensureString(req.body.shiftId);
    const workerId=ensureString(req.body.workerId);
    const employerId=ensureString(req.body.employerId);
    if(!shiftId||!workerId||!employerId) return res.status(400).json({error:'shiftId, workerId, employerId obbligatori'});
    const shift=db.get('shifts').find({id:shiftId}).value(); if(!shift) return res.status(400).json({error:'shiftId non valido'});
    const worker=db.get('users').find({id:workerId, role:'worker'}).value(); if(!worker) return res.status(400).json({error:'workerId non valido'});
    const employer=db.get('users').find({id:employerId, role:'employer'}).value(); if(!employer) return res.status(400).json({error:'employerId non valido'});
    const dup=db.get('matches').find({shiftId, workerId}).value(); if(dup) return res.status(409).json({error:'già candidato a questo turno'});
    if(!req.body.status) req.body.status='applied';
  }
  next();
});

server.patch('/matches/:id/decision',(req,res)=>{
  const id=req.params.id; const decision=ensureString(req.body.decision);
  if(!['accepted','rejected'].includes(decision)) return res.status(400).json({error:'decision deve essere accepted o rejected'});
  const match=db.get('matches').find({id}).value(); if(!match) return res.status(404).json({error:'match non trovato'});
  db.get('matches').find({id}).assign({status:decision, updatedAt: nowISO()}).write();
  return res.json(db.get('matches').find({id}).value());
});

server.use(router);

const PORT = process.env.PORT || 10000;
server.listen(PORT, ()=>console.log(`✅ Lavoor JSON API su porta ${PORT}`));
