const request=require('supertest');
const express=require('express');
const crypto=require('crypto');
const jwt=require('jsonwebtoken');
jest.mock('../src/middleware/auth.middleware',()=>({authenticate:(req,res,next)=>{
  req.user={id:'owner',restaurantId:'restaurant-a',role:'OWNER'};next();
}}));
const mockUpload=jest.fn();
const mockList=jest.fn();
const mockSign=jest.fn();
const mockBucket=jest.fn();
jest.mock('../src/lib/supabase-storage',()=>({getSupabase:()=>({storage:{
  getBucket:mockBucket,createBucket:jest.fn(),
  from:()=>({upload:mockUpload,list:mockList,createSignedUrl:mockSign}),
}})}));
process.env.JWT_SECRET='offline-backup-test-key-only';
const app=express();app.use(express.json());app.use('/backups',require('../src/routes/retail-offline-backups.routes'));
const register=()=>request(app).post('/backups/register').send({installationId:'device-a',localStoreId:'local-a'});
beforeEach(()=>{jest.clearAllMocks();mockBucket.mockResolvedValue({data:{public:false}});mockUpload.mockResolvedValue({error:null});});

test('registro produce una credencial que no funciona como sesión normal',async()=>{
  const r=await register();expect(r.status).toBe(200);
  expect(()=>jwt.verify(r.body.backupToken,process.env.JWT_SECRET)).toThrow();
});
test('solo respalda la tienda vinculada, verifica integridad y confirma después de almacenar',async()=>{
  const {body:{backupToken}}=await register();
  const snapshot={format:'mrtpv-retail-local',version:1,store:{id:'local-a',revision:4},records:[]};
  const checksum=crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const r=await request(app).post('/backups/snapshot').auth(backupToken,{type:'bearer'}).send({snapshot,checksum});
  expect(r.status).toBe(200);expect(r.body).toMatchObject({revision:4,checksum});
  expect(mockUpload.mock.calls[0][0]).toMatch(/^restaurant-a\/device-a\/local-a\//);
  expect(mockUpload.mock.calls[0][2].upsert).toBe(false);
  const wrong=await request(app).post('/backups/snapshot').auth(backupToken,{type:'bearer'}).send({snapshot:{...snapshot,store:{id:'other',revision:4}},checksum});
  expect(wrong.status).toBe(400);expect(mockUpload).toHaveBeenCalledTimes(1);
  const corrupt=await request(app).post('/backups/snapshot').auth(backupToken,{type:'bearer'}).send({snapshot,checksum:'bad'});
  expect(corrupt.status).toBe(400);expect(mockUpload).toHaveBeenCalledTimes(1);
});
test('un fallo del almacenamiento no confirma el respaldo y no permite buckets públicos',async()=>{
  const {body:{backupToken}}=await register();
  const snapshot={format:'mrtpv-retail-local',version:1,store:{id:'local-a',revision:1},records:[]};
  const checksum=crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  mockUpload.mockResolvedValue({error:{message:'storage unavailable'}});
  const r=await request(app).post('/backups/snapshot').auth(backupToken,{type:'bearer'}).send({snapshot,checksum});
  expect(r.status).toBe(503);expect(r.body.revision).toBeUndefined();
  mockBucket.mockResolvedValue({data:{public:true}});
  const publicResult=await register();expect(publicResult.status).toBe(503);
});
test('rechaza credenciales inválidas y rutas de almacenamiento manipuladas',async()=>{
  expect((await request(app).post('/backups/snapshot').auth('bad',{type:'bearer'}).send({})).status).toBe(401);
  expect((await request(app).post('/backups/register').send({installationId:'../other',localStoreId:'local-a'})).status).toBe(400);
});
