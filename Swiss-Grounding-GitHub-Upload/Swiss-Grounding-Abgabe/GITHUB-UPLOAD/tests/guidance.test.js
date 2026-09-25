import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGuidance} from '../src/guidance.js';
import {createWasteAssistant} from '../src/waste.js';
import {readGeoData} from '../src/geo-data.js';
import {civicEvidence,firstStepsEvidence} from '../src/civic.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/civic-evidence.json',import.meta.url)));
const evidence=async topic=>structuredClone(fixtures[topic]||{available:false});
const make=options=>createGuidance({evidence,office:async()=>null,...options});
async function conversation(g,questions){let r;for(const question of questions)r=await g({question,contextToken:r?.contextToken});return r;}

test('uploaded failure: house number does not replace the essential origin question',async()=>{
 const g=make();let r=await g({question:'ich möchte mich an der apollostrasse in Zürich anmelden wo genau muss ich mich anmelden. Bin neu in der stadt'});
 assert.deepEqual(r.missingFields,['residenceOrigin']);assert.equal(r.claims.length,0);assert.doesNotMatch(r.answer,/zwingend|Zürich Süd/);
 r=await g({question:'apollostrasse 13',contextToken:r.contextToken});assert.deepEqual(r.missingFields,['residenceOrigin']);assert.doesNotMatch(r.answer,/Mietvertrag|Hausnummer.*\?/);
 r=await g({question:'Aus einer anderen Schweizer Gemeinde',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.match(r.answer,/Online/);assert.doesNotMatch(r.answer,/Zürich Süd|ausschliesslich.*Termin/);assert.ok(r.actions.some(a=>a.url.includes('eumzug')));
 r=await g({question:'Welche Unterlagen brauche ich?',contextToken:r.contextToken});assert.deepEqual(r.missingFields,['nationality']);
 r=await g({question:'Schweizer Staatsangehörigkeit',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.match(r.answer,/Pass oder Identitätskarte/);assert.doesNotMatch(r.answer,/Ausländerausweis|Visum|Arbeitsvertrag/);
});

for(const origin of ['Aus einer anderen Schweizer Gemeinde','Aus dem Ausland'])for(const nationality of ['Ich bin Schweizer','Ich bin ausländischer Staatsangehöriger'])for(const [request,expected]of [['Wo muss ich mich anmelden?','office'],['Welche Unterlagen brauche ich?','documents'],['Wie viel kostet die Anmeldung?','fees'],['Bis wann muss ich mich anmelden?','deadline'],['Kann ich mich online anmelden?','online']]){
 test(`case matrix: ${origin}; ${nationality}; ${expected}`,async()=>{
  const r=await make()({question:`Ich ziehe nach Zürich. ${origin}. ${nationality}. ${request}`});
  assert.ok(['ok','partial'].includes(r.status));assert.equal(r.missingFields.length,0);
  if(expected==='deadline'){assert.match(r.answer,/14 Tagen/);assert.equal(r.claims.length,1);}
  else if(origin.includes('Schweizer Gemeinde')){
   assert.doesNotMatch(r.answer,/Zürich Süd/);assert.ok(r.claims.every(c=>!c.id.startsWith('abroad_')));
   if(expected==='documents'&&nationality==='Ich bin Schweizer')assert.doesNotMatch(r.answer,/Ausländerausweis|Visum|Arbeitsvertrag/);
   if(expected==='documents'&&nationality.includes('ausländischer'))assert.match(r.answer,/Ausländerausweis/);
  }else{assert.doesNotMatch(r.answer,/bisherigen Wohngemeinde ab|40 Franken/);assert.ok(!r.actions.some(a=>a.url.includes('eumzug')));if(expected==='office'||expected==='online')assert.match(r.answer,/Zürich Süd/);}
  for(const claim of r.claims){assert.ok(claim.conditions);assert.ok(claim.sourceUrl);assert.ok(claim.passageId);}
 });
}

for(const origin of ['aus Winterthur','von Uster','aus Bern','aus der Schweiz'])test('Swiss origin is not rejected as a destination: '+origin,async()=>{
 const r=await make()({question:`Ich ziehe ${origin} nach Zürich. Wo muss ich mich anmelden?`});assert.equal(r.status,'ok');assert.equal(r.context.residenceOrigin,'switzerland');assert.doesNotMatch(r.answer,/Zürich Süd/);
});
for(const origin of ['aus Deutschland','aus Italien','aus dem Ausland'])test('foreign origin chooses only the foreign branch: '+origin,async()=>{
 const r=await make()({question:`Ich ziehe ${origin} nach Zürich und möchte mich anmelden.`});assert.equal(r.status,'ok');assert.equal(r.context.residenceOrigin,'abroad');assert.match(r.answer,/Zürich Süd/);
});
for(const destination of ['Uster','Winterthur','Konstanz','Baden'])test('outside destination never inherits Zurich: '+destination,async()=>{
 const g=make();let r=await g({question:'Anmeldung in Zürich'});r=await g({question:`Ich ziehe nach ${destination}`,contextToken:r.contextToken});assert.equal(r.status,'out_of_scope');assert.equal(r.claims.length,0);assert.equal(r.context.municipality,null);
});

test('deadline and general overview do not ask for irrelevant private details',async()=>{
 for(const question of ['Bis wann muss ich mich in Zürich anmelden?','Allgemeiner Überblick: Welche Möglichkeiten zur Anmeldung in Zürich gibt es?']){const r=await make()({question});assert.equal(r.status,'ok');assert.equal(r.missingFields.length,0);assert.doesNotMatch(r.answer,/Welche Hausnummer|Hast du.*Staatsangehörigkeit/);}
});
test('origin correction replaces the old branch',async()=>{
 const r=await conversation(make(),['Ich ziehe aus Deutschland nach Zürich. Wo anmelden?','Korrektur: nicht aus dem Ausland, sondern aus der Schweiz']);assert.equal(r.context.residenceOrigin,'switzerland');assert.doesNotMatch(r.answer,/Zürich Süd/);
});
test('contradictory origins require a clarification',async()=>{const r=await make()({question:'Ich melde mich in Zürich an und komme aus der Schweiz und aus dem Ausland.'});assert.deepEqual(r.missingFields,['residenceOrigin']);assert.equal(r.claims.length,0);});
test('failed source never returns remembered deadlines or fees',async()=>{
 const r=await make({evidence:async()=>({available:false})})({question:'Bis wann muss ich mich in Zürich anmelden?'});assert.equal(r.status,'unavailable');assert.equal(r.claims.length,0);assert.doesNotMatch(r.answer,/14|40/);
});
test('missing case rule produces partial, not an allegedly complete checklist',async()=>{
 const r=await make({evidence:async t=>{const e=await evidence(t);e.facts=e.facts.filter(f=>f.id!=='foreign_permit');return e;}})({question:'Ich ziehe aus der Schweiz nach Zürich, bin ausländischer Staatsangehöriger. Welche Unterlagen brauche ich?'});assert.equal(r.status,'partial');assert.ok(r.missingRules.includes('foreign_permit'));assert.match(r.limitations.join(' '),/unvollständig/);
});
test('expired contexts do not silently reuse nationality or origin',async()=>{
 let t=0;const g=make({now:()=>t});let r=await g({question:'Anmeldung in Zürich'});t=3600001;r=await g({question:'Ausland',contextToken:r.contextToken});assert.equal(r.status,'needs_clarification');assert.match(r.answer,/abgelaufen/);
});
test('multi-intent asks which task first without guessing',async()=>{const r=await make()({question:'Ich möchte mich in Zürich anmelden und Glas entsorgen.'});assert.deepEqual(r.missingFields,['topic']);assert.deepEqual(r.options,['Anmeldung','Entsorgung']);});
test('generic debt cost has no unnecessary address or nationality question',async()=>{
 const r=await make()({question:'Wie viel kostet ein Betreibungsauszug in Zürich?'});assert.equal(r.status,'ok');assert.match(r.answer,/17 Franken/);assert.equal(r.missingFields.length,0);
});
test('debt office does not take the new flat as the debt-register address',async()=>{
 const r=await conversation(make(),['Ich melde mich an der Apollostrasse 20 in Zürich an','Wo kann ich persönlich einen Betreibungsauszug am Schalter holen?']);assert.equal(r.status,'partial');assert.match(r.answer,/betreffende.*aktuelle oder frühere/);assert.doesNotMatch(r.answer,/Betreibungsamt Zürich 7/);assert.ok(r.actions.some(a=>a.label.includes('Adresse')));
});
test('third-party debt extract keeps the legitimate-interest condition',async()=>{
 const r=await make()({question:'Betreibungsauszug über eine andere Person in Zürich bestellen'});assert.match(r.answer,/berechtigtes Interesse/);assert.doesNotMatch(r.answer,/ohne.*Nachweis/);
});
test('topic transition uses a supplied address but verifies it before distance calculations',async()=>{
 const now=()=>Date.parse('2026-09-24T12:00:00Z');const data={...readGeoData(),downloadedAt:'2026-09-24T00:00:00Z'};
 const g=make({now,waste:createWasteAssistant({now,readData:()=>data})});const r=await conversation(g,['Ich möchte mich an der Apollostrasse 20 in Zürich anmelden.','Wo kann ich Glas in der Nähe entsorgen?']);assert.equal(r.status,'ok');assert.equal(r.origin.address,'Apollostrasse 20');assert.equal(r.results[0].address,'Merkurstrasse 4');
});
test('source parser attaches foreign-only office to the abroad branch and fails closed on a changed deadline',async()=>{
 const text='Sie müssen sich innerhalb von 21 Tagen bei der Stadt Zürich anmelden (Meldepflicht). Eine Anmeldung ist erst ab dem effektiven Einzug möglich. Sie sind aus einer anderen Schweizer Gemeinde nach Zürich gezogen? Eine Vorsprache vor Ort ist ausschliesslich mit vorheriger Terminvereinbarung möglich. Zuzug aus dem Ausland Sie sind aus dem Ausland nach Zürich gezogen? Für die Anmeldung aus dem Ausland müssen Sie einen Termin vereinbaren. Die Anmeldung findet persönlich beim Personenmeldeamt Zürich Süd statt.';
 const r=await civicEvidence('registration',{retriever:{retrieve:async()=>({status:'retrieved',sourceId:'fixture',url:'https://www.stadt-zuerich.ch/test',doc:{blocks:[{text}],links:[]}})}});
 assert.ok(!r.facts.some(f=>f.id==='deadline'));const office=r.facts.find(f=>f.id==='abroad_appointment');assert.equal(office.conditions,'Zuzug aus dem Ausland');assert.ok(!r.facts.find(f=>f.id==='domestic_appointment').text.includes('Süd'));
});

test('moving background does not turn a single waste or debt question into two tasks',async()=>{
 const r=await make()({question:'Wie viel kostet ein Betreibungsauszug nach meinem Umzug nach Zürich?'});assert.equal(r.status,'ok');assert.equal(r.missingFields.length,0);
});
test('intra-city source provides its own deadline and northern/western offices',async()=>{
 const text='Die Meldepflicht Ihrer Adressänderung beträgt 14 Tage ab Umzug. Sie sind bereits in der Stadt Zürich angemeldet. Sie sind volljährig und handlungsfähig Die Adressänderung können Sie uns online frühestens 30 Tage vor Einzug melden. Das ist ab Mai 2026 nur noch mit Termin an den Standorten Personenmeldeamt Zürich Nord oder Personenmeldeamt Zürich West möglich.';
 const local=await civicEvidence('registration_local',{retriever:{retrieve:async()=>({status:'retrieved',url:'https://www.stadt-zuerich.ch/umzug',doc:{blocks:[{text}],links:[]}})}});
 const g=make({evidence:async topic=>topic==='registration_local'?local:await evidence(topic)});
 for(const question of ['Ich ziehe innerhalb der Stadt Zürich um. Wie melde ich das?','Ich bin bereits in Zürich angemeldet und ziehe innerhalb der Stadt um.']){
  const r=await g({question});assert.equal(r.status,'ok');assert.match(r.answer,/Zürich Nord.*Zürich West/);assert.doesNotMatch(r.answer,/Zürich Süd|bisherigen Wohngemeinde ab/);assert.ok(r.actions.some(a=>a.url.endsWith('/umzug')));
 }
});

test('known Swiss nationality does not get foreign migration fees',async()=>{const r=await make()({question:'Ich bin Schweizer und ziehe aus der Schweiz nach Zürich. Was kostet die Anmeldung?'});assert.match(r.answer,/40 Franken/);assert.doesNotMatch(r.answer,/migrationsamtlich/);assert.equal(r.claims[0].conditions,'Zuzug aus einer Schweizer Gemeinde; pro erwachsene Person');});

test('selecting one of several tasks retains the already supplied city and origin',async()=>{
 const r=await conversation(make(),['Ich ziehe aus dem Ausland nach Zürich, möchte mich anmelden und Glas entsorgen.','Anmeldung']);assert.equal(r.status,'ok');assert.equal(r.context.municipality,'Stadt Zürich');assert.match(r.answer,/Zürich Süd/);
});

test('unrelated follow-up is not answered with old registration rules',async()=>{const r=await conversation(make(),['Ich ziehe aus der Schweiz nach Zürich und möchte mich anmelden.','Welche Impfungen brauche ich nach dem Umzug?']);assert.equal(r.status,'out_of_scope');assert.equal(r.claims.length,0);assert.doesNotMatch(r.answer,/14 Tagen/);});

for(const confirmation of ['Stadt Zürich','Zürich','Ja'])test('municipality clarification preserves original street and material: '+confirmation,async()=>{
 const now=()=>Date.parse('2026-09-24T12:00:00Z');const data={...readGeoData(),downloadedAt:'2026-09-24T00:00:00Z'};
 const g=make({now,waste:createWasteAssistant({now,readData:()=>data})});
 let r=await g({question:'Wo kann ich beim Bleicherweg in der nähe glas entsorgen ?'});assert.deepEqual(r.missingFields,['municipality']);
 r=await g({question:confirmation,contextToken:r.contextToken});assert.deepEqual(r.missingFields,['houseNumber']);assert.equal(r.context.street,'Bleicherweg');assert.equal(r.context.material,'Glas');
 r=await g({question:'20',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.equal(r.origin.address,'Bleicherweg 20');assert.equal(r.results[0].address,'Am Schanzengraben 25');
});

test('cardboard request retains material and postcode after the city is clarified',async()=>{
 const now=()=>Date.parse('2026-09-24T12:00:00Z');const data={...readGeoData(),downloadedAt:'2026-09-24T00:00:00Z'};
 const g=make({now,waste:createWasteAssistant({now,readData:()=>data,preparation:async()=>({results:[]})})});
 const r=await conversation(g,['Wann kann ich Karton in 8002 rausstellen?','Stadt Zürich']);
 assert.equal(r.status,'partial');assert.equal(r.calendar.postalCode,'8002');assert.ok(r.calendar.dates.length);assert.match(r.answer,/Bereitstellzeit.*nicht/);
});

test('reported Dufourstrasse case: Büchsen use official metal sites after a spelling and house-number clarification',async()=>{
 const now=()=>Date.parse('2026-09-25T06:30:00Z');const data={...readGeoData(),downloadedAt:'2026-09-24T18:10:53Z'};
 const g=make({now,waste:createWasteAssistant({now,readData:()=>data})});
 let r=await g({question:'ich wohne bei der douforstrasse in Zürich wo kann ich Büchsen entsorgen ?'});
 assert.equal(r.status,'needs_clarification');assert.deepEqual(r.options,['Dufourstrasse']);assert.deepEqual(r.missingFields,['street']);assert.equal(r.context.material,'Metall');assert.equal(r.results.length,0);assert.ok(!r.cards.length);
 r=await g({question:'Dufourstrasse',contextToken:r.contextToken});assert.deepEqual(r.missingFields,['houseNumber']);assert.equal(r.context.material,'Metall');
 r=await g({question:'20',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.equal(r.origin.address,'Dufourstrasse 20');assert.equal(r.results[0].address,'Mühlebachstrasse 35');assert.equal(r.sortMode,'straight_line');assert.ok(r.results.every(p=>p.materials.includes('Metall')&&Number.isFinite(p.distanceMeters)&&p.mapUrl.startsWith('https://www.openstreetmap.org/')));
});

test('reported foreign-national follow-up keeps domestic origin and answers with matching documents and costs',async()=>{
 const g=make();let r=await g({question:'Wo kann ich mich in Zürich anmelden wenn ich von einem anderen Kanton komme?'});
 assert.equal(r.status,'ok');assert.equal(r.context.residenceOrigin,'switzerland');
 r=await g({question:'ich bin Ausländer muss ich was beachten?',contextToken:r.contextToken});
 assert.equal(r.status,'ok');assert.equal(r.context.nationality,'foreign');assert.equal(r.context.residenceOrigin,'switzerland');
 for(const term of ['Ausländerausweis','Pass','Mietvertrag','Krankenkassenkarte','Zivilstandspapiere','40 Franken','Migrationsamt'])assert.match(r.answer,new RegExp(term,'i'));
 assert.ok(r.claims.some(c=>c.id==='foreign_permit'&&c.sourceUrl));assert.ok(r.sourceLinks.some(x=>x.url.includes('stadt-zuerich.ch')));
 assert.doesNotMatch(r.answer,/Zuzug aus dem Ausland nach Zürich: Das solltest/);
 r=await g({question:'bin ausländer was beachten?',contextToken:r.contextToken});assert.match(r.answer,/Ausländerausweis/);
});

test('foreign nationality without move origin asks where the person lived before moving',async()=>{
 const r=await make()({question:'Ich bin Ausländer und möchte mich in der Stadt Zürich anmelden. Was beachten?'});
 assert.deepEqual(r.missingFields,['residenceOrigin']);
});

test('arrival from abroad with foreign citizenship gets the corresponding documents and appointment',async()=>{
 const r=await make()({question:'Ich ziehe aus dem Ausland nach Zürich, bin Ausländer. Was muss ich beachten?'});
 assert.equal(r.status,'ok');assert.equal(r.context.residenceOrigin,'abroad');
 assert.match(r.answer,/Zürich Süd/);assert.match(r.answer,/Arbeitsvertrag oder Studienbestätigung/);assert.match(r.answer,/migrationsamtliche Gebühren/i);
 assert.doesNotMatch(r.answer,/Melde dich bei der bisherigen Wohngemeinde ab/);
});

const nextSteps=async()=>({available:true,facts:[
 {id:'steps_utilities',text:'Die Anmeldung beim Personenmeldeamt meldet Strom und Wasser nicht automatisch um.',conditions:'Zuzug',sourceId:'zh-first-steps',passageId:'steps_utilities'},
 {id:'steps_car',text:'Bei Zuzug aus anderem Kanton: Kontrollschilder und Ausweise innert 14 Tagen persönlich abholen.',conditions:'Fahrzeugbesitz',sourceId:'zh-first-steps',passageId:'steps_car'},
 {id:'steps_insurance_abroad',text:'Beim Zuzug aus dem Ausland: drei Monate für den Abschluss der Krankenversicherung.',conditions:'Ausland',sourceId:'zh-first-steps',passageId:'steps_insurance_abroad'},
 {id:'steps_dog',text:'Hund über drei Monate innert zehn Tagen anmelden.',conditions:'Hundebesitz',sourceId:'zh-first-steps',passageId:'steps_dog'},
 {id:'steps_self_employed',text:'Selbständigerwerbende melden sich bei der SVA Zürich.',conditions:'Selbständigkeit',sourceId:'zh-first-steps',passageId:'steps_self_employed'}
 ],sources:[{id:'zh-first-steps',title:'Erste Schritte',url:'https://www.stadt-zuerich.ch/de/lebenslagen/neu-in-zuerich/erste-schritte.html',passages:['steps_utilities','steps_car','steps_insurance_abroad','steps_dog','steps_self_employed'].map(id=>({id,text:id}))}]});

test('domestic move checklist combines registration with conditional first-step evidence',async()=>{
 const r=await make({firstSteps:nextSteps})({question:'Ich ziehe aus einem anderen Kanton nach Zürich. Was muss ich beim Zuzug alles beachten?'});
 assert.equal(r.status,'ok');assert.match(r.answer,/bisherigen Wohngemeinde/);assert.match(r.answer,/Strom und Wasser/);
 assert.match(r.answer,/Kontrollschilder/);assert.doesNotMatch(r.answer,/drei Monate für den Abschluss der Krankenversicherung/);
 assert.ok(r.claims.some(c=>c.id==='steps_utilities'&&c.sourceUrl.includes('stadt-zuerich.ch')));
});
test('follow-up about electricity uses first-step evidence without printing unrelated checklist items',async()=>{
 const g=make({firstSteps:nextSteps});let r=await g({question:'Ich ziehe aus Bern nach Zürich. Wie melde ich mich an?'});
 r=await g({question:'Muss ich Strom und Wasser ebenfalls anmelden?',contextToken:r.contextToken});
 assert.equal(r.status,'ok');assert.match(r.answer,/Strom und Wasser/);assert.doesNotMatch(r.answer,/Hund über|Kontrollschilder|drei Monate für/);
});
test('missing first-steps page does not become an invented checklist',async()=>{
 const r=await make({firstSteps:async()=>({available:false})})({question:'Ich ziehe aus Bern nach Zürich, was muss ich alles beachten?'});
 assert.equal(r.status,'partial');assert.match(r.limitations.join(' '),/nicht abrufbar/);assert.doesNotMatch(r.answer,/Hund über drei Monate|Kontrollschilder/);
});
test('first-steps parser accepts only clauses actually present in the source',async()=>{
 const text='Ihre Anmeldung beim Personenmeldeamt ersetzt nicht die Anmeldung bei der Strom- und Wasserversorgung. Bei einem Umzug innerhalb des Kantons Zürich können Sie Ihre neue Adresse beim Strassenverkehrsamt melden. Ansonsten müssen Sie die neuen Kontrollschilder und Ausweise innert 14 Tagen persönlich abholen.';
 const retriever={retrieve:async()=>({status:'retrieved',url:'https://www.stadt-zuerich.ch/de/lebenslagen/neu-in-zuerich/erste-schritte.html',title:'Erste Schritte',doc:{blocks:[{text}]}})};
 const r=await firstStepsEvidence({retriever});assert.deepEqual(r.facts.map(f=>f.id),['steps_utilities','steps_car']);assert.equal(r.sources[0].passages.length,2);
});

const batterySource=async()=>({status:'retrieved',url:'https://www.stadt-zuerich.ch/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/verkaufsstelle.html',title:'Zurück an die Verkaufsstelle',retrievedAt:'2026-09-25T07:00:00Z',doc:{blocks:[{text:'Grundsätzlich sind die Händler verpflichtet, die nachfolgenden Produkte und Geräte, die sie selbst vertreiben, zurückzunehmen. Im Kaufpreis von Batterien, PET-Getränkeflaschen und Elektrogeräten ist eine vorgezogene Entsorgungs- und Recyclinggebühr enthalten. Deshalb ist der Fachhandel verpflichtet, diese Produkte und Geräte kostenlos zurückzunehmen.'}]}});
test('reported Seefeldstrasse conversation: nearest batteries never becomes a foreign municipality or metal-container claim',async()=>{
 const g=make({waste:createWasteAssistant({batterySource,batterySites:async()=>null})});let r;
 for(const question of ['ich bin bei der Seefeldstrasse und möchte gerne Büchsen entsorgen was soll ich tun?','Stadt Zürich','102'])r=await g({question,contextToken:r?.contextToken});
 assert.equal(r.status,'ok');assert.equal(r.origin.address,'Seefeldstrasse 102');
 r=await g({question:'ich möchte gerne Batterien entsorgen wo kann ich das am nächsten machen',contextToken:r.contextToken});
 assert.equal(r.status,'partial');assert.equal(r.context.municipality,'Stadt Zürich');assert.equal(r.context.material,'Batterien');assert.equal(r.context.address,'Seefeldstrasse 102');
 assert.match(r.answer,/kostenlos zurückgeben/);assert.match(r.answer,/nicht verlässlich bestimmen/);assert.doesNotMatch(r.answer,/genannte andere Gemeinde/);assert.equal(r.results.length,0);assert.ok(r.sourceLinks[0].passages.length===2);
 r=await g({question:'Und Glas am nächsten?',contextToken:r.contextToken});assert.equal(r.status,'ok');assert.equal(r.origin.address,'Seefeldstrasse 102');assert.ok(r.results.every(x=>x.materials.includes('Glas')));
});
for(const phrase of ['am nächsten','die nächste Sammelstelle','nächstgelegene Sammelstelle','nachher'])test('location parsing uses complete words: '+phrase,async()=>{
 const g=make();let r=await g({question:'Glas an der Seefeldstrasse 102 in Zürich entsorgen'});
 r=await g({question:'Glas entsorgen '+phrase,contextToken:r.contextToken});assert.equal(r.status,'ok');assert.equal(r.origin.address,'Seefeldstrasse 102');
});

for(const material of ['Büchsen','Dosen','Alu','Kleinmetall'])test('common metal terms produce a location clarification rather than raw source paragraphs: '+material,async()=>{
 const r=await make()({question:`Wo kann ich ${material} an der Dufourstrasse in Zürich entsorgen?`});
 assert.equal(r.status,'needs_clarification');assert.deepEqual(r.missingFields,['houseNumber']);assert.equal(r.context.material,'Metall');assert.ok(!r.cards.length);
});

// V7.6: field-based resolution, exercised through the same entry point as any MCP host.
for(const yes of ['ja','ja genau','korrekt','Stadt Zürich','Zürich'])test('pending city confirmation accepts typed affirmative: '+yes,async()=>{
 const g=make();let r=await g({question:'Wo kann ich bei der Seefeldstrasse Büchsen entsorgen?'});
 assert.equal(r.pending_question.field,'city_confirmation');assert.ok(r.pending_question.reason);
 r=await g({question:yes,contextToken:r.contextToken});assert.equal(r.pending_question.field,'house_number');assert.equal(r.context.street,'Seefeldstrasse');
});
for(const number of ['102','Nr. 102','die 102','es ist die 102','Hausnummer 102'])test('pending house number uses typed numeric grammar: '+number,async()=>{
 const r=await conversation(make(),['Büchsen nahe Seefeldstrasse in Zürich',number]);
 assert.equal(r.status,'ok');assert.equal(r.pending_question,null);assert.equal(r.origin.address,'Seefeldstrasse 102');assert.ok(r.results.every(p=>p.materials.includes('Metall')));
});
for(const [reply,origin]of [['doch aus Deutschland','abroad'],['nein, aus Deutschland','abroad'],['nö, aus Basel','switzerland'],['aus Bern','switzerland'],['Deutschland','abroad']])test('pending origin accepts corrections without inferring nationality: '+reply,async()=>{
 const r=await conversation(make(),['Ich möchte mich in Zürich anmelden.',reply]);
 assert.equal(r.status,'ok');assert.equal(r.context.residenceOrigin,origin);assert.equal(r.context.nationality,null);assert.equal(r.pending_question,null);
});
test('origin correction changes procedure but preserves an independently confirmed nationality',async()=>{
 const r=await conversation(make(),['Ich bin Schweizer und ziehe aus Bern nach Zürich. Wo muss ich mich anmelden?','doch aus Deutschland']);assert.equal(r.context.residenceOrigin,'abroad');assert.equal(r.context.nationality,'swiss');assert.doesNotMatch(r.answer,/bisherigen Wohngemeinde ab/);
});
test('material correction retains confirmed coordinates and resolves the next calendar step',async()=>{
 const preparation=async()=>({results:[{title:'Kartonregel',url:'https://www.stadt-zuerich.ch/karton',passages:[{text:'Am Sammeltag vor 7 Uhr bereitstellen.'}]}]});
 const g=make({waste:createWasteAssistant({preparation})});let r=await g({question:'Büchsen nahe Seefeldstrasse 102 in Zürich'});
 r=await g({question:'nein, ich meinte Karton',contextToken:r.contextToken});assert.equal(r.context.material,'Karton');assert.equal(r.origin.address,'Seefeldstrasse 102');assert.ok(r.calendar.dates.length);assert.equal(r.pending_question,null);
});
test('unknown numeric or yes answer never fabricates a missing street or origin',async()=>{
 const g=make();let r=await g({question:'Anmeldung in Zürich'});r=await g({question:'ja',contextToken:r.contextToken});assert.equal(r.pending_question.field,'origin');assert.equal(r.context.residenceOrigin,null);
 r=await g({question:'102',contextToken:r.contextToken});assert.equal(r.pending_question.field,'origin');assert.equal(r.context.residenceOrigin,null);
});
test('conflicting origin values remain an open question',async()=>{
 const r=await conversation(make(),['Anmeldung in Zürich','aus Deutschland und aus der Schweiz']);assert.equal(r.status,'needs_clarification');assert.equal(r.pending_question.field,'origin');assert.equal(r.context.residenceOrigin,null);
});
test('a new topic supersedes an outstanding field and does not become its value',async()=>{
 const r=await conversation(make(),['Büchsen an der Seefeldstrasse in Zürich','Wie viel kostet ein Betreibungsauszug?']);assert.equal(r.topic,'debt_extract');assert.equal(r.status,'ok');assert.equal(r.pending_question,null);assert.match(r.answer,/17 Franken/);
});
test('street suggestion can be confirmed without restating the suggested street',async()=>{
 const r=await conversation(make(),['Büchsen an der douforstrasse in Zürich','ja']);assert.equal(r.pending_question.field,'house_number');assert.equal(r.context.street,'Dufourstrasse');
});
test('nationality answer rejects a residence-origin interpretation',async()=>{
 const r=await conversation(make(),['Ich ziehe aus der Schweiz nach Zürich. Welche Unterlagen brauche ich?','Ich bin kein Schweizer']);assert.equal(r.context.nationality,'foreign');assert.equal(r.context.residenceOrigin,'switzerland');assert.match(r.answer,/Ausländerausweis/);
});
