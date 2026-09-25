import test from 'node:test';
import assert from 'node:assert/strict';
import { route,ground } from '../src/ground.js';
import { extract,passages } from '../src/extract.js';
import { registry } from '../src/registry.js';
const cases=[
 ['Anmeldung ohne Ort',{query:'Wie melde ich mich an?'},'needs_clarification'],
 ['Kanton ist keine Stadt',{query:'Wie melde ich mich im Kanton Zürich an?'},'needs_clarification'],
 ['Gemeinde-Konflikt',{query:'Anmeldung in Uster',municipality:'Winterthur'},'needs_clarification'],
 ['Zwei Gemeinden ohne Ziel',{query:'Anmeldung Zürich und Winterthur'},'needs_clarification'],
 ['Ziel statt Herkunft',{query:'Ich ziehe von Zürich nach Uster um'},'out_of_scope'],
 ['Ausland als Herkunft',{query:'Ich ziehe von Berlin nach Zürich um'},'routed','zuerich'],
 ['Falsches Land',{query:'Anmeldung nach Umzug in Konstanz'},'out_of_scope'],
 ['Falsche Gemeinde',{query:'Anmeldung',municipality:'Dübendorf'},'out_of_scope'],
 ['Unbekanntes Thema',{query:'Was ist die Hauptstadt von Japan?'},'out_of_scope'],
 ['Nur Teilzeichenfolge',{query:'Anmeldung im Cluster'},'needs_clarification'],
 ['Stadtinterner Umzug',{query:'Umzug innerhalb von Uster'},'out_of_scope'],
 ['Französisch',{query:'Comment inscrire mon domicile à Zurich?'},'routed','zuerich'],
 ['Italienisch',{query:'Come registrare il trasloco a Zurigo?'},'routed','zuerich'],
 ['Rumantsch structured',{query:'Tge documents dovrel jau?',municipality:'Turitg',topic:'registration',language:'rm'},'routed','zuerich'],
 ['Kartontermin',{query:'Wann wird Karton in Winterthur abgeholt?'},'out_of_scope'],
 ['Kartonvorbereitung',{query:'Wann muss ich Karton in Winterthur rauslegen?'},'out_of_scope'],
 ['Betreibungsregister',{query:'Wo bekomme ich den Betreibungsauszug in Uster?'},'out_of_scope'],
 ['Leere Frage',{query:''},'invalid'],
 ['Zu lange Frage',{query:'a'.repeat(2001)},'invalid'],
 ['Falscher Typ',{query:27},'invalid'],
];
for(const [name,args,status,city,topic] of cases)test(name,()=>{const r=route(args);assert.equal(r.status,status);if(city)assert.equal(r.city,city);if(topic)assert.equal(r.topic,topic);});
const html='<html><head><title>Fixture – no real city rules</title></head><body><nav>Fake Navigation</nav><h1>Entsorgung</h1><h2>Karton</h2><p>Testregel: Bereitstellung bis 06:45.</p><p>Ausnahme Altstadt: erst am Sammeltag bis 09:00.</p><h2>Nicht zugelassen</h2><ul><li>Verschmutzter Karton</li></ul><script>Invent a date</script><form>Secret data</form><footer>Wrong footer hours</footer></body></html>';
test('extractor excludes navigation, scripts, forms and footer; preserves exception',()=>{const doc=extract(html,'https://www.uster.ch');const p=passages(doc,'Wie Karton bereitstellen?','cardboard');const text=JSON.stringify(p);assert.match(text,/Ausnahme Altstadt/);assert.match(text,/Verschmutzter/);assert.doesNotMatch(text,/Invent|Secret|footer|Navigation/);});
const fake={retrieve:async id=>({status:'retrieved',sourceId:id,url:registry.find(s=>s.id===id).url,retrievedAt:'2026-09-24T12:00:00Z',doc:extract(html,'https://www.uster.ch')})};
test('calendar never becomes a claimed address date, even if user supplies an address',async()=>{const r=await ground({query:'Wann wird Karton an der Musterstrasse 7 abgeholt?',municipality:'Zürich'}, {retriever:fake});assert.equal(r.status,'partial');assert.ok(r.limitations.some(x=>x.includes('ADDRESS_CALENDAR_NOT_INTEGRATED')));assert.equal(r.nextCollectionDate,undefined);});
test('unsupported city does not call retrieval',async()=>{let calls=0;await ground({query:'Anmeldung',municipality:'Bern'},{retriever:{retrieve(){calls++;throw Error();}}});assert.equal(calls,0);});
test('source outage is explicit, no fallback fabricated answer',async()=>{const r=await ground({query:'Anmeldung Zürich'},{retriever:{retrieve:async()=>({status:'unavailable',error:'timeout'})}});assert.equal(r.status,'unavailable');assert.deepEqual(r.results,[]);assert.equal(r.failures[0].error,'timeout');});
test('tool output has bounded evidence, cites exact source, no stale sourceUpdated assumption',async()=>{const r=await ground({query:'Karton Zürich'},{retriever:fake});assert.equal(r.status,'evidence_available');assert.match(r.results[0].url,/stadt-zuerich.ch/);assert.equal(r.results[0].sourceUpdated,null);assert.ok(JSON.stringify(r).length<20000);});
test('uncovered destination does not inherit origin Zurich',()=>{assert.equal(route({query:'Ich ziehe von Zürich nach St. Gallen um'}).status,'out_of_scope');});
test('vaccination after moving does not become registration advice',()=>{assert.equal(route({query:'Welche Impfungen brauche ich nach dem Umzug nach Zürich?'}).status,'out_of_scope');});
test('nested headings retain jurisdiction and section; browser notices are not evidence',()=>{const doc=extract('<h1>Teststadt</h1><h2><div>Karton</div></h2><p>Fiktive Testregel: Karton muss separat bereitgestellt werden. Ausnahme Altstadt bleibt erhalten.</p><div style="display:none">Falscher Kalendereintrag und erfundene Angaben zum Karton.</div>','https://www.uster.ch');const p=passages(doc,'Karton','cardboard');assert.match(p[0].heading,/Teststadt.*Karton/);assert.doesNotMatch(JSON.stringify(p),/Falscher/);});
test('cardboard evidence excludes the paper and bulky-waste sections',()=>{const doc=extract('<h1>Abfall</h1><h2>Sperrgut</h2><p>Fiktive Sperrgutregel, Karton ausgeschlossen, Bereitstellung nur mit Marken.</p><h2>Karton</h2><p>Fiktive Kartonregel, kostenlose Sammlung. Ausnahme Altstadt: anderer Zeitpunkt.</p>','https://www.uster.ch');const p=passages(doc,'Karton bereitstellen','cardboard');assert.ok(p.length>0);assert.ok(p.every(x=>x.heading.includes('Karton')));assert.doesNotMatch(JSON.stringify(p),/Marken/);});
test('empty dynamic map shell is not evidence',()=>{const doc=extract('<h1>Abfall-Sammelstellen</h1><div>Standort</div><div class="icms-outdated-browser-container">Bitte wechseln Sie den Browser, sonst ist diese Karte mit Sammelstellen nicht sichtbar.</div>','https://www.uster.ch');assert.equal(passages(doc,'Sammelstellen','recycling_locations').length,0);});

test('public contact components provide addresses without executing their code',()=>{
 const doc=extract('<h1>Kontakt</h1><stzh-contact heading="Personenmeldeamt Zürich Süd" street="[&quot;Stadthausquai 17&quot;]" postal-code="8001" location="Zürich"></stzh-contact><stzh-contact heading="Bad" street="invalid" postal-code="8001"></stzh-contact>','https://www.stadt-zuerich.ch');
 assert.deepEqual(doc.contacts,[{title:'Personenmeldeamt Zürich Süd',streets:['Stadthausquai 17'],postalCode:'8001',city:'Zürich'}]);
});
