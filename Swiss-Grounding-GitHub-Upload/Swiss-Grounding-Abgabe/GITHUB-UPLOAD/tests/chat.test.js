import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {createDemoServer} from '../src/web.js';
import {createChatService} from '../src/chat.js';

async function start(options={}){
  const app=await createDemoServer({chat:createChatService({initialKey:'',...options})});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function session(){const r=await fetch(base+'/api/session');return {cookie:r.headers.get('set-cookie').split(';')[0],...await r.json()};}
  const post=(s,path,body,extra={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',cookie:s.cookie,'x-csrf-token':s.csrf,...extra},body:JSON.stringify(body)});
  return {app,base,session,post};
}
const key='synthetic-testing-key';
const asEvents=async r=>(await r.text()).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));

// Swisscom completion is simulated; MCP negotiation and calls use the real process.
function fakeModel({messages,tools}){
  const last=messages.at(-1);
  if(last.role==='tool'){
    const data=JSON.parse(last.content).data;
    return {content:data.status==='needs_clarification'?data.message:`Passender Standort: ${data.results?.[0]?.address || 'Quelle prüfen'}.`,_usage:{prompt_tokens:50,completion_tokens:10}};
  }
  const question=last.content;
  if(tools.length===1&&tools.some(t=>t.function.name==='get_zurich_guidance'))return {content:null,_usage:{prompt_tokens:40,completion_tokens:20},tool_calls:[{id:'w_'+messages.length,type:'function',function:{name:'get_zurich_guidance',arguments:JSON.stringify({question})}}]};
  const missing=/ohne Ort/.test(question);
  return {content:null,_usage:{prompt_tokens:40,completion_tokens:20},tool_calls:[{id:'test_'+messages.length,type:'function',function:{name:missing?'find_swiss_moving_information':'find_zurich_recycling_points',arguments:JSON.stringify(missing?{query:'Wie melde ich mich nach dem Umzug an?'}:{postalCode:'8004',material:'Glas'})}}]};
}

test('browser chat executes real MCP, returns evidence and remembers follow-up context',async()=>{
  let calls=0;const x=await start({ask:async p=>{calls++;if(calls===2)assert.ok(p.messages.some(m=>m.role==='assistant'&&m.content?.includes('Sammelstellen für Glas')));return fakeModel(p);}});
  try{
    const s=await x.session();assert.equal(s.configured,false);
    assert.equal((await x.post(s,'/api/key',{key})).status,200);
    const events=await asEvents(await x.post(s,'/api/chat',{question:'Glas in 8004 Zürich?'}));
    const answer=events.find(e=>e.event==='answer');assert.ok(answer);assert.equal(answer.turns,1);
    assert.equal(answer.traces[0].name,'get_zurich_guidance');assert.equal(answer.traces[0].executed,true);
    assert.ok(answer.traces[0].locations.length);assert.ok(answer.traces[0].urls.length);
    assert.equal(answer.metrics.inputTokens,40);assert.equal(answer.metrics.outputTokens,20);
    assert.ok(!JSON.stringify(events).includes(key));
    const follow=await asEvents(await x.post(s,'/api/chat',{question:'Nochmal Glas in 8004'}));assert.equal(follow.at(-1).turns,2);
    const refreshed=await fetch(x.base+'/api/session',{headers:{cookie:s.cookie}});const state=await refreshed.json();assert.equal(state.messages.length,2);assert.ok(!JSON.stringify(state).includes(key));
    await x.post(s,'/api/reset',{});const clean=await (await fetch(x.base+'/api/session',{headers:{cookie:s.cookie}})).json();assert.equal(clean.turns,0);assert.equal(clean.messages.length,0);assert.equal(clean.configured,true);
  }finally{await x.app.close();}
});

test('missing location produces an actual MCP clarification, not invented evidence',async()=>{
  const x=await start({ask:fakeModel});try{const s=await x.session();await x.post(s,'/api/key',{key});const data=(await asEvents(await x.post(s,'/api/chat',{question:'Anmeldung ohne Ort'}))).at(-1);assert.equal(data.traces[0].status,'needs_clarification');assert.equal(data.traces[0].evidence,false);assert.match(data.answer,/Stadt/);}finally{await x.app.close();}
});

test('keys never reach a second browser session; disconnect forgets them',async()=>{
  const x=await start();try{const a=await x.session(),b=await x.session();await x.post(a,'/api/key',{key});const r=await x.post(b,'/api/chat',{question:'Test'});assert.equal(r.status,401);await x.post(a,'/api/disconnect',{});assert.equal((await x.post(a,'/api/chat',{question:'Test'})).status,401);}finally{await x.app.close();}
});

test('cross-origin, missing CSRF, invalid bodies and oversized requests are rejected',async()=>{
  const x=await start();try{const s=await x.session();assert.equal((await x.post(s,'/api/key',{key},{origin:'https://evil.example'})).status,403);assert.equal((await x.post(s,'/api/key',{key},{'x-csrf-token':'bad'})).status,403);assert.equal((await x.post(s,'/api/key',{key},{'content-type':'text/plain'})).status,415);assert.equal((await x.post(s,'/api/key',{key:'x'.repeat(9000)})).status,413);assert.equal((await x.post(s,'/api/chat',null)).status,400);
    // fetch normalizes Host; use a raw HTTP request to exercise the actual guard.
    const status=await new Promise((resolve,reject)=>{const r=request(x.base+'/',{headers:{host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);r.end();});assert.equal(status,403);
  }finally{await x.app.close();}
});

test('provider errors are explicit and redact the credential from streamed messages',async()=>{
  const x=await start({ask:async()=>{throw Error('Provider failure '+key);}});try{const s=await x.session();await x.post(s,'/api/key',{key});const r=await x.post(s,'/api/chat',{question:'Glas?'});const text=await r.text();assert.ok(!text.includes(key));assert.ok(text.includes('KEY AUSGEBLENDET'));assert.ok(text.includes('"event":"error"'));assert.ok(!text.includes('"event":"answer"'));}finally{await x.app.close();}
});

test('concurrent requests are blocked while a model call is pending, then cancellation recovers',async()=>{
  let entered;const enteredPromise=new Promise(r=>entered=r);
  const x=await start({ask:async({signal})=>{entered();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Abgebrochen')),{once:true}));}});
  try{const s=await x.session();await x.post(s,'/api/key',{key});const r=await x.post(s,'/api/chat',{question:'Glas?'});await enteredPromise;assert.equal((await x.post(s,'/api/key',{key:'another'})).status,409);await r.body.cancel();let reset;for(let i=0;i<30;i++){reset=await x.post(s,'/api/reset',{});if(reset.status===200)break;await new Promise(r=>setTimeout(r,20));}assert.equal(reset.status,200);}finally{await x.app.close();}
});

test('idle sessions expire and do not restore an entered secret',async()=>{
  let time=100000;const x=await start({now:()=>time});try{const s=await x.session();await x.post(s,'/api/key',{key});time+=3600001;assert.equal((await x.post(s,'/api/chat',{question:'Test'})).status,401);const fresh=await x.session();assert.equal(fresh.configured,false);}finally{await x.app.close();}
});

test('browser HTTP regression: no provider tool call still yields the Bleicherweg clarification and mapped nearest stations',async()=>{
  let providerCalls=0;
  const x=await start({ask:async({messages})=>{providerCalls++;assert.ok(messages.every(m=>!m._mcpContext));return {content:'Angebliche Antwort ohne Werkzeug',_usage:{prompt_tokens:10,completion_tokens:5}};}});
  try{
    const s=await x.session();await x.post(s,'/api/key',{key});let last;
    for(const [question,field]of [['Wo kann ich beim Bleicherweg in der nähe glas entsorgen ?','municipality'],['Stadt Zürich','houseNumber'],['20',null]]){
      const events=await asEvents(await x.post(s,'/api/chat',{question}));
      assert.ok(!events.some(e=>e.event==='error'));last=events.find(e=>e.event==='answer');assert.ok(last);
      assert.equal(last.traces[0].initiatedBy,'application_fallback');assert.equal(last.metrics.modelCalls,1);
      assert.equal(last.traces[0].status,field?'needs_clarification':'ok');
      assert.doesNotMatch(last.answer,/Angebliche Antwort|kein MCP-Werkzeug/);
      if(field==='municipality')assert.deepEqual(last.traces[0].options,['Stadt Zürich']);
      if(field==='houseNumber')assert.match(last.answer,/Hausnummer.*Bleicherweg/);
    }
    assert.equal(providerCalls,3);assert.equal(last.turns,3);assert.equal(last.traces[0].origin.address,'Bleicherweg 20');
    assert.equal(last.traces[0].locations[0].address,'Am Schanzengraben 25');assert.equal(last.traces[0].sortMode,'straight_line');
    assert.ok(last.traces[0].locations.every(p=>p.mapUrl.startsWith('https://www.openstreetmap.org/')));
    const restored=await(await fetch(x.base+'/api/session',{headers:{cookie:s.cookie}})).json();
    assert.equal(restored.messages.length,3);assert.equal(restored.messages[2].traces[0].initiatedBy,'application_fallback');
    assert.ok(!JSON.stringify(restored).includes(key));
  }finally{await x.app.close();}
});

test('browser regression: misspelled street and cans never display scraped paragraphs, map metal stations after confirmation',async()=>{
 const x=await start({ask:async()=>({content:'Scheinantwort ohne Werkzeugaufruf',_usage:{prompt_tokens:10,completion_tokens:10}})});
 try{
  const s=await x.session();await x.post(s,'/api/key',{key});let r;
  for(const [question,expected] of [['ich wohne bei der douforstrasse in Zürich wo kann ich Büchsen entsorgen ?','street'],['Dufourstrasse','houseNumber'],['20',null]]){
   const events=await asEvents(await x.post(s,'/api/chat',{question}));assert.ok(!events.some(e=>e.event==='error'));
   r=events.find(e=>e.event==='answer');assert.ok(r);assert.equal(r.traces[0].initiatedBy,'application_fallback');
   assert.equal(r.traces[0].status,expected?'needs_clarification':'ok');assert.doesNotMatch(r.answer,/Scheinantwort|Zur Bereichsauswahl|Zum Inhalt Seite vorlesen/);
   if(expected==='street')assert.deepEqual(r.traces[0].options,['Dufourstrasse']);
  }
  assert.equal(r.traces[0].origin.address,'Dufourstrasse 20');assert.equal(r.traces[0].locations[0].address,'Mühlebachstrasse 35');assert.ok(r.traces[0].locations.every(p=>p.materials.includes('Metall')));
 }finally{await x.app.close();}
});

test('browser optional composition returns model arrangement, original facts and map without exposing context tokens',async()=>{
 const x=await start({ask:p=>p.tools.length?fakeModel(p):{content:JSON.stringify({intro:'friendly',blocks:JSON.parse(p.messages.at(-1).content).blocks}),_usage:{prompt_tokens:5,completion_tokens:5}}});
 try{const s=await x.session();await x.post(s,'/api/key',{key});const r=(await asEvents(await x.post(s,'/api/chat',{question:'Glas nahe Seefeldstrasse 102 in Zürich',formulate:true}))).at(-1);
 assert.equal(r.event,'answer');assert.equal(r.answerOrigin,'apertus_verified_composition');assert.ok(r.originalAnswer.includes('Seefeldstrasse 102'));assert.ok(r.serverResult.sourceLinks.length);assert.equal(r.serverResult.contextToken,undefined);assert.equal(r.metrics.modelCalls,2);assert.equal(r.traces[0].locations.length,3);assert.equal(r.formulation.validation,'exact_fact_blocks');assert.ok(!JSON.stringify(r).includes(key));
 }finally{await x.app.close();}
});

test('browser Langstrasse regression: postcode buttons, short replies, then real calendar via fallback',async()=>{
 const x=await start({ask:async p=>p.tools.length?{content:'No tool call',_usage:{prompt_tokens:1,completion_tokens:1}}:{content:JSON.stringify({intro:'direct',blocks:JSON.parse(p.messages.at(-1).content).blocks}),_usage:{prompt_tokens:1,completion_tokens:1}}});
 try{
  const s=await x.session();await x.post(s,'/api/key',{key});let r;
  for(const question of ['Wann kann ich an der Langstrasse in Zürich Karton entsorgen?','56','102','130','145']){
   const events=await asEvents(await x.post(s,'/api/chat',{question,formulate:true}));assert.ok(!events.some(e=>e.event==='error'));r=events.find(e=>e.event==='answer');assert.ok(r);
   assert.equal(r.serverResult.pending_question.field,'postal_code');assert.deepEqual(r.traces[0].options,['PLZ 8004','PLZ 8005']);assert.equal(r.metrics.modelCalls,1);assert.equal(r.formulation.status,'not_needed_clarification');assert.equal(r.traces[0].initiatedBy,'application_fallback');assert.doesNotMatch(r.answer,/nicht als bestehende Adresse/);
  }
  const events=await asEvents(await x.post(s,'/api/chat',{question:'PLZ 8004',formulate:true}));r=events.find(e=>e.event==='answer');assert.ok(r);assert.equal(r.serverResult.calendar.postalCode,'8004');assert.ok(r.serverResult.calendar.dates.length);assert.equal(r.serverResult.pending_question,null);assert.equal(r.serverResult.origin,undefined);assert.equal(r.formulation.status,'accepted');assert.equal(r.metrics.modelCalls,2);
 }finally{await x.app.close();}
});
