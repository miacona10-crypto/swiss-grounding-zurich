import robotsParser from 'robots-parser';
import { createHash } from 'node:crypto';
import { extract } from './extract.js';
import { registry, sourcePolicy } from './registry.js';
const AGENT='SwissGroundingPrototype';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function createRetriever({fetchFn=fetch,now=()=>Date.now(),respectRobots=process.env.RESPECT_ROBOTS!=='false',respectTerms=process.env.RESPECT_TERMS!=='false',useMode=process.env.USE_MODE||'private',ttlMs=300000,timeoutMs=12000}={}) {
 const cache=new Map(),robots=new Map(),pending=new Map(),queues=new Map(),last=new Map();
 const stats={requests:0,cacheHits:0,failures:0};
 async function raw(url) {
  stats.requests++;
  const r=await fetchFn(url,{redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{'User-Agent':AGENT+'/0.2 (+local evidence reader)','Accept':'text/html,text/plain;q=0.9'}});
  const declared=Number(r.headers.get('content-length')||0);if(declared>1500000)throw new Error('source_too_large');
  const chunks=[];let size=0;
  for await(const part of r.body||[]){size+=part.length;if(size>1500000)throw new Error('source_too_large');chunks.push(part);}
  return {status:r.status,headers:r.headers,text:Buffer.concat(chunks).toString('utf8')};
 }
 async function policy(url) {
  const origin=new URL(url).origin,p=sourcePolicy[origin];
  if(!p)throw new Error('untrusted_origin');
  if(respectTerms&&(useMode!=='private'||p.mode!=='local_reference'||now()-Date.parse(p.reviewedOn)>90*86400000))throw new Error('terms_review_required');
  if(!respectRobots)return 1000;
  let entry=robots.get(origin);
  if(!entry||now()-entry.at>3600000){
   const r=await raw(origin+'/robots.txt');
   if(r.status!==200&&r.status!==404)throw new Error('robots_unavailable');
   entry={at:now(),parser:robotsParser(origin+'/robots.txt',r.status===404?'':r.text)};robots.set(origin,entry);
  }
  if(entry.parser.isAllowed(url,AGENT)===false)throw new Error('robots_disallowed');
  const delay=entry.parser.getCrawlDelay(AGENT)||1;
  if(delay>30)throw new Error('crawl_delay_exceeds_budget');
  return Math.max(1000,delay*1000);
 }
 async function retrieve(sourceId) {
  const source=registry.find(s=>s.id===sourceId);if(!source)return {status:'unavailable',error:'unknown_source'};
  const existing=cache.get(sourceId);
  if(existing&&now()-existing.at<ttlMs){stats.cacheHits++;return {...existing.value,cache:'hit'};}
  if(pending.has(sourceId))return pending.get(sourceId);
  const origin=new URL(source.url).origin;
  const work=(queues.get(origin)||Promise.resolve()).catch(()=>{}).then(async()=>{
   try{
    let url=source.url;let response;
    for(let hop=0;hop<4;hop++){
     if(new URL(url).origin!==origin)throw new Error('cross_origin_redirect');
     const delay=await policy(url);await sleep(Math.max(0,(last.get(origin)||0)+delay-now()));
     last.set(origin,now());response=await raw(url);
     if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');if(!location)throw new Error('invalid_redirect');url=new URL(location,url).href;continue;
     }break;
    }
    if(response.status!==200)throw new Error('http_'+response.status);
    if(!/text\/html/i.test(response.headers.get('content-type')||''))throw new Error('unsupported_content_type');
    const doc=extract(response.text,url);
    if(doc.blocks.map(b=>b.text).join('').length<100)throw new Error('insufficient_content');
    const value={status:'retrieved',sourceId,url,title:doc.title||source.title,authority:source.authority,municipality:source.city,language:source.language,retrievedAt:new Date(now()).toISOString(),httpLastModified:response.headers.get('last-modified'),contentSha256:createHash('sha256').update(response.text).digest('hex'),doc,cache:'miss'};
    cache.set(sourceId,{at:now(),value});return value;
   }catch(e){stats.failures++;return {status:'unavailable',sourceId,url:source.url,error:classify(e),staleCacheAvailable:!!existing};}
  });
  queues.set(origin,work);pending.set(sourceId,work);
  try{return await work;}finally{pending.delete(sourceId);}
 }
 return {retrieve,stats};
}
function classify(e){const msg=String(e.message);return /^(source_too_large|terms_review_required|robots_unavailable|robots_disallowed|crawl_delay_exceeds_budget|cross_origin_redirect|invalid_redirect|http_\d+|unsupported_content_type|insufficient_content|untrusted_origin)$/.test(msg)?msg:/timeout|abort/i.test(msg)?'timeout':'network_error';}
export const defaultRetriever=createRetriever();
