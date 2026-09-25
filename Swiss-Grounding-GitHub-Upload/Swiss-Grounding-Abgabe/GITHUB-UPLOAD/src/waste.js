import {randomBytes} from 'node:crypto';
import {readGeoData,snapshotProblem,normalized,distanceMeters,SOURCE_LINKS} from './geo-data.js';
import {ground} from './ground.js';
import {batteryLocations,batterySearchAction} from './battery.js';
import {defaultRetriever} from './retrieve.js';

const materialWords=[['Glas',/\b(?:glas|glass|verre|vetro)\b/],['Metall',/\b(?:metall|kleinmetall|alu|aluminium|dosen|konservendosen|buchsen|buechsen)\b/],['Oel',/\b(?:ol|oel|altol)\b/],['Textilien',/\b(?:textilien|kleider|kleidung)\b/],['Karton',/\b(?:karton|cardboard|carton)\b/],['Batterien',/\bbatterien?\b/]];
const cityNames={zurich:'Stadt Zürich',winterthur:'Stadt Winterthur',uster:'Stadt Uster'};
const unsupported=/\b(?:pet|plastik|kunststoff|akkus?|elektro|sperrgut)\b/;
const textOf=q=>normalized(q).replace(/str\.(?=\s|$)/g,'strasse');
export function wasteIntent(question){return /glas|karton|cardboard|sammelstell|entsorgungsstell|altol|textilien|metall|kleinmetall|\b(?:batterien?|buchsen|buechsen|dosen|konservendosen|alu|aluminium|pet|plastik)\b/.test(normalized(question));}
export function wasteLocationResolution(question,material){
 const q=normalized(question);
 if(material==='Batterien')return 'none';
 if(material==='Karton')return /\b(?:wie|was)\b/.test(q)&&!/wann|termin|abhol|nachste.*sammlung/.test(q)?'none':'postcode';
 return 'address';
}
function editDistance(a,b){
 if(Math.abs(a.length-b.length)>2)return 3;
 let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=0;i<a.length;i++){
  const next=[i+1];for(let j=0;j<b.length;j++)next[j+1]=Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1));
  row=next;
 }
 return row[b.length];
}
function streetSuggestions(input,streets){
 const suffix=input.match(/(strasse|gasse|weg|quai|platz)$/)?.[1];
 if(!suffix||input.length-suffix.length<5)return [];
 const near=[...streets.keys()].filter(s=>s.endsWith(suffix)&&editDistance(input,s)<=2);
 // Never guess an address from multiple similar street names.
 return near.length===1?[streets.get(near[0])[0].street]:[];
}
function sources(ids,data){return SOURCE_LINKS.filter(s=>ids.includes(s.id)).map(s=>({...s,retrievedAt:data.downloadedAt}));}
function plainDate(date){const [y,m,d]=date.split('-');return `${d}.${m}.${y}`;}
function zurichClock(now){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)};}
function mapPoint(s){return {...s,mapUrl:`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=18/${s.lat}/${s.lon}`};}
const limitText='Entfernungen sind gerundete Luftlinien zwischen amtlichen Koordinaten, keine Fusswege oder Gehzeiten. Adresspunkte liegen nicht zwingend am Hauseingang. Öffnungszeiten und aktuelle Betriebsstörungen sind nicht geprüft.';

export function createWasteAssistant({readData=readGeoData,now=Date.now,batterySource=()=>defaultRetriever.retrieve('zh-retail-return'),batterySites=batteryLocations,preparation=()=>ground({query:'Karton am Sammeltag vor 7 Uhr bereitstellen bündeln',municipality:'Zürich',topic:'cardboard'})}={}){
 const contexts=new Map();let indexedData,index;
 function addressIndex(data){if(indexedData!==data){indexedData=data;index=new Map();for(const a of data.addresses){const key=textOf(a.street);if(!index.has(key))index.set(key,[]);index.get(key).push(a);}}return index;}
 return async function answer({question,contextToken}={}){
  const clock=now();for(const [k,v]of contexts)if(clock-v.time>3600000)contexts.delete(k);
  if(typeof question!=='string'||!question.trim()||question.length>2000)return {schema:'waste-guidance-v1',status:'invalid',handled:true,answer:'Bitte eine Frage mit höchstens 2000 Zeichen stellen.',results:[]};
  const prior=contextToken&&contexts.get(contextToken);let state=prior?{...prior.state}:{};
  const q=textOf(question);
  const freshMaterial=materialWords.filter(([,rx])=>rx.test(q)).map(([m])=>m);
  if(!contextToken&&!wasteIntent(question)&&!prior||!wasteIntent(question)&&/anmeld|betreib|steuer|schule|umzug|krankenkasse/.test(q))return {schema:'waste-guidance-v1',status:'out_of_scope',handled:false,results:[]};
  const data=readData();
  function finish(status,answer,extra={}){
   const token=randomBytes(24).toString('hex');if(contexts.size>=200)contexts.delete(contexts.keys().next().value);
   contexts.set(token,{time:clock,state:{...state}});
   const confirmed=state.confirmedOrigin&&state.confirmedOrigin.street===state.street&&normalized(state.confirmedOrigin.number)===normalized(state.number)&&state.confirmedOrigin.postalCode===state.postalCode?state.confirmedOrigin:null;
   return {schema:'waste-guidance-v1',handled:true,status,answer,message:answer,contextToken:token,locationResolution:wasteLocationResolution(question,state.material),context:{municipality:state.city?cityNames[state.city]:null,material:state.material,street:state.street,houseNumber:state.number,postalCode:state.postalCode,district:state.district,address:confirmed?.address||null,addressStatus:confirmed?'confirmed':'not_confirmed'},results:[],sourceLinks:[],limitations:[],...extra};
  }
  function ask(field,message,options=[],extra={}){state.awaiting=field;return finish('needs_clarification',message,{missingFields:[field],nextQuestion:message,options,...extra});}
  if(contextToken&&!prior)return ask('location','Der vorherige Ortskontext ist abgelaufen. Bitte Material und Ort nochmals nennen.');
  const issue=snapshotProblem(data,clock);if(issue)return finish('unavailable',issue);
  if(freshMaterial.length>1)return ask('material','Bitte zuerst ein Material wählen. Für Glas und Karton gelten unterschiedliche Wege.',freshMaterial);
  if(unsupported.test(q))return finish('out_of_scope','Für dieses Material fehlen in diesem Adapter verlässliche Annahmedaten. Aus Glas-Sammelstellen leite ich keine PET- oder Kunststoffannahme ab.');
  if(freshMaterial.length)state.material=freshMaterial[0];
  const cities=Object.keys(cityNames).filter(c=>new RegExp('\\b'+c+'\\b').test(q.replace(/kanton\s+zurich/g,'')));
  if(cities.length>1)return ask('municipality','Welche Stadt meinst du für die Entsorgung?',['Stadt Zürich']);
  if(cities.length===1){if(state.city&&state.city!==cities[0])for(const f of ['street','number','postalCode','district'])delete state[f];state.city=cities[0];}
  if(/\b(?:bern|basel|konstanz|dietikon|dubendorf|duebendorf|luzern|lugano)\b/.test(q)){for(const f of ['city','street','number','postalCode','district'])delete state[f];return finish('out_of_scope','Die genaue Standort- und Kalendersuche dieses Adapters ist auf die Stadt Zürich begrenzt.');}
  const newTown=q.match(/\bin\s+(?:der\s+stadt\s+|stadt\s+)?([\p{L}-]+)/u)?.[1];
  if(newTown&&!cityNames[newTown]&&!['der','die','den','einer','einem','meiner','meinem','nahe','kreis','diesem','dieser','welchem','welcher'].includes(newTown)&&!newTown.match(/strasse|gasse|weg|quai|platz/)){for(const f of ['city','street','number','postalCode','district'])delete state[f];return ask('municipality',`Welchen Ort meinst du mit „${newTown}“? Die präzise Standortsuche ist für die Stadt Zürich verfügbar.`);}
  const districtMatch=q.match(/\bkreis\s*(\d{1,2})\b/),postalMatch=q.match(/\b(8\d{3})\b/);
  const streets=[...addressIndex(data).keys()].filter(s=>{const at=q.indexOf(s);return at>=0&&(at===0||!/\p{L}/u.test(q[at-1]))&&!/\p{L}/u.test(q[at+s.length]||'');}).sort((a,b)=>b.length-a.length);
  const selectedStreet=streets[0];
  if(selectedStreet){
   for(const f of ['number','postalCode','district'])delete state[f];
   state.street=addressIndex(data).get(selectedStreet)[0].street;
   const suffix=q.slice(q.indexOf(selectedStreet)+selectedStreet.length);const n=suffix.match(/^\s*(?:(?:nr\.?|hausnummer)\s*)?(\d+[a-z]?)\b/);if(n&&!/^8\d{3}$/.test(n[1]))state.number=n[1];
  }else if(districtMatch){for(const f of ['street','number','postalCode'])delete state[f];}
  else if(postalMatch&&prior?.state.awaiting!=='postalCode'){for(const f of ['street','number','district'])delete state[f];}
  if(districtMatch){state.district=Number(districtMatch[1]);if(state.district<1||state.district>12)return ask('district','Welchen Zürcher Stadtkreis von 1 bis 12 meinst du?');}
  if(postalMatch)state.postalCode=postalMatch[1];
  if(prior?.state.awaiting==='houseNumber'&&!selectedStreet&&!districtMatch&&!postalMatch){const n=q.match(/^(?:(?:hausnummer|nummer|nr\.?)\s*)?(\d+[a-z]?)$/);if(n)state.number=n[1];}
  const unknownStreet=q.match(/\b([\p{L}-]+(?:strasse|gasse|weg|quai|platz))\b/u);
  if(!selectedStreet&&unknownStreet&&wasteLocationResolution(question,state.material)!=='none'){
   delete state.street;delete state.number;delete state.postalCode;delete state.district;
   const suggestions=streetSuggestions(unknownStreet[1],addressIndex(data));
   const calendar=state.material==='Karton';
   return ask('street',suggestions.length?`Die Strasse „${unknownStreet[1]}“ finde ich im amtlichen Adressbestand nicht. Meinst du ${suggestions[0]} in Zürich? ${calendar?'Bitte bestätige die Strasse oder nenne deine Postleitzahl.':'Bitte bestätige die Strasse und nenne danach deine Hausnummer.'}`:`Die Strasse „${unknownStreet[1]}“ kann ich im amtlichen Zürcher Adressbestand nicht eindeutig zuordnen. ${calendar?'Nenne bitte deine Postleitzahl für den Kartonkalender.':'Bitte prüfe den Strassennamen und nenne die Hausnummer.'}`,suggestions);
  }
  if(!state.city)return ask('municipality',state.district?`Meinst du Kreis ${state.district} in der Stadt Zürich?`:'In welcher Stadt möchtest du das entsorgen?',state.district?['Stadt Zürich']:['Stadt Zürich']);
  if(state.city!=='zurich')return finish('out_of_scope',`Für ${cityNames[state.city]} sind in diesem Adapter noch keine präzisen Standorte und Abholtermine integriert. Nutze die amtliche Entsorgungsinformation der Stadt.`,{sourceLinks:[{title:cityNames[state.city]+' · Entsorgung',url:state.city==='uster'?'https://www.uster.ch/entsorgung/3849':'https://stadt.winterthur.ch/themen/bauen-umwelt/abfall-recycling-sauberkeit/abfallkalender'}]});
  if(!state.material)return ask('material','Was möchtest du entsorgen?',['Glas','Karton','Metall','Öl','Textilien']);
  if(state.material==='Batterien'){
   let doc;try{doc=await batterySource();}catch{doc={status:'unavailable'};}
   const full=(doc.doc?.blocks||[]).map(b=>b.text).join(' ').replace(/\s+/g,' ');
   const hit=full.match(/Im Kaufpreis von Batterien[\s\S]{0,350}?kostenlos zurückzunehmen\./);
   const condition=full.match(/Grundsätzlich sind die Händler verpflichtet,[\s\S]{0,220}?die sie selbst vertreiben, zurückzunehmen\./);
   const url='https://www.stadt-zuerich.ch/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/verkaufsstelle.html';
   if(doc.status!=='retrieved'||!hit||!condition)return finish('unavailable','Die amtliche Rückgaberegel für Batterien konnte ich gerade nicht bestätigen. Dein Standort bleibt erhalten. Bitte prüfe die verlinkte Originalseite.',{sourceLinks:[{title:'Zurück an die Verkaufsstelle | Stadt Zürich',url}]});
   const current=state.confirmedOrigin;
   const origin=current&&current.street===state.street&&normalized(current.number)===normalized(state.number)?current:null;
   let locations;try{locations=await batterySites({data,origin});}catch{locations=null;}
   const location=origin?` Dein Ausgangspunkt bleibt ${origin.address}, Zürich.`:'';
   const retailerSource={title:doc.title||'Zurück an die Verkaufsstelle | Stadt Zürich',url:doc.url||url,authority:'Stadt Zürich',retrievedAt:doc.retrievedAt,contentSha256:doc.contentSha256,passages:[{id:'battery_return',heading:'Batterien zurückgeben',text:hit[0],truncated:false},{id:'retail_condition',heading:'Voraussetzung',text:condition[0],truncated:false}]};
   const base=`Batterien kannst du laut Stadt Zürich bei Verkaufsstellen kostenlos zurückgeben, die solche Produkte vertreiben.${location}`;
   const actions=[batterySearchAction(state.postalCode)];
   if(locations?.results?.length){
    const list=locations.results.map(p=>`- **${p.name}**: ${p.address}, ${p.postalCode} Zürich${Number.isFinite(p.distanceMeters)?` · ca. ${p.distanceMeters} m Luftlinie`:''}`).join('\n');
    return finish('partial',base+'\n\n**Belegte Abgabeorte für Haushaltsbatterien in haushaltsüblichen Mengen:**\n'+list+'\n\nDie städtische Annahmeliste nennt Haushaltsbatterien als gratis. Die Höfe sind zusätzliche Möglichkeiten, keine Empfehlung für die kürzeste Strecke. Eine Verkaufsstelle kann näher sein. Öffne dafür die Recycling-Map, wähle „Batterien“ und suche mit deiner PLZ. Öffnungszeiten vor dem Besuch auf der Standortseite prüfen.',{results:locations.results,origin,sortMode:origin?'straight_line_subset':'city_subset',sourceLinks:[retailerSource,locations.source,...sources(['addresses'],data)],actions:[...actions,{label:'Recyclinghöfe: Öffnungszeiten und Annahme prüfen',url:locations.source.url}],limitations:['Auswahl: zwei städtische Recyclinghöfe, keine vollständige Liste der Batterie-Annahmestellen. Kein Nachweis der nächstgelegenen Verkaufsstelle.','Keine Live-Prüfung der Öffnungszeiten; Angaben gelten für Haushaltsbatterien. Für beschädigte Akkus oder Fahrzeugbatterien die Annahme gesondert klären.'],dataAvailability:{status:'partial',verifiedAcceptanceLocations:true,verifiedNearestLocation:false,retailerNetwork:'external_link',liveOpeningHours:false}});
   }
   return finish('partial',base+'\n\nWelche Annahmestelle am nächsten ist, kann ich derzeit nicht verlässlich bestimmen. Öffne die Recycling-Map, wähle „Batterien“ und suche mit deiner PLZ. Die zuvor gezeigten Metallcontainer sind kein Nachweis für Batterieannahme.',{sourceLinks:[retailerSource],actions,limitations:['Keine verifizierte nächstgelegene Batterie-Annahmestelle; keine Filial-Öffnungszeiten.'],results:[]});
  }
  const resolution=wasteLocationResolution(question,state.material);
  if(state.material==='Karton'&&resolution==='none'){
   let evidence;try{evidence=await preparation();}catch{evidence={results:[]};}
   const hits=(evidence.results||[]).filter(r=>r.passages?.some(p=>/vor\s+7\s*uhr/i.test(p.text)));
   if(!hits.length)return finish('unavailable','Die städtische Kartonregel konnte ich gerade nicht aus der Originalquelle bestätigen. Bitte die offizielle Kartonsammlung prüfen.',{sourceLinks:[{title:'Kartonsammlung | Stadt Zürich',url:'https://www.stadt-zuerich.ch/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/kartonsammlung.html'}]});
   const preparationVerified=hits.some(r=>r.passages.some(p=>/gebünd|bündel|schnür|gebund|bundel|schnur/i.test(p.text)));
   const costVerified=hits.some(r=>r.passages.some(p=>/kostenlos|gratis/i.test(p.text)));
   return finish('ok',`${preparationVerified?'Falte und bündle Karton und stelle ihn':'Stelle den Karton'} am Sammeltag **vor 7 Uhr** bereit.${costVerified?' Die Sammlung ist laut Stadt kostenlos.':''}\n\nDer konkrete Sammeltag hängt von deiner Adresse ab. Nenne für den nächsten Termin deine Postleitzahl oder Strasse und Hausnummer in Zürich.`,{sourceLinks:hits.map(r=>({title:r.title,url:r.url,retrievedAt:r.retrievedAt,passages:r.passages.filter(p=>/vor\s+7\s*uhr/i.test(p.text))})),followUp:{label:'Nächsten Kartontermin finden',question:'Wann ist mein nächster Kartontermin?'}});
  }
  let origin,postcodeFromStreet=false;
  if(state.street){
   const streetAddresses=addressIndex(data).get(textOf(state.street))||[];
   const ps=[...new Set(streetAddresses.map(a=>a.postalCode))].sort(),ds=[...new Set(streetAddresses.map(a=>a.district))];
   const postcodeHelp={sourceLinks:sources(['addresses','calendar'],data),actions:[{label:'Amtlichen Entsorgungskalender öffnen',url:'https://www.stadt-zuerich.ch/entsorgungskalender'}]};
   // Collection dates are indexed by postcode; they do not require an exact map point.
   // Absence from this snapshot is never evidence that an address does not exist.
   if(resolution==='postcode'){
    if(!state.postalCode&&ps.length===1){state.postalCode=ps[0];postcodeFromStreet=true;}
    if(state.postalCode&&!ps.includes(state.postalCode))return ask('postalCode',`Die PLZ ${state.postalCode} kann ich der ${state.street} im geladenen Adressbestand nicht zuordnen. Welche PLZ steht auf deiner Adresse? Du kannst sie auch im amtlichen Entsorgungskalender prüfen.`,ps.map(p=>`PLZ ${p}`),postcodeHelp);
    if(!state.postalCode){
     const retry=prior?.state.awaiting==='postalCode'&&/^\d{1,3}[a-z]?$/.test(q)?'Für den Kartontermin brauche ich die vierstellige Postleitzahl, keine weitere Hausnummer.\n\n':'';
     return ask('postalCode',`${retry}Welche Postleitzahl hat deine Adresse an der ${state.street}${ps.length>1?` – ${ps.join(' oder ')}`:''}? Für den Kartonkalender genügt die PLZ; eine genaue Hausnummer ist dafür nicht nötig.`,ps.map(p=>`PLZ ${p}`),postcodeHelp);
    }
    // Retain an already verified point from a previous proximity lookup, but
    // never validate a new house number just to determine a collection date.
    const confirmed=state.confirmedOrigin;
    if(confirmed&&confirmed.street===state.street&&normalized(confirmed.number)===normalized(state.number)&&confirmed.postalCode===state.postalCode)origin=confirmed;
   }else{
   const matches=state.number?streetAddresses.filter(a=>normalized(a.number)===normalized(state.number)):[];
   if(!state.number)return ask('houseNumber',`Welche Hausnummer an der ${state.street} meinst du?${ps.length===1&&ds.length===1?` Der amtliche Adressbestand ordnet diese Strasse ${ps[0]} Zürich, Kreis ${ds[0]}, zu.`:''}`,[],{sourceLinks:sources(['addresses'],data)});
   if(!matches.length)return ask('address',`${state.street} ${state.number} kann ich im geladenen amtlichen Adressbestand nicht bestätigen. Das bedeutet nicht, dass die Adresse nicht existiert. Für eine Entfernung brauche ich einen bestätigten Ausgangspunkt. Nenne eine andere genaue Adresse als Bezugspunkt. Alternativ kannst du mit deiner PLZ eine Übersicht ohne Entfernung erhalten.`,ps.map(p=>`PLZ ${p}`),{sourceLinks:sources(['addresses'],data),actions:postcodeHelp.actions});
   const keys=new Set(matches.map(a=>[a.postalCode,a.district,a.lat.toFixed(6),a.lon.toFixed(6)].join('|')));
   if(keys.size>1)return ask('address','Diese Adresse hat mehrere amtliche Punkte. Bitte präzisiere den Adresszusatz.');
   origin=matches[0];
   if((state.district&&state.district!==origin.district)||(state.postalCode&&state.postalCode!==origin.postalCode))return ask('address',`Die amtliche Adresse ${origin.address} liegt in ${origin.postalCode} Zürich, Kreis ${origin.district}. Das widerspricht deinen anderen Ortsangaben. Welche Adresse soll gelten?`,[`${origin.address}, ${origin.postalCode} Zürich`],{sourceLinks:sources(['addresses'],data)});
   state.postalCode=origin.postalCode;state.district=origin.district;state.confirmedOrigin=origin;
   }
  }
  if(state.district&&state.postalCode&&!data.addresses.some(a=>a.district===state.district&&a.postalCode===state.postalCode))return ask('location',`Kreis ${state.district} und PLZ ${state.postalCode} passen im amtlichen Adressbestand nicht zusammen. Was soll gelten?`,[`Kreis ${state.district}`,`PLZ ${state.postalCode}`]);
  delete state.awaiting;
  if(state.material==='Karton'){
   if(!state.postalCode)return ask('postalCode','Welche Postleitzahl in der Stadt Zürich? Für den Kartonkalender genügt die PLZ; eine Hausnummer ist nicht nötig.');
   const local=zurichClock(clock),all=data.calendar.filter(e=>e.postalCode===state.postalCode).map(e=>e.date).sort(),today=all.includes(local.date);
   if(!all.length)return finish('no_matches',`Für PLZ ${state.postalCode} gibt es in diesem Datensatz keine Kartontermine. Bitte die Postleitzahl prüfen.`);
   let evidence;try{evidence=await preparation();}catch{evidence={results:[]};}
   const ruleSources=(evidence.results||[]).filter(r=>r.passages?.some(p=>/vor\s+7\s*uhr/i.test(p.text)));
   const cutoffVerified=ruleSources.length>0,tooLate=today&&cutoffVerified&&local.minutes>=420;
   const dates=all.filter(d=>d>local.date||(d===local.date&&!tooLate)).slice(0,3);
   if(!dates.length)return finish('unavailable','Im geladenen Kalender stehen keine weiteren Termine. Bitte den neuen Jahreskalender abrufen.',{sourceLinks:sources(['calendar'],data)});
   const date=dates[0],prefix=tooLate?'Heute ist ebenfalls ein Sammeltag, aber die Bereitstellzeit vor 7 Uhr ist bereits vorbei. Ob die Abfuhr schon da war, ist nicht bekannt.\n\n':'';
   const answer=`${prefix}Nächster im amtlichen Kalender verzeichneter Kartontermin für ${state.postalCode} Zürich: **${plainDate(date)}**.${cutoffVerified?'\n\nStelle den Karton am Sammeltag vor **7 Uhr** bereit.':'\n\nDie Bereitstellzeit konnte ich nicht aus der amtlichen Regel bestätigen. Prüfe sie auf der Originalseite.'}\n\n${origin?`Adresse: ${origin.address}, Kreis ${origin.district}.\n\n`:''}Der Termin gilt laut Datensatz für die PLZ; kurzfristige Betriebsänderungen sind nicht enthalten.`;
   const links=sources(origin||state.street?['calendar','addresses']:['calendar'],data);for(const r of ruleSources)links.push({title:r.title,url:r.url,retrievedAt:r.retrievedAt});
   return finish(cutoffVerified?'ok':'partial',answer,{sourceLinks:links,calendar:{postalCode:state.postalCode,locationBasis:origin?'confirmed_address':postcodeFromStreet?'street_postcode':'user_postcode',dates,timezone:'Europe/Zurich',before:cutoffVerified?'07:00':null,todayCollection:today,todayCutoffPassed:tooLate},origin,results:[],limitations:cutoffVerified?['Kalender nach PLZ, keine Echtzeitmeldung zur Abfuhr.']:['Bereitstellzeit derzeit nicht verifiziert.'],followUp:{question:'Wo kann ich Glas entsorgen?',label:'Glas-Sammelstellen suchen'}});
  }
  if(/offnungs|geoffnet|offen|wochenende/.test(q))return finish('out_of_scope','Für einzelne Sammelstellen liegen keine verifizierten Öffnungszeiten oder aktuellen Betriebszustände vor. Ich kann passende Standorte und ihre Lage zeigen.');
  const wantsNearest=/nachst|nahe|naheste|optimal|closest|nearest/.test(q);
  if(!origin&&(wantsNearest||(!state.postalCode&&!state.district)))return ask('address','Welche Strasse und Hausnummer in der Stadt Zürich? Damit kann ich passende Sammelstellen nach Luftlinie sortieren.');
  let matches=data.stations.filter(s=>s.materials.includes(state.material));
  if(origin)matches=matches.map(s=>({...s,distanceMeters:distanceMeters(origin,s)})).sort((a,b)=>a.distanceMeters-b.distanceMeters||a.id.localeCompare(b.id));
  else matches=matches.filter(s=>(!state.district||s.district===state.district)&&(!state.postalCode||s.postalCode===state.postalCode)).sort((a,b)=>a.address.localeCompare(b.address,'de'));
  if(!matches.length)return finish('no_matches','Keine passenden Standorte im geladenen Datensatz. Daraus folgt nicht, dass es keine Annahmestelle gibt.');
  const results=matches.slice(0,origin?3:5).map(s=>mapPoint({...s,...(origin?{distanceMeters:Math.round(s.distanceMeters/10)*10}:{})}));
  const where=origin?`${origin.address}, ${origin.postalCode} Zürich (Kreis ${origin.district})`:state.district?`Kreis ${state.district} in Zürich`:`PLZ ${state.postalCode} in Zürich`;
  const description=origin?`Die drei nächstgelegenen erfassten Sammelstellen für ${state.material} **nach Luftlinie** ab ${where}:`:`Sammelstellen für ${state.material} im ${where} (${results.length} von ${matches.length}, ohne Entfernungsrangfolge):`;
  const list=results.map((s,i)=>`${i+1}. **${s.address}** · ${s.postalCode} Zürich, Kreis ${s.district}${origin?` · ca. ${s.distanceMeters} m Luftlinie`:''}`).join('\n');
  return finish('ok',`${description}\n\n${list}\n\n${origin?'Fusswege können länger sein. Öffnungszeiten und aktuelle Betriebszustände sind nicht geprüft.':'Für die nächstgelegene Stelle nenne bitte Strasse und Hausnummer.'}`,{results,origin,sortMode:origin?'straight_line':state.district?'district_overview':'postal_overview',totalMatches:matches.length,sourceLinks:sources(origin?['stations','addresses','districts']:['stations','districts'],data),limitations:[origin?limitText:'Auswahl nach Kreis oder PLZ; keine Entfernung ohne Ausgangsadresse.','Keine PET-Annahme aus diesen Materialangaben ableiten.'],nextQuestion:origin?null:'Welche Strasse und Hausnummer soll Ausgangspunkt für die Nähe-Suche sein?',followUp:origin?{question:'Wann kann ich Karton rausstellen?',label:'Nächster Kartontermin'}:null});
 };
}
