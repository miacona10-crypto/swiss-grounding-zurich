import test from 'node:test';
import assert from 'node:assert/strict';
import {createWasteAssistant} from '../src/waste.js';
import {readGeoData,distanceMeters,inGeometry,normalized} from '../src/geo-data.js';
import {runQuestion,modelTools} from '../APERTUS-TEST.mjs';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {fileURLToPath} from 'node:url';

const fixtureNow=Date.parse('2026-09-24T12:00:00Z');
const current=readGeoData();
const data={...current,downloadedAt:'2026-09-24T00:00:00Z'};
const rule=async()=>({results:[{title:'Synthetischer Regelbeleg',url:'https://www.stadt-zuerich.ch/test',retrievedAt:'2026-09-24T00:00:00Z',passages:[{id:'fixture',text:'Karton am Sammeltag vor 7 Uhr bereitstellen.'}]}]});
const make=options=>createWasteAssistant({readData:()=>data,now:()=>fixtureNow,preparation:rule,...options});

test('reported Kreis 8 regression: no assumed city or postcode 8004',async()=>{
 const a=make();let r=await a({question:'Wo kann ich im Kreis 8 Glas entsorgen?'});
 assert.equal(r.status,'needs_clarification');assert.equal(r.context.postalCode,undefined);assert.equal(r.results.length,0);
 r=await a({question:'Stadt Zürich',contextToken:r.contextToken});
 assert.equal(r.status,'ok');assert.equal(r.sortMode,'district_overview');assert.ok(r.results.every(p=>p.district===8&&p.postalCode!=='8004'));assert.ok(r.results.every(p=>p.distanceMeters===undefined));
});

test('reported Apollostrasse regression: old district and postcode are cleared; exact house gives nearby points',async()=>{
 const a=make();let r=await a({question:'Wo kann ich Glas in Zürich 8004 entsorgen?'});
 r=await a({question:'nächste Glas Entsorgung nähe Apollostraße in Zürich',contextToken:r.contextToken});
 assert.equal(r.status,'needs_clarification');assert.deepEqual(r.missingFields,['houseNumber']);assert.equal(r.context.postalCode,undefined);assert.match(r.answer,/8032.*Kreis 7/);
 r=await a({question:'20',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.equal(r.origin.postalCode,'8032');assert.equal(r.origin.district,7);
 assert.deepEqual(r.results.map(p=>p.address),['Merkurstrasse 4','Mühlebachstrasse 35','Hammerstrasse 43']);
 assert.ok(!r.results.some(p=>/Hohlstrasse|Albisriederplatz/.test(p.address)));
 const expected=data.stations.filter(p=>p.materials.includes('Glas')).map(p=>({...p,d:distanceMeters(r.origin,p)})).sort((a,b)=>a.d-b.d).slice(0,3);
 assert.deepEqual(r.results.map(p=>p.id),expected.map(p=>p.id));assert.ok(r.results.every(p=>p.distanceMeters<700));
});

test('explicit conflicting address/district requires confirmation, not a silent correction',async()=>{
 const a=make();let r=await a({question:'Glas nahe Apollostrasse 20 in Zürich Kreis 8'});
 assert.equal(r.status,'needs_clarification');assert.equal(r.results.length,0);assert.match(r.answer,/widerspricht/);
 r=await a({question:r.options[0],contextToken:r.contextToken});assert.equal(r.status,'ok');assert.equal(r.origin.district,7);
});

test('postal and district mismatch, nonexistent house and unknown street do not reuse prior locations',async()=>{
 const a=make();for(const question of ['Glas in Zürich Kreis 8 PLZ 8004','Glas nahe Apollostrasse 999 in Zürich','Glas nahe Erfundenstrasse 12 in Zürich']){
  const r=await a({question});assert.equal(r.status,'needs_clarification');assert.equal(r.results.length,0);
 }
 const prior=await a({question:'Glas nahe Apollostrasse 20 in Zürich'});
 const changed=await a({question:'Und Glas in Baden?',contextToken:prior.contextToken});assert.equal(changed.status,'needs_clarification');assert.equal(changed.results.length,0);
});

test('cardboard clarification chain asks city then postcode and uses the actual calendar',async()=>{
 const a=make();let r=await a({question:'Wann kann ich Karton rausstellen?'});assert.deepEqual(r.missingFields,['municipality']);
 r=await a({question:'Zürich',contextToken:r.contextToken});assert.deepEqual(r.missingFields,['postalCode']);
 r=await a({question:'8032',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.equal(r.calendar.dates[0],'2026-09-28');assert.equal(r.calendar.before,'07:00');assert.equal(r.calendar.timezone,'Europe/Zurich');
 assert.ok(data.calendar.some(e=>e.postalCode==='8032'&&e.date===r.calendar.dates[0]));
});

test('material change retains verified address and can move from glass to cardboard',async()=>{
 const a=make();let r=await a({question:'Glas nahe Apollostrasse 20 in Zürich'});
 r=await a({question:'Wann kann ich Karton rausstellen?',contextToken:r.contextToken});assert.equal(r.calendar.postalCode,'8032');assert.equal(r.origin.address,'Apollostrasse 20');
});

test('collection-day cutoff uses Europe/Zurich time and does not claim that collection is over',async()=>{
 const before=make({now:()=>Date.parse('2026-09-28T04:30:00Z')});let r=await before({question:'Wann kann ich Karton in Zürich 8032 rausstellen?'});
 assert.equal(r.calendar.dates[0],'2026-09-28');assert.equal(r.calendar.todayCutoffPassed,false);
 const after=make({now:()=>Date.parse('2026-09-28T05:30:00Z')});r=await after({question:'Wann kann ich Karton in Zürich 8032 rausstellen?'});
 assert.ok(r.calendar.dates[0]>'2026-09-28');assert.equal(r.calendar.todayCutoffPassed,true);assert.match(r.answer,/nicht bekannt/);
});

test('unavailable live rule never turns into a fabricated preparation time',async()=>{
 const a=make({preparation:async()=>({results:[]})});const r=await a({question:'Wann kann ich Karton in Zürich 8032 rausstellen?'});
 assert.equal(r.status,'partial');assert.equal(r.calendar.before,null);assert.ok(!r.answer.includes('7 Uhr'));
});

test('how to set out cardboard answers from a matching city passage without asking for postcode',async()=>{
 const preparation=async()=>({results:[{title:'Kartonsammlung | Stadt Zürich',url:'https://www.stadt-zuerich.ch/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/kartonsammlung.html',retrievedAt:'2026-09-24',passages:[{id:'rule',text:'Karton gehört gefaltet, gebündelt und geschnürt an den Strassenrand. Stellen Sie den gebündelten Karton am Sammeltag vor 7 Uhr bereit. Die Sammlung ist kostenlos.'}]}]});
 const r=await make({preparation})({question:'Wie muss ich Karton in Zürich bereitstellen?'});
 assert.equal(r.status,'ok');assert.match(r.answer,/bündle Karton/);assert.match(r.answer,/vor 7 Uhr/);assert.match(r.answer,/kostenlos/);assert.equal(r.missingFields,undefined);assert.ok(r.sourceLinks.some(s=>s.passages.length));
});
test('cardboard instructions do not invent preparation or cost from an unavailable source',async()=>{
 const r=await make({preparation:async()=>({results:[]})})({question:'Wie muss ich Karton in Zürich bereitstellen?'});
 assert.equal(r.status,'unavailable');assert.doesNotMatch(r.answer,/vor 7 Uhr|kostenlos/);
});

test('missing battery source preserves the prior address without claiming free return or nearest stations',async()=>{
 const a=make({batterySource:async()=>({status:'unavailable'})});let r=await a({question:'Metall an der Seefeldstrasse 102 in Zürich'});
 r=await a({question:'Wo Batterien am nächsten entsorgen?',contextToken:r.contextToken});
 assert.equal(r.status,'unavailable');assert.equal(r.context.street,'Seefeldstrasse');assert.equal(r.context.houseNumber,'102');assert.equal(r.context.material,'Batterien');assert.equal(r.results.length,0);assert.doesNotMatch(r.answer,/kostenlos zurückgeben/);
});

test('stale snapshot, unsupported PET and opening-hour requests remain explicit',async()=>{
 assert.equal((await make({readData:()=>({...data,downloadedAt:'2026-08-01'})})({question:'Glas in Zürich Kreis 8'})).status,'unavailable');
 assert.equal((await make()({question:'PET in Zürich Kreis 8'})).status,'out_of_scope');
 const a=make();const r=await a({question:'Glas in Zürich Kreis 8'});const next=await a({question:'Welche sind am Wochenende geöffnet?',contextToken:r.contextToken});assert.equal(next.status,'out_of_scope');
});

test('distance and polygon math are geographic, not a postcode approximation',()=>{
 assert.equal(distanceMeters({lat:47.3,lon:8.5},{lat:47.3,lon:8.5}),0);
 const d=distanceMeters({lat:47,lon:8},{lat:47.001,lon:8});assert.ok(d>110&&d<112);
 const shape={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[2,2],[4,2],[4,4],[2,4],[2,2]]]};
 assert.equal(inGeometry([1,1],shape),true);assert.equal(inGeometry([3,3],shape),false);assert.equal(inGeometry([12,1],shape),false);assert.equal(normalized('Apollostraße'),'apollostrasse');
});

test('real MCP bridge ignores model-invented 8004 and preserves the authoritative follow-up',async()=>{
 const client=new Client({name:'waste-regression',version:'1'});const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/mcp.js',import.meta.url))]});
 try{
  await client.connect(transport);const tools=modelTools((await client.listTools()).tools);let calls=0;
  const ask=async ({tools:selected})=>{calls++;assert.deepEqual(selected.map(t=>t.function.name),['get_zurich_guidance']);return {tool_calls:[{id:'w'+calls,type:'function',function:{name:'get_zurich_guidance',arguments:JSON.stringify({question:'Glas in Zürich 8004',contextToken:'invented'})}}],_usage:{prompt_tokens:10,completion_tokens:5}};};
  let r=await runQuestion({question:'Glas nahe Apollostrasse in Zürich',client,tools,ask});assert.equal(r.answerOrigin,'structured_mcp');assert.match(r.answer,/Hausnummer/);assert.equal(r.traces[0].context.postalCode,undefined);
  r=await runQuestion({question:'20',history:r.history,client,tools,ask});assert.match(r.answer,/Merkurstrasse 4/);assert.equal(r.traces[0].origin.postalCode,'8032');assert.equal(calls,2);
 }finally{await client.close();}
});
