import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
const headers={Cookie:cookie,'Content-Type':'application/json',Origin:base};
async function post(body){const r=await fetch(base+'/api/chef',{method:'POST',headers,body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,200,d.error);return d;}
let result=await post({action:'recommend',requestId:crypto.randomUUID(),servings:1,minutes:30});
for(let step=0;step<10&&!['완료','실패'].includes(result.job.phase);step++){console.log('stage: '+result.job.phase);result=await post({action:'advance',jobId:result.job.id,requestId:crypto.randomUUID()});}
assert.equal(result.job.phase,'완료',result.job.error);assert.ok(result.job.recipes.length>0,result.job.summary);console.log(JSON.stringify({recipes:result.job.recipes.map(r=>({name:r.name,time:r.totalMinutes,difficulty:r.difficulty,nutrition:r.nutrition,missing:r.missing})),agents:result.job.agents}));
const record=await (await fetch(base+'/api/chef',{headers})).json();const recipe=record.state.recommendations[0];
const shop=await post({action:'shopping',requestId:crypto.randomUUID(),version:record.version,recipeId:recipe.id});assert.ok(Array.isArray(shop.state.shopping));
const onion=shop.state.inventory.find(x=>x.name==='양파'&&x.unit==='g');const id=crypto.randomUUID();const body={action:'cook',requestId:id,version:shop.version,recipeId:recipe.id,used:onion?[{lotId:onion.id,quantity:50}]:[],evaluation:{rating:2,taste:'싱거웠어요',portion:'적당해요',difficulty:'예상과 비슷해요',actualMinutes:22,again:false,note:'로컬 통합 검증용 평가'}};
const meal=await post(body);const retry=await post(body);assert.equal(meal.version,retry.version);assert.equal(retry.state.meals.filter(x=>x.id===id).length,1);if(onion)assert.equal(retry.state.inventory.find(x=>x.id===onion.id).quantity,onion.quantity-50);console.log('PASS: live recipe agents, shopping, feedback, once-only deduction');
