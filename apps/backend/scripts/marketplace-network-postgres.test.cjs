'use strict';

// Ejecución EXPLÍCITA contra el cluster desechable del plan. Nunca carga .env.
// Preparar las migraciones y el cliente temporal antes; no se incluye en runner offline.
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const ROOT = path.resolve(__dirname, '../../..');
const { createNetworkPersistence, createNetworkOpsPorts, createNetworkCourierPorts } = require('../src/lib/marketplace-network-prisma');
const { createMarketplaceOpsDispatchService } = require('../src/lib/marketplace-ops-dispatch-v1');
const { createCouriersV1Service } = require('../src/lib/marketplace-couriers-v1');
const { hashPin } = require('../src/lib/marketplace-dispatch');
const { tenantGuard } = require('../../../packages/database/tenant-guard');

function database() {
  // El cliente generado fuera del workspace usa las dependencias ya instaladas
  // del cliente del paquete; no instala ni cambia el cliente compartido.
  process.env.NODE_PATH = path.dirname(path.dirname(path.dirname(require.resolve('@prisma/client/package.json', {paths:[path.join(ROOT,'packages/database')]}))));
  require('node:module').Module._initPaths();
  const { PrismaClient } = require(path.join(ROOT, '.marketplace-local/codex-g1/client'));
  const { PrismaPg } = require(path.join(ROOT, 'packages/database/node_modules/@prisma/adapter-pg'));
  const connectionString = 'postgresql://codex_test@127.0.0.1:55449/marketplace_codex_test';
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const prisma = base.$extends(tenantGuard({ mode: 'enforce' }));
  return { base, prisma };
}

// Este modo se ejecuta en otro proceso: no hereda mapas, engine ni cliente Prisma.
async function verifyRestart({taskId, orderId, courierId, timestamp, parentPid}) {
  assert.notEqual(process.pid, parentPid);
  const {base, prisma} = database();
  const persistence = createNetworkPersistence({prisma, now: () => new Date(timestamp)});
  try {
    const task = await persistence.run(r => r.engine.taskFor(taskId));
    assert.equal(task.status, 'ASSIGNED');
    assert.equal(task.currentAssignment.courierId, courierId);
    assert.equal(task.currentAssignment.status, 'ACTIVE');
    assert.equal(task.pinAttempts.pickup.failures, 10);
    await assert.rejects(persistence.run(r => r.engine.confirmPickup({
      taskId, courierId, pickupPin: '123456',
    })), e => e.code === 'DELIVERY_PIN_LOCKED' && e.statusCode === 429);
    assert.equal((await base.order.findUnique({where:{id:orderId}})).status, 'READY');
    const saved = await base.marketplaceNetworkTask.findUnique({where:{id:taskId}});
    assert.equal(saved.payload.pinAttempts.pickup.failures, 10);
    assert.equal(saved.status, 'ASSIGNED');
    console.log(JSON.stringify({pid:process.pid, status:'ASSIGNED', failures:10, locked:true}));
  } finally { await base.$disconnect(); }
}

async function run() {
  const { base, prisma } = database();
  const tag = 'net_' + randomUUID().slice(0,8);
  let at = new Date('2026-10-26T12:00:00Z');
  const now = () => new Date(at);
  const persistence = () => createNetworkPersistence({prisma,now});
  const admin = {accountId:'platform-test',id:'platform-test',roles:['SUPER_ADMIN'],isActive:true};
  let checks=0;
  const pass = text => { checks++; console.log('PASS '+text); };
  try {
    const tenant = await base.tenant.create({data:{name:tag,slug:tag,ownerEmail:tag+'@example.test'}});
    const restaurant = await base.restaurant.create({data:{tenantId:tenant.id,name:tag,slug:tag}});
    const location = await base.location.create({data:{restaurantId:restaurant.id,name:'Sucursal',slug:tag,latitude:19.4,longitude:-99.1}});
    async function order(number,policy='SHARED_ONLY',status='READY',pickupLocation=location) {
      const id=tag+'_'+number, taskId=id+'_task';
      const task={id:taskId,orderId:id,restaurantId:restaurant.id,locationId:pickupLocation.id,merchantId:pickupLocation.id,
        deliveryPolicy:policy,status:'WAITING_READY',pickupPinHash:hashPin('123456'),deliveryPinHash:hashPin('654321'),
        payoutAmount:30,currency:'MXN',fallbackSeconds:30,maxDistanceKm:10};
      await base.order.create({data:{id,restaurantId:restaurant.id,locationId:pickupLocation.id,orderNumber:id,
        source:'MARKETPLACE',orderType:'DELIVERY',status,paymentMethod:'CASH',subtotal:100,deliveryFee:30,total:130,
        marketplacePipeline:{create:{storeSlug:tag,requestHash:'a'.repeat(64),trackingTokenHash:'b'.repeat(64),
          trackingExpiresAt:new Date('2026-11-01'),pinKeyId:'test',pickupPinHash:task.pickupPinHash,deliveryPinHash:task.deliveryPinHash,
          paymentMethod:'CASH',settlement:{subtotalCents:10000,totalCents:13000,courierPayoutCents:3000},dispatch:{task,offer:null}}}}});
      return task;
    }
    const first=await order('first'), manual=await order('manual','MANUAL'), pending=await order('pending','SHARED_ONLY','PENDING_MERCHANT');
    const p=persistence();
    await p.run(r=>p.tick(r));
    assert.equal(await base.marketplaceNetworkTask.count({where:{orderId:manual.orderId}}),0);
    assert.equal(await base.marketplaceNetworkTask.count({where:{orderId:pending.orderId}}),0);
    pass('MANUAL y pendientes no entran al despacho');
    const couriers=[];
    const service=createCouriersV1Service(createNetworkCourierPorts(p));
    const ops=createMarketplaceOpsDispatchService({...createNetworkOpsPorts(p),now});
    for(let i=0;i<2;i++) {
      const actor={accountId:tag+'_c'+i,roles:['COURIER'],isActive:true};
      const c=await service.apply(actor,{name:'Repartidor Prueba',phone:'+52555555555'+i,email:tag+i+'@example.test',vehicleType:'BICI'});
      const pendingCourier=await base.marketplaceNetworkCourier.findUnique({where:{id:c.courierId}});
      await createNetworkCourierPorts(p).courierStore.findById(c.courierId);
      assert.equal((await base.marketplaceNetworkCourier.findUnique({where:{id:c.courierId}})).version,pendingCourier.version);
      await ops.approveCourier(admin,c.courierId);
      const approvedCourier=await base.marketplaceNetworkCourier.findUnique({where:{id:c.courierId}});
      assert.equal(approvedCourier.payload.isActive,true);
      await createNetworkCourierPorts(persistence()).courierStore.findById(c.courierId);
      assert.equal((await base.marketplaceNetworkCourier.findUnique({where:{id:c.courierId}})).version,approvedCourier.version);
      couriers.push(c.courierId);
      await p.run(r=> { const v=r.store.couriers.get(c.courierId);v.isOnline=true;v.presence={lat:19.4,lng:-99.1,accuracy:5,lastSeenAt:now(),acceptingShared:true}; });
    }
    pass('consultar repartidores pendientes y aprobados no incrementa su versión');
    let offers=await p.run(r=>r.engine.offersForCourier(couriers[0]).filter(o=>o.taskId===first.id));
    assert.equal(offers.length,1);
    const old=offers[0].id;
    at=new Date(at.getTime()+31000);
    offers=await persistence().run(r=>r.engine.offersForCourier(couriers[0]).filter(o=>o.taskId===first.id));
    assert(offers.length===1 && offers[0].id!==old);
    assert.equal((await base.marketplaceNetworkOffer.findUnique({where:{id:old}})).status,'EXPIRED');
    pass('registro, aprobación, presencia y reoferta tras expiración');
    const offers2=await p.run(r=>r.engine.offersForCourier(couriers[1]).filter(o=>o.taskId===first.id));
    const result=await Promise.allSettled([
      persistence().run(r=>r.engine.acceptOffer({offerId:offers[0].id,courierId:couriers[0]})),
      persistence().run(r=>r.engine.acceptOffer({offerId:offers2[0].id,courierId:couriers[1]})),
    ]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(result.find(r=>r.status==='rejected').reason.statusCode,409);
    assert.equal(await base.marketplaceNetworkAssignment.count({where:{taskId:first.id,status:'ACTIVE'}}),1);
    pass('aceptación concurrente: un ganador y un 409');
    let saved=await base.marketplaceNetworkTask.findUnique({where:{id:first.id}});
    const driver=saved.payload.currentAssignment.courierId;
    assert.equal(await persistence().run(r=>r.engine.taskFor(first.id).status),'ASSIGNED');
    for(let i=0;i<10;i++) await assert.rejects(persistence().run(r=>r.engine.confirmPickup({taskId:first.id,courierId:driver,pickupPin:'999999'})),e=>e.code==='INVALID_PIN');
    await assert.rejects(persistence().run(r=>r.engine.confirmPickup({taskId:first.id,courierId:driver,pickupPin:'123456'})),e=>e.code==='DELIVERY_PIN_LOCKED');
    saved=await base.marketplaceNetworkTask.findUnique({where:{id:first.id}});
    assert.equal(saved.payload.pinAttempts.pickup.failures,10);
    assert.equal((await base.order.findUnique({where:{id:first.orderId}})).status,'READY');
    pass('estado y bloqueo PIN sobreviven a recrear el servicio; no cambia READY');
    const child = await promisify(execFile)(process.execPath, [__filename, '--disposable', '--verify-restart', JSON.stringify({
      taskId:first.id, orderId:first.orderId, courierId:driver, timestamp:now().toISOString(), parentPid:process.pid,
    })], {cwd:ROOT, windowsHide:true, timeout:30000, maxBuffer:1024*1024});
    const restarted = JSON.parse(child.stdout.trim());
    assert.notEqual(restarted.pid, process.pid);
    assert.deepEqual({...restarted,pid:undefined}, {pid:undefined,status:'ASSIGNED',failures:10,locked:true});
    pass('un proceso Node nuevo recupera asignación y bloqueo PIN desde PostgreSQL');
    at=new Date(at.getTime()+15*60*1000);
    await persistence().run(r=>r.engine.confirmPickup({taskId:first.id,courierId:driver,pickupPin:'123456'}));
    assert.equal((await base.order.findUnique({where:{id:first.orderId}})).status,'ON_THE_WAY');
    await p.run(r=>{const c=r.store.couriers.get(driver);c.presence={lat:19.401,lng:-99.101,lastSeenAt:now(),acceptingShared:true};});
    saved=await base.marketplaceNetworkTask.findUnique({where:{id:first.id}});
    const scope={courierId:driver,assignmentId:saved.payload.currentAssignmentId,taskId:first.id,orderId:first.orderId,restaurantId:restaurant.id,locationId:location.id};
    assert.equal((await p.presenceStore.findForAssignment(scope)).lat,19.401);
    assert.equal(await p.presenceStore.findForAssignment({...scope,orderId:manual.orderId}),null);
    await assert.rejects(p.run(r=>r.engine.confirmDelivery({taskId:first.id,courierId:driver,deliveryPin:'123456'})),e=>e.code==='INVALID_PIN');
    await p.run(r=>r.engine.confirmDelivery({taskId:first.id,courierId:driver,deliveryPin:'654321'}));
    assert.equal((await base.order.findUnique({where:{id:first.orderId}})).status,'DELIVERED');
    assert.equal(await p.presenceStore.findForAssignment(scope),null);
    pass('recogida, presencia aislada y entrega; PINs separados');
    const second=await order('second');
    // La presencia expiró con el reloj: renovar antes de ofertar la siguiente tarea.
    await p.run(r=>{for(const c of r.store.couriers.values()) if(couriers.includes(c.id)) c.presence.lastSeenAt=now();});
    await p.run(r=>p.tick(r));
    const initial=await p.run(r=>r.engine.offersForCourier(couriers[0]));
    await p.run(r=>r.engine.acceptOffer({offerId:initial.find(o=>o.taskId===second.id).id,courierId:couriers[0]}));
    await ops.reassign(admin,second.id,{reason:'Prueba de reasignación'});
    const after=await p.run(r=>r.engine.offersForCourier(couriers[1]));
    const newOffer=after.find(o=>o.taskId===second.id); assert(newOffer);
    await p.run(r=>r.engine.acceptOffer({offerId:newOffer.id,courierId:couriers[1]}));
    await p.run(r=>r.engine.tick());
    assert.equal((await base.marketplaceNetworkOffer.findUnique({where:{id:newOffer.id}})).status,'ACCEPTED');
    const history=await base.marketplaceNetworkAssignment.findMany({where:{taskId:second.id}});
    assert.equal(history.filter(a=>a.status==='REASSIGNED').length,1);
    assert.equal(history.filter(a=>a.status==='ACTIVE').length,1);
    pass('Ops audita, conserva historial y no resucita ofertas antiguas');
    await base.order.update({where:{id:second.orderId},data:{status:'CANCELLED'}});
    await p.run(r=>r.engine.tick());
    assert.equal((await base.marketplaceNetworkTask.findUnique({where:{id:second.id}})).status,'CANCELLED');
    pass('cancelación del TPV invalida la tarea persistente');
    const missingLocation=await base.location.create({data:{restaurantId:restaurant.id,name:'Sin coordenadas',slug:tag+'_missing'}});
    const incomplete=await order('missing_coordinates','SHARED_ONLY','READY',missingLocation);
    const healthy=await order('healthy_coordinates');
    await p.run(r=>p.tick(r));
    const waiting=await base.marketplaceNetworkTask.findUnique({where:{id:incomplete.id}});
    assert.equal(waiting.status,'WAITING_READY');
    assert.equal(waiting.payload.offeringStartedAt,undefined);
    assert.equal(await base.marketplaceNetworkOffer.count({where:{taskId:incomplete.id}}),0);
    assert.equal((await base.marketplaceNetworkTask.findUnique({where:{id:healthy.id}})).status,'OFFERING');
    assert((await base.marketplaceNetworkOffer.count({where:{taskId:healthy.id,status:'OFFERED'}}))>0);
    await base.location.update({where:{id:missingLocation.id},data:{latitude:19.4,longitude:-99.1}});
    await persistence().run(r=>p.tick(r));
    const recovered=await base.marketplaceNetworkTask.findUnique({where:{id:incomplete.id}});
    assert.equal(recovered.status,'OFFERING');
    assert.equal(recovered.payload.pickupLat,19.4);
    assert.equal(recovered.payload.pickupLng,-99.1);
    assert((await base.marketplaceNetworkOffer.count({where:{taskId:incomplete.id,status:'OFFERED'}}))>0);
    pass('coordenadas ausentes no bloquean otras tareas y se recuperan al editar la sucursal');
    const externalOffers=await p.run(r=>r.engine.offersForCourier(couriers[0]));
    await p.run(r=>r.engine.acceptOffer({offerId:externalOffers.find(o=>o.taskId===healthy.id).id,courierId:couriers[0]}));
    await p.run(r=>r.engine.confirmPickup({taskId:healthy.id,courierId:couriers[0],pickupPin:'123456'}));
    const nextOrder=await order('after_tpv_delivery');
    await base.order.update({where:{id:healthy.orderId},data:{status:'DELIVERED'}});
    // El override también cierra una tarea que todavía tenía ofertas pendientes.
    await base.order.update({where:{id:incomplete.orderId},data:{status:'DELIVERED'}});
    await persistence().run(r=>p.tick(r));
    const externallyDelivered=await base.marketplaceNetworkTask.findUnique({where:{id:healthy.id}});
    assert.equal(externallyDelivered.status,'DELIVERED');
    assert.equal(externallyDelivered.payload.currentAssignment.status,'COMPLETED');
    assert.equal((await base.marketplaceNetworkAssignment.findUnique({where:{id:externallyDelivered.payload.currentAssignmentId}})).status,'COMPLETED');
    assert.equal(await base.marketplaceNetworkAssignment.count({where:{courierId:couriers[0],status:'ACTIVE'}}),0);
    assert.equal((await base.order.findUnique({where:{id:healthy.orderId}})).status,'DELIVERED');
    const mirrored=await base.marketplaceOrderPipeline.findUnique({where:{orderId:healthy.orderId}});
    assert.equal(mirrored.dispatch.task.status,'DELIVERED');
    assert.equal(mirrored.dispatch.assignment.status,'COMPLETED');
    assert.equal((await base.marketplaceNetworkTask.findUnique({where:{id:incomplete.id}})).status,'DELIVERED');
    assert.equal(await base.marketplaceNetworkOffer.count({where:{taskId:incomplete.id,status:'OFFERED'}}),0);
    const availableAgain=await persistence().run(r=>r.engine.offersForCourier(couriers[0]));
    assert(availableAgain.some(o=>o.taskId===nextOrder.id));
    pass('entrega desde TPV cierra tarea y asignación, expira ofertas y libera al repartidor');
    console.log(`PostgreSQL desechable: ${checks}/${checks} escenarios PASS`);
    return {tag,restaurantId:restaurant.id,locationId:location.id};
  } finally { await base.$disconnect(); }
}
if (require.main===module) {
  if (!process.argv.includes('--disposable')) { console.error('Requiere --disposable y el cluster temporal documentado.');process.exitCode=2; }
  else {
    const restartIndex = process.argv.indexOf('--verify-restart');
    const operation = restartIndex === -1 ? run : () => verifyRestart(JSON.parse(process.argv[restartIndex+1]));
    operation().catch(e=>{ console.error(e);process.exitCode=1; });
  }
}
module.exports={run};
