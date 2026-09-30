// Copias de la caja local. Este router nunca crea ventas, altera stock ni cierra turnos.
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth.middleware');
const { getSupabase } = require('../lib/supabase-storage');
const router = express.Router();
const BUCKET = process.env.RETAIL_OFFLINE_BACKUP_BUCKET || 'retail-offline-backups';
const AUDIENCE = 'mrtpv-retail-offline-backup';
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const signingKey = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET requerido');
  // Los tokens de respaldo no son aceptables como JWT de sesión de la aplicación.
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(AUDIENCE).digest('hex');
};
router.use(rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false }));

router.post('/register', authenticate, async (req, res) => {
  try {
    if (!['OWNER','ADMIN','MANAGER','SUPER_ADMIN'].includes(req.user?.role)) return res.status(403).json({error:'Solo administradores pueden vincular respaldos.'});
    const restaurantId = req.user?.restaurantId;
    const { installationId, localStoreId } = req.body;
    if (![restaurantId,installationId,localStoreId].every(validId)) return res.status(400).json({error:'Identidad de respaldo inválida.'});
    const storage = getSupabase().storage;
    const { data:bucket, error:lookup } = await storage.getBucket(BUCKET);
    if (!bucket) {
      if (lookup && !String(lookup.message).toLowerCase().includes('not found')) throw lookup;
      const { error } = await storage.createBucket(BUCKET,{public:false,fileSizeLimit:30*1024*1024,allowedMimeTypes:['application/json']});
      if (error && !String(error.message).toLowerCase().includes('already exists')) throw error;
    } else if (bucket.public) {
      throw new Error('El bucket de respaldos debe ser privado.');
    }
    const backupToken = jwt.sign({purpose:AUDIENCE,restaurantId,installationId,localStoreId},signingKey(),{audience:AUDIENCE,expiresIn:'365d'});
    res.json({backupToken});
  } catch (e) {
    console.error('[retail-offline-backups] register:',e.message);
    res.status(503).json({error:'No se pudo preparar el almacenamiento de respaldos.'});
  }
});

function backupAuth(req,res,next){
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /,'');
    const payload = jwt.verify(token,signingKey(),{audience:AUDIENCE,algorithms:['HS256']});
    if(payload.purpose!==AUDIENCE || ![payload.restaurantId,payload.installationId,payload.localStoreId].every(validId)) throw new Error('invalid scope');
    req.backup=payload;next();
  } catch { res.status(401).json({error:'Vuelve a vincular la cuenta de respaldo. La caja puede seguir trabajando localmente.'}); }
}
const folder = scope => `${scope.restaurantId}/${scope.installationId}/${scope.localStoreId}`;

router.post('/snapshot',backupAuth,async(req,res)=>{
  try {
    const {snapshot,checksum}=req.body;
    if(snapshot?.format!=='mrtpv-retail-local' || snapshot.version!==1 || snapshot.store?.id!==req.backup.localStoreId || !Array.isArray(snapshot.records)
      || !Number.isSafeInteger(snapshot.store.revision) || snapshot.store.revision<1) return res.status(400).json({error:'Formato de respaldo inválido.'});
    if(snapshot.records.some(r=>r.storeId!==snapshot.store.id)) return res.status(400).json({error:'El respaldo contiene datos de otra tienda.'});
    const buffer=Buffer.from(JSON.stringify(snapshot));
    if(buffer.length>30*1024*1024) return res.status(413).json({error:'El respaldo excede 30 MB. Conserva una copia en archivo.'});
    const digest=crypto.createHash('sha256').update(buffer).digest('hex');
    if(checksum!==digest) return res.status(400).json({error:'La integridad del respaldo no coincide.'});
    const path=`${folder(req.backup)}/${String(snapshot.store.revision).padStart(16,'0')}-${digest}.json`;
    const storage=getSupabase().storage;
    // Comprobar privacidad también al escribir, por si cambió la configuración.
    const {data:bucket,error:bucketError}=await storage.getBucket(BUCKET);
    if(bucketError || !bucket || bucket.public) throw new Error('Almacenamiento privado no disponible');
    const {error}=await storage.from(BUCKET).upload(path,buffer,{contentType:'application/json',upsert:false});
    if(error && !['Duplicate','The resource already exists'].some(s=>String(error.message).includes(s))) throw error;
    // Un reintento del mismo contenido es idempotente; cada revisión se conserva.
    res.json({revision:snapshot.store.revision,checksum:digest,storedAt:new Date().toISOString()});
  }catch(e){console.error('[retail-offline-backups] snapshot:',e.message);res.status(503).json({error:'Respaldo pendiente. Se volverá a intentar.'});}
});

router.get('/latest',backupAuth,async(req,res)=>{
  try{
    const storage=getSupabase().storage.from(BUCKET);
    const {data,error}=await storage.list(folder(req.backup),{limit:1,sortBy:{column:'name',order:'desc'}});
    if(error)throw error;
    if(!data?.length)return res.status(404).json({error:'Todavía no hay respaldos.'});
    const {data:download,error:signError}=await storage.createSignedUrl(`${folder(req.backup)}/${data[0].name}`,300);
    if(signError)throw signError;
    res.json({url:download.signedUrl});
  }catch(e){console.error('[retail-offline-backups] latest:',e.message);res.status(503).json({error:'No se pudo recuperar el respaldo.'});}
});
module.exports=router;
