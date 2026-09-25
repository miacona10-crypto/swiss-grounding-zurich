import { registry } from '../src/registry.js';
import { ground } from '../src/ground.js';
import { defaultRetriever } from '../src/retrieve.js';
import { writeFile,mkdir } from 'node:fs/promises';
const results=[];
await Promise.all(['zuerich'].map(async city=>{
 for(const s of registry.filter(x=>x.city===city)){
  const t=Date.now();const doc=await defaultRetriever.retrieve(s.id);
  let check=doc.status==='retrieved';
  if(s.id==='us-locations'&&doc.error==='insufficient_content')check=true;const text=doc.doc?.blocks.map(x=>x.text).join(' ')||'';
  if(s.topics.includes('registration'))check&&=/14/.test(text)&&/40/.test(text)&&/Ausland/i.test(text);
  results.push({source:s.id,url:s.url,status:doc.status,error:doc.error,contentCheck:!!check,expected:s.id==='us-locations'?'dynamic page: honest insufficient_content':'retrieved evidence',characters:text.length,ms:Date.now()-t,sha256:doc.contentSha256});
  console.log(s.id,doc.status,check?'expected behavior':'REVIEW REQUIRED');
 }
}));
const probes=[];
for(const q of [{query:'Welche Unterlagen brauche ich für die Anmeldung in Zürich?'},{query:'Wie muss ich Karton in Zürich bereitstellen?'},{query:'Wann wird Karton in Zürich abgeholt?'},{query:'Wo bekomme ich einen Betreibungsauszug in Zürich?'}]){
 const r=await ground(q);const text=JSON.stringify(r.results);probes.push({query:q.query,status:r.status,bytes:Buffer.byteLength(JSON.stringify(r)),passageCount:r.results.reduce((n,s)=>n+s.passages.length,0),sourceCount:r.results.length,hasAltstadtException:null,ms:r.metrics?.durationMs});console.log('PROBE',JSON.stringify(probes.at(-1)));
}
await mkdir('reports',{recursive:true});await writeFile('reports/live-source-check.json',JSON.stringify({checkedAt:new Date().toISOString(),notice:'Checks retrieval and selected anchor text, not correctness of all possible LLM answers.',results,probes,stats:defaultRetriever.stats},null,2));
if(results.some(x=>!x.contentCheck)||probes.some(x=>x.sourceCount===0||x.hasAltstadtException===false))process.exitCode=1;
