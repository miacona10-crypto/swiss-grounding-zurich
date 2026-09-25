// Actual MCP + current municipal sources; no LLM and no credential.
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
const cases=[
 ['Sperrgut-Coupons','Wo kaufe ich Sperrgut-Marken in Zürich?','coupons_ended'],
 ['Recyclinghöfe','Welche Öffnungszeiten haben die Recyclinghöfe in Zürich?','yard_Werdhölzli'],
 ['Elektrogeräte','Wo entsorge ich einen Fernseher in Zürich?','electronics_free'],
 ['Züri-Sack','Wo kaufe ich Züri-Säcke in Zürich?','sack_price'],
 ['Papier','Wie entsorge ich Papier in Zürich?','paper_prepare'],
 ['Bioabfall','Wie entsorge ich Bioabfall in Zürich?','bio_bin'],
 ['Kunststoff','Wo gebe ich Kunststoff in Zürich ab?','plastic_return'],
 ['PET','Wo gebe ich PET in Zürich ab?','pet_free'],
 ['Sonderabfall','Wo entsorge ich Sonderabfall in Zürich?','hazard_location'],
 ['Kalender','Wie finde ich meinen persönlichen Entsorgungskalender in Zürich?','personal_calendar'],
 ['Konstanz','Rundfunkbeitrag nach Umzug nach Konstanz?',null,'out_of_scope'],
 ['Sprache',"Comment puis-je m'inscrire à Zurich?",null,'invalid']
];
const client=new Client({name:'extended-release-check',version:'0.6.0'});
const report={checkedAt:new Date().toISOString(),version:'0.6.0 / V7.8',realMcp:true,liveSources:true,liveModel:false,rows:[]};
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/mcp.js',import.meta.url))],env:process.env}));
try{
 for(const [name,question,claim,status] of cases){
  try{const result=await client.callTool({name:'get_zurich_guidance',arguments:{question}});const r=JSON.parse(result.content[0].text);const passed=!result.isError&&(status?r.status===status:['ok','partial'].includes(r.status)&&r.claims?.some(c=>c.id===claim)&&!r.missingRules?.length);
   report.rows.push({name,question,status:r.status,passed,claimIds:r.claims?.map(c=>c.id)||[],missingRules:r.missingRules||[],sources:r.sourceLinks?.map(s=>({title:s.title,url:s.url,retrievedAt:s.retrievedAt}))||[]});console.log(name+': '+(passed?'PASS':'FAIL'));
  }catch(e){report.rows.push({name,passed:false,error:e.message});console.log(name+': ERROR');}
 }
}finally{await client.close();}
await writeFile(new URL('../reports/extended-live.json',import.meta.url),JSON.stringify(report,null,2));
if(report.rows.some(r=>!r.passed))process.exitCode=1;
