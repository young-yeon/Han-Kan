import fs from 'node:fs';
process.loadEnvFile('.env.local');
const url=new URL('https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03');
url.search=new URLSearchParams({serviceKey:decodeURIComponent(process.env.MFDS_API_KEY),pageNo:'1',numOfRows:'3',type:'json',FOOD_NM_KR:'양파'}).toString();
try{const response=await fetch(url,{signal:AbortSignal.timeout(20000)});const body=await response.text();console.log(JSON.stringify({status:response.status,body:body.slice(0,18000)}));}catch(e){console.log(JSON.stringify({error:e.cause?.code??e.name}));process.exitCode=1;}
