import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGuidance} from '../src/guidance.js';
import {wasteRules} from '../src/waste-rules.js';
import {outsideScope,languageProblem} from '../src/scope.js';
import {extract} from '../src/extract.js';
import {coverage} from '../src/registry.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/waste-evidence.json',import.meta.url)));
const civic=JSON.parse(readFileSync(new URL('./fixtures/civic-evidence.json',import.meta.url)));
const retrieve=async id=>structuredClone(fixtures[id]||{status:'unavailable'});
const make=()=>createGuidance({rules:a=>wasteRules({...a,retriever:{retrieve}}),evidence:async topic=>structuredClone(civic[topic]),office:async()=>null});
for(const [question,expected,claim]of [
 ['Wo kaufe ich Sperrgut-Marken in Zürich?','ok','coupons_ended'],
 ['Kann ERZ mein Sofa abholen?','ok','pickup_booking'],
 ['Wohin mit dem kaputten Fernseher?','ok','electronics_free'],
 ['Wo kaufe ich Züri-Säcke?','ok','sack_price'],
 ['Wie entsorge ich Zeitungen?','ok','paper_prepare'],
 ['Wann wird mein Papier abgeholt?','partial','personal_calendar'],
 ['Was mache ich mit Bioabfall?','ok','bio_bin'],
 ['Wann ist mein Bioabfalltermin?','partial','personal_calendar'],
 ['Wo gebe ich Kunststoff ab?','partial','plastic_return'],
 ['Wo kann ich PET entsorgen?','partial','pet_free'],
 ['Wohin mit Chemikalien?','ok','hazard_not_trash'],
 ['Wo ist die Sonderabfall-Sammelstelle?','ok','hazard_location'],
 ['Wie finde ich den Entsorgungskalender?','ok','personal_calendar'],
 ['Wo ist der nächste Recyclinghof?','partial','yard_Werdhölzli'],
 ['Welche Öffnungszeiten hat der Recyclinghof?','ok','looacher_hours'],
 ])test('extended question: '+question,async()=>{
  const r=await make()({question});assert.equal(r.status,expected,r.answer);assert.ok(r.claims.some(c=>c.id===claim),r.answer);assert.equal(r.pending_question,null);
  for(const c of r.claims){assert.ok(c.sourceUrl.startsWith('https://www.stadt-zuerich.ch/'));assert.ok(c.retrievedAt);assert.ok(r.sourceLinks.some(s=>s.passages.some(p=>p.id===c.passageId)));}
 });
test('coupon correction distinguishes free coupons and paid pickup; no invented retailer or 10-day guarantee',async()=>{const r=await make()({question:'Wo kaufe ich Sperrgutmarken?'});assert.match(r.answer,/April 2025/);assert.match(r.answer,/drei Arbeitstage/);assert.match(r.answer,/kostenlos und autofrei/);assert.doesNotMatch(r.answer,/10 Arbeitstage|Marken bei (?:Coop|Migros)/);});
test('yard times do not assert open now or a nearest yard',async()=>{const r=await make()({question:'Welcher Recyclinghof ist jetzt offen und am nächsten?'});assert.equal(r.status,'partial');assert.equal(r.dataAvailability.liveOpeningHours,false);assert.equal(r.results.length,0);assert.match(r.answer,/nicht.*berechnet|berechnet.*nicht/);});
test('unknown item asks for material, without assigning a container',async()=>{const r=await make()({question:'Wo entsorge ich mein altes Surfbrett in Zürich?'});assert.equal(r.status,'needs_clarification');assert.equal(r.pending_question.field,'material');assert.equal(r.results.length,0);});
test('all rule sources offline yields unavailable, not remembered fees',async()=>{const r=await wasteRules({question:'Sperrgut Coupons',retriever:{retrieve:async()=>({status:'unavailable'})}});assert.equal(r.status,'unavailable');assert.equal(r.claims.length,0);assert.doesNotMatch(r.answer,/22.70|2025|drei/);});
test('changed source clauses fail closed for affected facts only',async()=>{const r=await wasteRules({question:'Wo kaufe ich Sperrgutmarken?',retriever:{retrieve:async id=>{const d=await retrieve(id);for(const b of d.doc?.blocks||[])b.text=b.text.replaceAll('22.70','999.00');return d;}}});assert.equal(r.status,'partial');assert.ok(r.missingRules.includes('bulky_price'));assert.ok(!r.claims.some(c=>c.id==='bulky_price'));assert.doesNotMatch(r.answer,/22.70|999.00/);});
for(const [question,reason]of [['Ich ziehe nach Uster. Wo anmelden?','municipality'],['Welche Regeln gelten im Kanton Waadt?','canton'],['Wie hoch ist der Rundfunkbeitrag nach meinem Umzug nach Konstanz?','outside_switzerland']])test('scope tier: '+reason,async()=>{const r=await make()({question});assert.equal(r.status,'out_of_scope');assert.equal(r.reason,reason);assert.equal(r.claims.length,0);});
for(const question of ["Comment puis-je m'inscrire à Zurich?",'Dove posso registrarmi a Zurigo?','Cura èn las vacanzas a Scuol?','Where can I register in Zurich?','Как зарегистрироваться в Цюрихе?'])test('language boundary: '+question,async()=>{const r=await make()({question});assert.ok(['invalid','out_of_scope'].includes(r.status));assert.equal(r.languageSupported,false);assert.equal(r.claims.length,0);});
test('Swiss dialect is not mistaken for an unsupported language',()=>{assert.equal(languageProblem('Wo chan ich i Züri Glas entsorge?'),false);});
test('punctuation and origin do not turn Zurich into another municipality',()=>{for(const q of ['Ich ziehe aus Bern nach Zürich. Wo anmelden?','Ich komme aus Deutschland nach Zürich','Nach dem Umzug: was tun?'])assert.equal(outsideScope(q),null);});
test('correction of origin does not assign a nationality',async()=>{const g=make();let r=await g({question:'Anmeldung in Zürich'});r=await g({question:'doch aus Deutschland',contextToken:r.contextToken});assert.equal(r.context.residenceOrigin,'abroad');assert.equal(r.context.nationality,null);});
test('follow-up outside evidence coverage does not recycle old registration text',async()=>{const g=make();let r=await g({question:'Ich ziehe aus Bern nach Zürich. Wo anmelden?'});r=await g({question:'Was ist mit einem Nachsendeauftrag bei der Post?',contextToken:r.contextToken});assert.equal(r.status,'partial');assert.equal(r.dataAvailability.status,'missing_data');assert.doesNotMatch(r.answer,/14 Tagen|CHF 35/);});
test('material capability table distinguishes nearest station from rules',()=>{assert.equal(coverage.materialAvailability.find(r=>r.material==='Batterien').nearest,'missing_data');assert.equal(coverage.materialAvailability.find(r=>r.material==='Metall').nearest,'straight_line');});
test('mixed new and existing materials ask one targeted choice',async()=>{const g=make();let r=await g({question:'Wo entsorge ich Glas und Papier in Zürich?'});assert.equal(r.pending_question.field,'material');assert.deepEqual(r.options,['Glas','Papier']);r=await g({question:'Papier',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.ok(r.claims.some(c=>c.id==='paper_prepare'));});
test('inert price table extraction excludes scripts and malformed rows',()=>{
 const rows=[[{value:'Elektrogeräte'},{value:'Keine benzinbetriebenen Geräte'},{value:'Gratis<script>stealKey()</script>'}]];
 const html='<h1>Preise</h1><stzh-datatable rows="'+JSON.stringify(rows).replaceAll('"','&quot;')+'"></stzh-datatable>';
 const d=extract(html,'https://www.stadt-zuerich.ch/test');assert.equal(d.blocks[0].text,'Elektrogeräte | Keine benzinbetriebenen Geräte | Gratis');assert.doesNotMatch(JSON.stringify(d),/stealKey/);
 assert.equal(extract('<stzh-datatable rows="broken"></stzh-datatable>','https://example.org').blocks.length,0);
});
