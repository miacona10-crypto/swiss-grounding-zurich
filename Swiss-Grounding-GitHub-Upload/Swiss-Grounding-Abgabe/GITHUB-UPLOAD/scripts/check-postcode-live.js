// Real MCP subprocess and current municipal preparation rule; no LLM or key.
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const report={version:'0.6.0 / V7.8',checkedAt:new Date().toISOString(),realMcp:true,liveSources:true,liveModel:false,rows:[]};
const client=new Client({name:'postcode-hotfix-check',version:'0.6.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/mcp.js',import.meta.url))],env:process.env}));
const cases=[
 ['Langstrasse → four short numbers → 8004',['ich bin an der Langstrasse in Zürich wann kann ich Karton entsorgen?','56','102','130','145','PLZ 8004'],'8004'],
 ['Langstrasse 102 → 8005',['Wann Karton an der Langstrasse 102 in Zürich?','PLZ 8005'],'8005'],
 ['Unique postcode, no house',['Wann Karton an der Apollostrasse?'],'8032'],
 ['No location → postcode',['Wann kann ich Karton entsorgen?','8004'],'8004'],
 ['General rule',['Wie bündele ich Karton?'],null],
 ['Proximity unchanged',['Wo kann ich nahe Seefeldstrasse 102 in Zürich Glas entsorgen?'],null]
];
try{
 assert.equal((await client.listTools()).tools.length,2);
 for(const [name,questions,postcode]of cases){const row={name,passed:false,turns:[]};report.rows.push(row);let contextToken;
  try{for(let i=0;i<questions.length;i++){
   const raw=await client.callTool({name:'get_zurich_guidance',arguments:{question:questions[i],...(contextToken?{contextToken}:{})}});assert.equal(raw.isError,undefined);
   const r=JSON.parse(raw.content[0].text);contextToken=r.contextToken;
   row.turns.push({question:questions[i],status:r.status,answer:r.answer,pending:r.pending_question,calendar:r.calendar,origin:r.origin?.address,sources:r.sourceLinks.map(s=>({title:s.title,url:s.url,retrievedAt:s.retrievedAt}))});
   if(i<questions.length-1){assert.equal(r.pending_question?.field,'postal_code');assert.doesNotMatch(r.answer,/nicht als bestehende Adresse/);}
   else{assert.equal(r.status,'ok');assert.ok(r.sourceLinks.length);if(postcode){assert.equal(r.calendar.postalCode,postcode);assert.equal(r.calendar.before,'07:00');assert.ok(r.calendar.dates.length);}else if(name==='Proximity unchanged'){assert.equal(r.origin.address,'Seefeldstrasse 102');assert.equal(r.results.length,3);}else assert.match(r.answer,/bündle Karton/);}
  }row.passed=true;}catch(error){row.error=error.message;}
  console.log(`${name}: ${row.passed?'PASS':'FAIL'}`);
 }
}finally{await client.close();}
await writeFile(new URL('../reports/postcode-live.json',import.meta.url),JSON.stringify(report,null,2));
if(report.rows.some(r=>!r.passed))process.exitCode=1;
