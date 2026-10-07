'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecipeCosting } = require('../src/services/recipe-costing.service');
const ingredients = [
  { id:'food', cost:0.1, baseUnit:'GRAM' },
  { id:'box', cost:0.85408, baseUnit:'PIECE', isPackaging:true },
  { id:'tray', cost:1.6538, baseUnit:'PIECE', isPackaging:true },
  { id:'bag', cost:0.5, baseUnit:'PIECE', isPackaging:true },
  { id:'paper', cost:0.04, baseUnit:'PIECE', isPackaging:true },
];
const recipe = {items:[
 {ingredientId:'food',quantity:100,unit:'GRAM'},
 {ingredientId:'box',quantity:1,unit:'PIECE'},
 {ingredientId:'paper',quantity:1,unit:'PIECE'},
]};
test('nested preparations account for yield and repeated branches',()=>{
 const subs=[
 {id:'mix',yieldQty:100,yieldUnit:'GRAM',items:[{ingredientId:'food',qty:100,unit:'GRAM'}]},
 {id:'outer',yieldQty:100,yieldUnit:'GRAM',marginErrorPct:20,items:[
 {nestedSubRecipeId:'mix',qty:50,unit:'GRAM'},{nestedSubRecipeId:'mix',qty:50,unit:'GRAM'}]},
 ];
 const c=createRecipeCosting(ingredients,subs);
 assert.equal(c.recipe({items:[{subRecipeId:'outer',quantity:100,unit:'GRAM'}]}).totalCost,12.5);
});
test('two volcanes: replaces two boxes with one tray, keeps both wrappers',()=>{
 const c=createRecipeCosting(ingredients,[]);
 const r=c.packagingPreview([{recipe,quantity:2}], [{ingredientId:'box',quantity:0},{ingredientId:'tray',quantity:1}]);
 assert.equal(r.totalCost,21.7338);
 assert.equal(r.consumption.find(i=>i.ingredientId==='paper').quantity,2);
});
test('one bag for a multi-item order; no bag by default',()=>{
 const c=createRecipeCosting(ingredients,[]);
 const lines=[{recipe,quantity:3}];
 assert.equal(c.packagingPreview(lines,[{ingredientId:'bag',quantity:1}]).packagingAdjustment,0.5);
 assert.equal(c.packagingPreview(lines,[]).packagingAdjustment,0);
});
test('papas replacement, not addition of both containers',()=>{
 const c=createRecipeCosting(ingredients,[]);
 assert.equal(c.packagingPreview([{recipe,quantity:1}],[
 {ingredientId:'box',quantity:0},{ingredientId:'tray',quantity:1}
 ]).totalCost,11.6938);
});
test('reject foreign ingredients, food overrides, duplicates and fractional counts',()=>{
 const c=createRecipeCosting(ingredients,[]);
 for (const p of [
 [{ingredientId:'foreign',quantity:1}],
 [{ingredientId:'food',quantity:0}],
 [{ingredientId:'bag',quantity:0.5}],
 [{ingredientId:'bag',quantity:1},{ingredientId:'bag',quantity:2}],
 ]) assert.throws(()=>c.packagingPreview([{recipe,quantity:1}],p));
});
test('cycles and missing prices cannot appear complete',()=>{
 const c=createRecipeCosting([{id:'zero',cost:0,baseUnit:'GRAM'}],[
 {id:'loop',yieldQty:1,yieldUnit:'GRAM',items:[{nestedSubRecipeId:'loop',qty:1,unit:'GRAM'}]},
 ]);
 assert.ok(c.recipe({items:[{subRecipeId:'loop',quantity:1,unit:'GRAM'}]}).costWarnings.includes('SUBRECIPE_CYCLE_OR_DEPTH'));
 assert.ok(c.recipe({items:[{ingredientId:'zero',quantity:1,unit:'GRAM'}]}).costWarnings.includes('MISSING_PRICE'));
});
test('tenant-scoped catalogs loaded explicitly',async()=>{
 const {loadRecipeCosting}=require('../src/services/recipe-costing.service');
 const calls=[];
 await loadRecipeCosting({ingredient:{findMany:async a=>{calls.push(a.where);return []}},
 subRecipe:{findMany:async a=>{calls.push(a.where);return []}}},'tenant-a');
 assert.deepEqual(calls,[{restaurantId:'tenant-a'},{restaurantId:'tenant-a'}]);
});
