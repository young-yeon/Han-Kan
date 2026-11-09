import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';

const sql=new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(new URL('../drizzle/0000_red_metal_master.sql',import.meta.url),'utf8'));
function statement(query,args=[]){return {
  bind(...values){return statement(query,values);},
  async first(){return sql.prepare(query).get(...args)??null;},
  async all(){return {results:sql.prepare(query).all(...args)};},
  async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},
};}
globalThis.chefTestEnv={DB:{prepare:statement,async batch(items){sql.exec('BEGIN');try{const out=[];for(const s of items)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
function compile(file){return ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;}
const asModule=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const domain=asModule(compile('../lib/domain.ts'));
const source=compile('../lib/store.ts').replace('import { env } from "cloudflare:workers";','const env=globalThis.chefTestEnv;').replace('from "./domain"',`from ${JSON.stringify(domain)}`);
const store=await import(asModule(source));

test('two users cannot read each other’s state or jobs; request ids are scoped by user',async()=>{
  const a=await store.mutate('user-a','same-id',s=>{s.profile.likes=['양파'];});
  const b=await store.mutate('user-b','same-id',s=>{s.profile.likes=['토마토'];});
  assert.deepEqual(a.state.profile.likes,['양파']);
  assert.deepEqual(b.state.profile.likes,['토마토']);
  const job=await store.createJob('user-a','private-job','recommend',{minutes:30});
  assert.equal(job.user_id,'user-a');
  assert.equal(await store.getJob('user-b','private-job'),null);
  assert.equal((await store.recentJobs('user-b')).length,0);
  await assert.rejects(()=>store.mutate('user-a','stale',()=>{},0),/다른 변경/);
});

test('durable receipts prevent a retry after its in-state id was evicted',async()=>{
  await store.mutate('retry-user','original',s=>{s.profile.servings=2;});
  await store.mutate('retry-user','trim-fixture',s=>{s.requests=Array.from({length:200},(_,i)=>`filler-${i}`);});
  const before=await store.readState('retry-user');
  assert.equal(before.state.requests.includes('original'),false);
  const after=await store.mutate('retry-user','original',s=>{s.profile.servings=8;});
  assert.equal(after.version,before.version);
  assert.equal(after.state.profile.servings,2);
});
