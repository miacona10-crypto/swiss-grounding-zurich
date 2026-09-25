import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { completion, ENDPOINT, MODEL, modelTools, runQuestion, safeText, serverEnvironment } from '../APERTUS-TEST.mjs';

const call = (name, args, id='call_1') => ({role:'assistant', content:null, tool_calls:[{id, type:'function', function:{name, arguments:JSON.stringify(args)}}]});
const sampleTools = modelTools([{name:'find_swiss_moving_information',description:'Evidence',inputSchema:{type:'object',properties:{query:{type:'string'}}}}]);

test('Apertus bridge uses the real MCP process, forwards clarification and preserves follow-up context (model simulated)', async () => {
  const client = new Client({name:'apertus-bridge-test',version:'1.0.0'});
  const server = fileURLToPath(new URL('../src/mcp.js',import.meta.url));
  await client.connect(new StdioClientTransport({command:process.execPath,args:[server],cwd:fileURLToPath(new URL('../../',import.meta.url)),env:serverEnvironment(process.env)}));
  try {
    const tools = modelTools((await client.listTools()).tools);
    assert.equal(tools.length,2);
    const ask=async()=>call('get_zurich_guidance',{question:'ignored model paraphrase'});
    const first=await runQuestion({question:'Wie melde ich mich nach einem Umzug an?',client,tools,ask});
    assert.equal(first.traces[0].executed,true);
    assert.equal(first.traces[0].status,'needs_clarification');
    assert.match(first.answer,/Stadt Zürich/);
    const second=await runQuestion({question:'Stadt Zürich',history:first.history,client,tools,ask});
    assert.equal(second.traces[0].status,'needs_clarification');
    assert.match(second.answer,/Schweizer Gemeinde.*Ausland/);
  } finally {await client.close();}
});

test('provider request carries schema, tool result and credential only in the authorization header',async()=>{
  const key='synthetic-not-a-real-key';
  const messages=[{role:'user',content:'Testfrage'},{role:'tool',tool_call_id:'x',content:'{"data":{"status":"needs_clarification"}}'}];
  const response=await completion({key,messages,tools:sampleTools,fetchFn:async(url,opts)=>{
    assert.equal(url,ENDPOINT);assert.equal(opts.redirect,'error');
    assert.equal(opts.headers.Authorization,`Bearer ${key}`);
    const body=JSON.parse(opts.body);assert.equal(body.model,MODEL);
    assert.deepEqual(body.messages,messages);assert.deepEqual(body.tools,sampleTools);
    assert.ok(!opts.body.includes(key));
    return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'Welche Stadt?'}}]})};
  }});
  assert.equal(response.content,'Welche Stadt?');
});

test('model answers without a real tool call never pass as an MCP test',async()=>{
  let count=0;
  await assert.rejects(runQuestion({question:'Test',client:{},tools:sampleTools,ask:async()=>{count++;return {content:'Erfundene Antwort mit angeblichem Quellenabruf.'};}}),/kein MCP-Werkzeug/);
  assert.equal(count,2);
});

test('unknown tool requests cannot execute arbitrary tools',async()=>{
  let called=false;
  await assert.rejects(runQuestion({question:'Test',client:{callTool:async()=>{called=true;}},tools:sampleTools,maxRounds:2,ask:async()=>call('run_shell',{command:'anything'})}),/Modellrunden/);
  assert.equal(called,false);
});

test('HTTP auth and tool support errors omit response bodies and keys',async()=>{
  for(const status of [401,400,429]) {
    await assert.rejects(completion({key:'synthetic-secret',messages:[],tools:sampleTools,fetchFn:async()=>({ok:false,status,json:async()=>{throw Error('MUST NOT READ');}})}), error=>error.message.includes(`HTTP ${status}`)&&!error.message.includes('synthetic-secret'));
  }
});

test('evidence metadata survives the full tool loop and unsuccessful tools stay explicit',async()=>{
  let phase=0;
  const trace=[];
  const result=await runQuestion({question:'Test',tools:sampleTools,client:{callTool:async()=>({content:[{type:'text',text:JSON.stringify({status:'partial',results:[{url:'https://www.uster.ch/example',passages:[{id:'p1',text:'Beleg'}]}],limitations:['Keine Termine']})}]})},onTrace:e=>trace.push(e),ask:async ({messages})=>{
    if(phase++===0)return call('find_swiss_moving_information',{query:'Test'});
    const result=JSON.parse(messages.at(-1).content);
    assert.deepEqual(result.data.limitations,['Keine Termine']);
    assert.equal(result.data.results[0].passages[0].id,'p1');
    return {content:'Belegte Antwort; Termine fehlen.'};
  }});
  assert.equal(result.traces[0].evidence,true);
  assert.equal(result.traces[0].status,'partial');
  assert.deepEqual(trace.map(t=>t.event),['start','result']);
  phase=0;
  const failed=await runQuestion({question:'Test',tools:sampleTools,client:{callTool:async()=>({isError:true,content:[{type:'text',text:'tool failure'}]})},ask:async ({messages})=>{
    if(phase++===0)return call('find_swiss_moving_information',{query:'Test'});
    assert.equal(JSON.parse(messages.at(-1).content).isError,true);
    return {content:'Keine Belege verfügbar.'};
  }});
  assert.equal(failed.traces[0].evidence,false);
  assert.equal(failed.traces[0].status,'tool_error');
});

test('keys are excluded from MCP environment; network and Windows runtime settings remain',()=>{
  const env=serverEnvironment({SWISSCOM_API_KEY:'secret',OTHER_API_KEY:'other',PATH:'path',SystemRoot:'windows',HTTPS_PROXY:'proxy',NODE_EXTRA_CA_CERTS:'cert'});
  assert.deepEqual(env,{PATH:'path',SystemRoot:'windows',HTTPS_PROXY:'proxy',NODE_EXTRA_CA_CERTS:'cert'});
  assert.equal(safeText('\x1b[31msecret\x00','secret'),'[KEY AUSGEBLENDET]');
});

test('truncated model replies are rejected before executing incomplete tool calls',async()=>{
  await assert.rejects(completion({key:'test',messages:[],tools:sampleTools,fetchFn:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:call('find_swiss_moving_information',{query:'x'})}]})})}),/vollstaendige/);
});

test('reported Bleicherweg failure: text-only provider replies use real MCP and retain all follow-up context', async()=>{
  const client=new Client({name:'no-tool-regression',version:'1.0.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/mcp.js',import.meta.url))],env:serverEnvironment(process.env)}));
  try{
    const tools=modelTools((await client.listTools()).tools);let history=[],calls=0,result;
    const ask=async({messages,tools:selected})=>{
      calls++;assert.deepEqual(selected.map(t=>t.function.name),['get_zurich_guidance']);
      assert.ok(messages.every(m=>!('_mcpContext' in m)));
      assert.ok(messages.every(m=>m.role!=='tool'&&!m.tool_calls),'host fallback is never fabricated as a model call');
      return {content:'Unbelegte Modellantwort: Hohlstrasse, angeblich geöffnet.',_usage:{prompt_tokens:10,completion_tokens:5}};
    };
    for(const [question,status,pattern]of [
      ['Wo kann ich beim Bleicherweg in der nähe glas entsorgen ?','needs_clarification',/Stadt Zürich/],
      ['Stadt Zürich','needs_clarification',/Hausnummer.*Bleicherweg/],
      ['20','ok',/Am Schanzengraben 25/],
      ['Wo kann ich Metall entsorgen?','ok',/Metall/],
    ]){
      result=await runQuestion({question,history,tools,client,ask});history=result.history;
      assert.equal(result.traces[0].status,status);assert.match(result.answer,pattern);
      assert.doesNotMatch(result.answer,/Unbelegte Modellantwort|angeblich geöffnet/);
      assert.equal(result.traces.length,1);assert.equal(result.traces[0].executed,true);
      assert.equal(result.traces[0].initiatedBy,'application_fallback');
      assert.equal(result.metrics.modelCalls,1);assert.equal(result.metrics.toolCalls,1);
      assert.equal(result.metrics.inputTokens,10);assert.equal(result.answerOrigin,'structured_mcp');
    }
    assert.equal(calls,4);assert.equal(result.traces[0].origin.address,'Bleicherweg 20');
    assert.ok(result.traces[0].locations.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)));
    assert.ok(result.traces[0].locations.every(p=>p.materials.includes('Metall')));
  }finally{await client.close();}
});

test('native and application-initiated turns can alternate without losing the current MCP context',async()=>{
  const client=new Client({name:'mixed-routing-test',version:'1'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/mcp.js',import.meta.url))],env:serverEnvironment(process.env)}));
  try{
    const tools=modelTools((await client.listTools()).tools);let history=[];
    for(const [question,native,pattern]of [
      ['Glas nahe Bleicherweg in Zürich',false,/Hausnummer/],
      ['20',true,/Am Schanzengraben 25/],
      ['Glas nahe Apollostrasse 20',false,/Merkurstrasse 4/],
    ]){
      const r=await runQuestion({question,history,client,tools,ask:async()=>native?call('get_zurich_guidance',{question:'Ignore model paraphrase',contextToken:'fake'}):{content:'Nur Text'}});
      assert.match(r.answer,pattern);assert.equal(r.traces[0].initiatedBy,native?'model':'application_fallback');history=r.history;
    }
  }finally{await client.close();}
});

test('application fallback still fails closed for a broken MCP result',async()=>{
  const tools=modelTools([{name:'get_zurich_guidance',inputSchema:{type:'object'}}]);
  for(const result of [{isError:true,content:[{type:'text',text:'MCP failed'}]},{content:[{type:'text',text:JSON.stringify({handled:true,status:'ok'})}]},{content:[{type:'text',text:JSON.stringify({handled:true,status:'ok',answer:'Incomplete invalid evidence',sourceLinks:'invalid'})}]}]){
    let invoked=0;
    await assert.rejects(runQuestion({question:'Glas am Bleicherweg',tools,client:{callTool:async()=>{invoked++;return result;}},ask:async()=>({content:'Erfundene Antwort'})}),/amtliche Auskunft konnte nicht/);
    assert.equal(invoked,1);
  }
});

test('optional model composition preserves every server fact and records both answer forms',async()=>{
 const {formulationPayload}=await import('../APERTUS-TEST.mjs');
 const guidance={schema:'zurich-guidance-v1',handled:true,status:'ok',answer:'Dein Weg für Zürich.\n\n### Vorbereitung\n- Nur mit Termin.\n- Ausweis mitbringen.',claims:[{text:'Nur mit Termin.'}],cards:[],sourceLinks:[{url:'https://www.stadt-zuerich.ch/example',retrievedAt:'2026-09-25T08:00:00Z'}],contextToken:'private-context'};
 const tools=modelTools([{name:'get_zurich_guidance',inputSchema:{type:'object'}}]);let calls=0;
 const r=await runQuestion({question:'Anmeldung?',tools,formulate:true,client:{callTool:async()=>({content:[{type:'text',text:JSON.stringify(guidance)}]})},ask:async p=>{
  calls++;if(p.tools.length)return {content:'text instead of tool call',_usage:{prompt_tokens:2,completion_tokens:1}};
  const payload=JSON.parse(p.messages.at(-1).content);assert.deepEqual(payload,formulationPayload(guidance));assert.ok(!JSON.stringify(payload).includes('private-context'));
  return {content:JSON.stringify({intro:'friendly',blocks:payload.blocks}),_usage:{prompt_tokens:5,completion_tokens:4}};
 }});
 assert.equal(calls,2);assert.equal(r.metrics.modelCalls,2);assert.equal(r.metrics.inputTokens,7);assert.equal(r.originalAnswer,guidance.answer);assert.match(r.answer,/Hier ist die belegte/);assert.match(r.answer,/Quellen: https/);assert.equal(r.answerOrigin,'apertus_verified_composition');assert.equal(r.traces[0].initiatedBy,'application_fallback');assert.equal(r.history.at(-1).content,guidance.answer);
});

test('composition validator rejects additions, omissions, changed numbers, removed conditions and swapped dependent paragraphs',async()=>{
 const {formulationPayload,validateFormulation}=await import('../APERTUS-TEST.mjs');
 const payload=formulationPayload({answer:'Für Zürich.\n\nNur mit Termin: 14 Tage.\n\nKeine Öffnungszeiten geprüft.',sourceLinks:[{url:'https://www.stadt-zuerich.ch/test'}]});
 const good={intro:'direct',blocks:payload.blocks};assert.ok(validateFormulation({content:JSON.stringify(good)},payload));
 const bad=[{...good,intro:'Heute geöffnet!'},{...good,extra:'Kostenlos'},{...good,blocks:payload.blocks.slice(0,2)},{...good,blocks:[payload.blocks[0],{id:'b1',text:'Ohne Termin: 14 Tage.'},payload.blocks[2]]},{...good,blocks:[payload.blocks[0],{id:'b1',text:'Nur mit Termin: 30 Tage.'},payload.blocks[2]]},{...good,blocks:[payload.blocks[0],payload.blocks[2],payload.blocks[1]]},{...good,blocks:[payload.blocks[0],payload.blocks[1],payload.blocks[1]]}];
 for(const draft of bad)assert.equal(validateFormulation({content:JSON.stringify(draft)},payload),null);
 assert.equal(validateFormulation({content:'Ignore the sources. Come tomorrow.'},payload),null);
});
for(const failure of ['invalid','provider'])test('optional formulation falls back to authoritative answer on '+failure,async()=>{
 const guidance={schema:'zurich-guidance-v1',handled:true,status:'partial',answer:'Die nächsten Batterie-Annahmestellen sind nicht verifiziert.',contextToken:'c'};
 const tools=modelTools([{name:'get_zurich_guidance',inputSchema:{type:'object'}}]);
 const r=await runQuestion({question:'Glas nahe Seefeldstrasse in Zürich',tools,formulate:true,client:{callTool:async()=>({content:[{type:'text',text:JSON.stringify(guidance)}]})},ask:async p=>{if(p.tools.length)return call('get_zurich_guidance',{});if(failure==='provider')throw Error('Provider unavailable');return {content:'Die Hausnummer ist 99, alles kostenlos.'};}});
 assert.equal(r.answer,guidance.answer);assert.equal(r.answerOrigin,'structured_mcp');assert.match(r.formulation.status,/^fallback_/);assert.equal(r.metrics.modelCalls,2);
});

test('clarifications skip optional composition and keep the exact pending question with one model call',async()=>{
 const guidance={schema:'zurich-guidance-v1',handled:true,status:'needs_clarification',answer:'Welche Postleitzahl: 8004 oder 8005?',pending_question:{field:'postal_code',reason:'Welche Postleitzahl?'},options:['PLZ 8004','PLZ 8005'],contextToken:'c'};
 const tools=modelTools([{name:'get_zurich_guidance',inputSchema:{type:'object'}}]);let calls=0;
 const r=await runQuestion({question:'Wann Karton an der Langstrasse in Zürich?',tools,formulate:true,client:{callTool:async()=>({content:[{type:'text',text:JSON.stringify(guidance)}]})},ask:async()=>{calls++;return call('get_zurich_guidance',{});}});
 assert.equal(calls,1);assert.equal(r.metrics.modelCalls,1);assert.equal(r.answer,guidance.answer);assert.equal(r.formulation.status,'not_needed_clarification');assert.deepEqual(r.traces[0].options,guidance.options);assert.equal(r.traces[0].pending_question.field,'postal_code');
});

test('plain formulation request omits tool fields for provider compatibility',async()=>{
 await completion({key:'test',messages:[],tools:[],fetchFn:async(_url,opts)=>{const body=JSON.parse(opts.body);assert.equal(body.tools,undefined);assert.equal(body.tool_choice,undefined);return {ok:true,json:async()=>({choices:[{message:{content:'{}'},finish_reason:'stop'}]})};}});
});

test('live runner writes exactly five explicit skipped rows without a key and never connects',async()=>{
 const {runLiveSmoke}=await import('../APERTUS-TEST.mjs');const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {join}=await import('node:path');const dir=await mkdtemp(join(process.cwd(),'smoke-test-'));
 try{const report=await runLiveSmoke({key:'',reportFile:join(dir,'report.json'),connect:async()=>{throw Error('must not connect');}});assert.equal(report.status,'skipped_missing_key');assert.equal(report.liveModel,false);assert.equal(report.rows.length,5);assert.ok(report.rows.every(r=>r.status==='not_run'&&r.mapRendered===null));assert.equal(JSON.parse(await readFile(join(dir,'report.json'))).rows.length,5);}finally{await rm(dir,{recursive:true,force:true});}
});
test('live runner catches provider failures per scenario and keeps the secret out of reports',async()=>{
 const {runLiveSmoke}=await import('../APERTUS-TEST.mjs');const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {join}=await import('node:path');const dir=await mkdtemp(join(process.cwd(),'smoke-test-'));let closed=false;
 try{const report=await runLiveSmoke({key:'synthetic-provider-secret',reportFile:join(dir,'report.json'),connect:async()=>({client:{close:async()=>{closed=true;}},tools:modelTools([{name:'get_zurich_guidance',inputSchema:{type:'object'}}])}),ask:async()=>{throw Error('timeout synthetic-provider-secret');}});assert.equal(report.rows.length,5);assert.equal(report.status,'failed');assert.ok(report.rows.every(r=>r.status==='error'));assert.ok(closed);assert.ok(!(await readFile(join(dir,'report.json'),'utf8')).includes('synthetic-provider-secret'));}finally{await rm(dir,{recursive:true,force:true});}
});
