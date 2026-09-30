/** Execute the real route with mocked auth/database/channel boundaries; never send a real reply. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('src/app/api/megaload/cs/answer/route.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function run({owned=true,id='remote-1',success=true,throws=false,saveError=false,status='pending'}={}){
 let sends=0,updates=0;const filters=[];
 const supabase={auth:{getUser:async()=>({data:{user:{id:'user-1'}}})},from(table){let mutation=false;const q={select(){return q},eq(k,v){filters.push([table,k,v]);return q},update(){updates++;mutation=true;return q},single:async()=>({data:table==='megaload_users'?{id:'member-1'}:owned?{id:'inquiry-1',channel:'coupang',channel_inquiry_id:id,status}:null}),then(resolve){return Promise.resolve({error:mutation&&saveError?new Error('save failed'):null}).then(resolve)}};return q;}};
 const exports={};const context={exports,console,Date,require(name){if(name==='next/server')return{NextResponse:{json:(body,init)=>({body,status:init?.status||200})}};if(name.includes('supabase/server'))return{createClient:async()=>supabase};if(name.includes('adapters/factory'))return{getAuthenticatedAdapter:async()=>({answerInquiry:async(remote,answer)=>{sends++;assert.equal(remote,'remote-1');assert.equal(answer,'reply');if(throws)throw Error('channel unavailable');return{success}}})};if(name.includes('system-log'))return{logSystemError:async()=>{}};throw Error(name)}};
 vm.runInNewContext(js,context);
 const result=await exports.POST({json:async()=>({inquiryId:'inquiry-1',channel:'forged',channelInquiryId:'other-owner',answer:' reply '})});
 assert(filters.some(([,k,v])=>k==='megaload_user_id'&&v==='member-1'));
 return{...result,sends,updates};
}
for(const options of [{success:false},{throws:true}]){const r=await run(options);assert.equal(r.status,502);assert.equal(r.updates,0);assert.equal(r.body.channelSent,false);}
for(const options of [{owned:false},{id:null},{status:'replied'}]){const r=await run(options);assert(r.status>=400);assert.equal(r.sends,0);assert.equal(r.updates,0);}
const good=await run();assert.equal(good.status,200);assert.equal(good.updates,1);assert.equal(good.body.channelSent,true);
const partial=await run({saveError:true});assert.equal(partial.status,500);assert.equal(partial.body.channelSent,true);
console.log('PASS: owner isolation, stored channel ID, missing ID, already replied, channel failure/exception, success, and remote-success/local-failure.');
