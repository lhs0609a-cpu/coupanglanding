import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
const jiti=createJiti(import.meta.url,{fsCache:false,tryNative:false,alias:{'@':path.resolve('src')}});
const {ROADMAP_STEPS,ROADMAP_FAQS}=await jiti.import(path.resolve('src/lib/data/start-roadmap.ts'));
const {getStepMockups}=await jiti.import(path.resolve('src/lib/data/start-mockups/index.ts'));
const STEP_MOCKUPS = Object.fromEntries(ROADMAP_STEPS.map(s => [s.id, getStepMockups(s.id, s.subSteps)]));
const urls=new Set(); const ids=new Set();
for(const step of ROADMAP_STEPS){
 assert(step.support?.prepare && step.support?.complete && step.support?.path,`${step.id}: preparation/completion/path`);
 urls.add(step.support.url);
 if(step.support.prerequisite)assert(ROADMAP_STEPS.some(s=>s.id===step.support.prerequisite));
 for(const mission of step.subSteps){
  assert(!ids.has(mission.id),`duplicate ${mission.id}`);ids.add(mission.id);
  assert(mission.description?.trim(),`${mission.id}: description`);
  assert(mission.link?.url,`${mission.id}: work link`);urls.add(mission.link.url);
  assert(STEP_MOCKUPS[step.id].some(s=>s.kind==='shot'?s.hotspots.some(h=>h.pin===mission.id):s.blocks.some(b=>b.pin===mission.id)),`${mission.id}: diagram`);
 }
 for(const a of step.actions)if(a.href)urls.add(a.href);
}
const links=[];
for(const url of urls){
 assert(url.startsWith('/')||url.startsWith('https://'),`invalid URL: ${url}`);
 if(url.startsWith('/')){
  const pathname=url.split('?')[0];
  let found=existsSync(path.join('src/app',pathname,'page.tsx'));
  if(!found && pathname.startsWith('/guide/'))found=existsSync('src/app/guide/[slug]/page.tsx')&&readFileSync('src/lib/data/guide-articles.ts','utf8').includes(pathname.split('/').at(-1));
  if(pathname.startsWith('/my/guides/')){
   const { getArticleById, getCategoryById } = await jiti.import(path.resolve('src/lib/data/guides.ts'));
   const [, , , category, article] = pathname.split('/');
   found=existsSync('src/app/my/guides/[categoryId]/[articleId]/page.tsx') && !!getCategoryById(category) && getArticleById(article)?.categoryId === category;
  }
  assert(found,`missing route: ${url}`);
  links.push({url,check:'route-exists',access:url.startsWith('/my/')||url.startsWith('/megaload')?'login/permission required':'public'});
 }else{
  if(process.argv.includes('--network')){
   try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)}); links.push({url,status:r.status,finalUrl:r.url,check:r.ok?'reachable':r.status===403||r.status===401?'access-restricted':'needs-review'});}
   catch(e){links.push({url,check:'network-unverified',reason:e.message});}
  }else links.push({url,check:'external-not-fetched'});
 }
}
assert(!JSON.stringify(ROADMAP_FAQS).includes('2002다42322'));
const report={checkedAt:new Date().toISOString(),stages:ROADMAP_STEPS.length,missions:ids.size,links,limitations:'Live authenticated registration, payments, refunds and CS submissions are not performed by this audit.'};
mkdirSync('artifacts/start-guide/review',{recursive:true});writeFileSync('artifacts/start-guide/review/audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

