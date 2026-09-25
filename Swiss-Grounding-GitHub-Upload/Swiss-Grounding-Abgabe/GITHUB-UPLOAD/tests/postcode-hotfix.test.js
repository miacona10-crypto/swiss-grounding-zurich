import test from 'node:test';
import assert from 'node:assert/strict';
import {createWasteAssistant} from '../src/waste.js';
import {createGuidance} from '../src/guidance.js';
import {readGeoData} from '../src/geo-data.js';

const now=()=>Date.parse('2026-09-25T09:00:00Z');
const data=readGeoData();
const preparation=async()=>({results:[{title:'Synthetic test evidence',url:'https://www.stadt-zuerich.ch/test',passages:[{text:'Stelle den gebündelten Karton am Sammeltag vor 7 Uhr bereit.'}]}]});
const make=()=>createGuidance({now,waste:createWasteAssistant({now,readData:()=>data,preparation})});
const calendar=(r,plz)=>{assert.equal(r.status,'ok');assert.equal(r.calendar.postalCode,plz);assert.ok(r.calendar.dates.length);assert.ok(r.calendar.dates.every(date=>data.calendar.some(e=>e.date===date&&e.postalCode===plz)));assert.ok(r.sourceLinks.some(s=>s.id==='calendar'));assert.equal(r.pending_question,null);};

test('reported Langstrasse dialogue accepts postcode after all four attempted house numbers',async()=>{
 const g=make();let r=await g({question:'ich bin an der Langstrasse in Zürich wann kann ich Karton entsorgen?'});
 assert.equal(r.pending_question.field,'postal_code');assert.deepEqual(r.options,['PLZ 8004','PLZ 8005']);assert.ok(r.actions.some(a=>a.url.includes('entsorgungskalender')));
 for(const question of ['56','102','130','145']){r=await g({question,contextToken:r.contextToken});assert.equal(r.pending_question.field,'postal_code');assert.match(r.answer,/vierstellige Postleitzahl/);assert.doesNotMatch(r.answer,/nicht als bestehende Adresse|Hausnummer.*finde ich nicht/);assert.equal(r.context.addressStatus,'not_confirmed');}
 r=await g({question:'8004',contextToken:r.contextToken});calendar(r,'8004');assert.equal(r.origin,undefined);assert.equal(r.context.address,null);
});
for(const number of ['56','102','130','145','110','240'])test(`calendar ignores house ${number}, resolves only the Langstrasse postcode`,async()=>{
 const g=make();let r=await g({question:`Wann wird Karton an der Langstrasse ${number} in Zürich abgeholt?`});
 assert.equal(r.locationResolution,'postcode');assert.equal(r.pending_question.field,'postal_code');assert.deepEqual(r.options,['PLZ 8004','PLZ 8005']);assert.doesNotMatch(r.answer,/Hausnummer.*(?:finde|nicht gefunden|bestehende)/);
 r=await g({question:'PLZ 8005',contextToken:r.contextToken});calendar(r,'8005');assert.equal(r.origin,undefined);
});
for(const [street,plz] of [['Apollostrasse','8032'],['Seefeldstrasse','8008']])test(`${street}: unique street postcode needs no house number and cites its derivation`,async()=>{
 const r=await make()({question:`Wann kann ich an der ${street} Karton entsorgen?`});calendar(r,plz);assert.equal(r.calendar.locationBasis,'street_postcode');assert.ok(r.sourceLinks.some(s=>s.id==='addresses'));assert.equal(r.origin,undefined);assert.equal(r.context.addressStatus,'not_confirmed');
});
test('postcode calendar does not validate an irrelevant house number or assert a verified address',async()=>{
 const r=await make()({question:'Wann kann ich Karton an der Seefeldstrasse 99999 entsorgen?'});calendar(r,'8008');assert.equal(r.origin,undefined);assert.equal(r.context.address,null);assert.equal(r.context.addressStatus,'not_confirmed');
});
test('cardboard with no location asks postcode directly within the declared city scope',async()=>{
 const g=make();let r=await g({question:'Wann kann ich Karton entsorgen?'});assert.equal(r.pending_question.field,'postal_code');
 r=await g({question:'8004',contextToken:r.contextToken});calendar(r,'8004');
});
test('explicit postcode needs no street and no house',async()=>{calendar(await make()({question:'Wann wird Karton abgeholt bei PLZ 8004?'}),'8004');});
test('general cardboard rule requires no personal location, even with unresolvable address',async()=>{
 for(const question of ['Wie bündele ich Karton?','Wie bündele ich Karton an der Erfundenstrasse 999 in Zürich?']){const r=await make()({question});assert.equal(r.status,'ok');assert.equal(r.locationResolution,'none');assert.equal(r.pending_question,null);assert.match(r.answer,/bündle Karton/);}
});
test('misspelled street for cardboard offers confirmation without asking a house number',async()=>{
 const g=make();let r=await g({question:'Wann wird Karton an der douforstrasse in Zürich abgeholt?'});assert.deepEqual(r.options,['Dufourstrasse']);assert.doesNotMatch(r.answer,/Hausnummer/);
 r=await g({question:'ja',contextToken:r.contextToken});calendar(r,'8008');assert.equal(r.origin,undefined);
});
test('nearest glass still needs a real point; postcode-only calendar cannot manufacture one',async()=>{
 const g=make();let r=await g({question:'Wann wird Karton an der Seefeldstrasse abgeholt?'});calendar(r,'8008');
 r=await g({question:'Wo kann ich Glas am nächsten entsorgen?',contextToken:r.contextToken});assert.equal(r.pending_question.field,'house_number');assert.equal(r.results.length,0);
 r=await g({question:'102',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.equal(r.locationResolution,'address');assert.equal(r.origin.address,'Seefeldstrasse 102');assert.equal(r.sortMode,'straight_line');assert.equal(r.results.length,3);
});
test('missing proximity address is a data gap with an escape, never proof of nonexistence',async()=>{
 const g=make();let r=await g({question:'Wo kann ich Glas nahe Langstrasse 102 in Zürich entsorgen?'});assert.equal(r.status,'needs_clarification');assert.match(r.answer,/nicht bestätigen/);assert.match(r.answer,/nicht.*nicht existiert/);assert.ok(r.actions.length);assert.ok(r.sourceLinks.some(s=>s.id==='addresses'));
 r=await g({question:'PLZ 8004',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.equal(r.sortMode,'postal_overview');assert.equal(r.origin,undefined);assert.ok(r.results.every(s=>s.distanceMeters===undefined));
});
test('explicit outside-city calendar is never replaced by Zürich postcode logic',async()=>{
 const r=await make()({question:'Wann wird Karton in Uster 8610 abgeholt?'});assert.equal(r.status,'out_of_scope');assert.equal(r.calendar,undefined);
});
test('contradictory street/postcode requires postcode clarification and no house validation',async()=>{
 const g=make();let r=await g({question:'Wann Karton an der Langstrasse 102 in Zürich 8008?'});assert.equal(r.pending_question.field,'postal_code');assert.equal(r.calendar,undefined);
 r=await g({question:'8005',contextToken:r.contextToken});calendar(r,'8005');
});
