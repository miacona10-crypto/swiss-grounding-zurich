import {defaultRetriever} from './retrieve.js';
import {normalized} from './geo-data.js';

export function wasteMaterials(question){
 const q=normalized(question);
 return [['Glas',/\bglas\b/],['Metall',/\b(?:metall|buchsen|dosen|alu)\b/],['Karton',/\bkarton\b/],['Papier',/\b(?:papier|zeitungen)\b/],['Batterien',/\bbatterien?\b/],['PET',/\bpet\b/],['Kunststoff',/\b(?:kunststoff|plastik)\b/],['Sperrgut',/\bsperrgut\b/],['Elektrogeräte',/elektrogerat|elektrogerate/],['Bioabfall',/\b(?:bioabfall|grungut)\b/],['Sonderabfall',/\bsonderabfall\b/]].filter(([,rx])=>rx.test(q)).map(([label])=>label);
}

// General rules do not require a private address. Locations are a separate capability.
export function ruleTopic(question){
 const q=normalized(question);
 if(/sonderabfall|sondermull|chemikal|losungsmittel|farbreste|medikamente|aufgeblahte.*akku/.test(q))return 'hazard';
 if(/sperrgut|sperrmull|entsorgungs.?coupons?|entsorgungs.?marken|matratze|\bsofa\b/.test(q))return 'bulky';
 if(/recyclingh[oö]f|recyclinghof|werdholzli|looacher/.test(q))return 'yards';
 if(/elektrogera|elektronik|kuhlschrank|fernseher|waschmaschine|\blaptop\b/.test(q))return 'electronics';
 if(/zuri.?sack|zurisack|hauskehricht|abfallsack|kehrichtsack/.test(q))return 'sack';
 if(/bioabfall|grungut|gruenabfall|grunabfall|kompost|gartenabfall/.test(q))return 'bio';
 if(/\b(?:papier|zeitungen?|altpapier)\b/.test(q)&&!/karton/.test(q))return 'paper';
 if(/kunststoff|plastik|recybag|recypac/.test(q))return 'plastic';
 if(/\bpet\b|petflaschen/.test(q))return 'pet';
 if(/entsorgungskalender|abfallkalender/.test(q)&&!/karton/.test(q))return 'calendar';
 return null;
}
const headline={bulky:'Sperrgut in der Stadt Zürich',yards:'Die städtischen Recyclinghöfe',electronics:'Elektrogeräte entsorgen',sack:'Hauskehricht im Züri-Sack',bio:'Bioabfall in Zürich',paper:'Papier bereitstellen',plastic:'Kunststoff separat sammeln',pet:'PET-Getränkeflaschen zurückgeben',hazard:'Sonderabfall sicher abgeben',calendar:'Dein persönlicher Entsorgungskalender'};
export async function wasteRules({question,topic=ruleTopic(question),retriever=defaultRetriever}={}){
 if(!topic)return null;
 const claims=[],sources=[],missing=[],cache=new Map();
 async function source(id){
  if(!cache.has(id)){let d;try{d=await retriever.retrieve('zh-'+id);}catch{d={status:'unavailable'};}cache.set(id,d);}
  return cache.get(id);
 }
 async function fact(id,sourceId,pattern,text,conditions='Privathaushalte in der Stadt Zürich'){
  const d=await source(sourceId),full=(d.doc?.blocks||[]).map(b=>b.heading+' '+b.text).join(' ').replace(/\s+/g,' '),m=d.status==='retrieved'&&full.match(pattern);
  if(!m){missing.push(id);return;}
  let s=sources.find(s=>s.id===sourceId);
  if(!s){s={id:sourceId,title:d.title,url:d.url,authority:'Stadt Zürich',retrievedAt:d.retrievedAt,contentSha256:d.contentSha256,passages:[]};sources.push(s);}
  s.passages.push({id,heading:d.title,text:m[0],truncated:false});
  claims.push({id,text,conditions,sourceId,sourceUrl:d.url,sourceTitle:d.title,retrievedAt:d.retrievedAt,passageId:id});
 }
 async function pickup(){
  await fact('pickup_paid','pickup',/Das Angebot ist kostenpflichtig\./,'Eine Abholung durch ERZ ist kostenpflichtig.');
  await fact('pickup_booking','pickup',/empfehlen 3 Arbeitstage im Voraus\.[\s\S]{0,650}?Bestellungen ausschliesslich telefonisch entgegen\./,'ERZ empfiehlt die telefonische Bestellung drei Arbeitstage vorher. Das ist eine Empfehlung, keine garantierte Terminverfügbarkeit.');
 }
 async function yards(){
  const d=await source('yards');
  for(const name of ['Looächer','Werdhölzli']){
   const c=d.doc?.contacts?.find(c=>c.title.includes(name)&&c.city==='Zürich');
   if(d.status!=='retrieved'||!c){missing.push('yard_address_'+name);continue;}
   const id='yard_'+name;
   // The contact component was parsed with bounded fields; never infer coordinates.
   const text=`Recyclinghof ${name}: ${c.streets.join(', ')}, ${c.postalCode} Zürich.`;
   const s=sources.find(s=>s.id==='yards')||{id:'yards',title:d.title,url:d.url,authority:'Stadt Zürich',retrievedAt:d.retrievedAt,contentSha256:d.contentSha256,passages:[]};
   if(!sources.includes(s))sources.push(s);
   s.passages.push({id,heading:'Amtliche Kontaktadresse',text,truncated:false});
   claims.push({id,text,conditions:'Standortadresse, keine Näheberechnung',sourceId:'yards',sourceUrl:d.url,sourceTitle:d.title,retrievedAt:d.retrievedAt,passageId:id});
  }
  await fact('looacher_hours','yards',/Öffnungszeiten Recyclinghof Looächer[\s\S]{0,180}?Montag bis Freitag, 7 bis 17 Uhr[\s\S]{0,160}?Samstag, 7\.30 bis 14 Uhr[\s\S]{0,120}?Sonntag geschlossen/,'Regulär Looächer: Mo–Fr 07:00–17:00, Sa 07:30–14:00; Sonntag geschlossen. Feiertage und Änderungen separat prüfen.');
  await fact('werdholzli_hours','yards',/Öffnungszeiten (?:Recyclinghof|Reyclinghof) Werdhölzli[\s\S]{0,180}?Montag bis Freitag, 13 bis 19 Uhr[\s\S]{0,160}?Samstag, 7\.30 bis 14 Uhr[\s\S]{0,120}?Sonntag geschlossen/,'Regulär Werdhölzli: Mo–Fr 13:00–19:00, Sa 07:30–14:00; Sonntag geschlossen. Feiertage und Änderungen separat prüfen.');
 }
 if(topic==='bulky'){
  if(/mark|coupon|bon|gratis/.test(normalized(question)))await fact('coupons_ended','coupons',/Künftig wird es keine Coupons mehr geben\.[\s\S]{0,200}?Ende April 2025\./,'Falls du die früheren Gratis-Entsorgungs-Coupons meinst: Die Stadt hat sie abgeschafft; die letzten galten bis Ende April 2025. Daraus folgt kein Verkauf neuer Sperrgutmarken.');
  await fact('bulky_options','bulky',/Entsorgen Sie Sperrgut im Recyclinghof oder im Mobilen Recyclinghof\./,'Sperrgut kannst du im Recyclinghof oder beim Mobilen Recyclinghof abgeben.');
  await fact('bulky_price','yards',/Sperrgut \(z\.B\.[\s\S]{0,220}?bis 100 kg, pauschal[\s\S]{0,80}?Fr\. 22\.70[\s\S]{0,40}?Fr\. 19\.45/,'Im Recyclinghof kostet Sperrgut bis 100 kg pro Anlieferung pauschal CHF 22.70; pro weitere 100 kg CHF 19.45, inkl. MwSt. Preisänderungen sind vorbehalten.');
  await fact('mobile_free','mobile',/Das Angebot ist kostenlos und autofrei\./,'Der Mobile Recyclinghof ist kostenlos und autofrei. Termine und Annahmebedingungen auf der Originalseite prüfen.');
  await pickup();
 }
 if(topic==='yards')await yards();
 if(topic==='electronics'){
  await fact('electronics_free','yards',/Elektrogeräte \| Keine benzinbetriebenen Geräte \| Gratis/,'Elektrogeräte können im Recyclinghof kostenlos abgegeben werden; benzinbetriebene Geräte sind von dieser Kategorie ausgeschlossen.');
  await pickup();
 }
 if(topic==='sack'){
  await fact('sack_buy','sack',/Der blaue Züri-Sack ist im Detailhandel gegen eine Gebühr erhältlich\./,'Hauskehricht gehört in den blauen Züri-Sack. Du erhältst ihn gegen Bezahlung im Detailhandel.');
  await fact('sack_price','sack',/Der Gebührenanteil am Kaufpreis des Züri-Sacks[\s\S]{0,480}?Verkaufspreis kann je nach Verkaufsgeschäft variieren\./,'Der Sackpreis enthält die Entsorgungsgebühr sowie Produktions- und Handelskosten. Der Ladenpreis ist nicht überall gleich.');
 }
 if(topic==='paper'){
  await fact('paper_rule','paper',/Papier wird in der Stadt Zürich alle zwei Wochen eingesammelt\. Die Papiersammlung ist kostenlos\./,'Die städtische Papiersammlung ist kostenlos und findet alle zwei Wochen statt.');
  await fact('paper_prepare','paper',/Stellen Sie das gebündelte Papier oder Ihren Papiercontainer am Sammeltag vor 7 Uhr an den Strassenrand\. Sammeln Sie Papier nicht in Papiertragetaschen oder Kartonschachteln\./,'Stelle Papier gebündelt oder im Papiercontainer am Sammeltag vor 07:00 bereit; benutze keine Papiertragetaschen oder Kartonschachteln.');
 }
 if(topic==='bio'){
  await fact('bio_bin','bio',/Entsorgen Sie Bioabfall, der nicht einer Kompostierung zugeführt wird, in Bioabfallcontainern\. Diese werden einmal pro Woche geleert\./,'Bioabfall, der nicht kompostiert wird, gehört in den Bioabfallcontainer. Er wird wöchentlich geleert.');
  await fact('bio_time','bio',/Bioabfallcontainer müssen am Abfuhrtag vor 7 Uhr am festgelegten Abholort bereit gestellt werden\./,'Am Abfuhrtag muss der Bioabfallcontainer vor 07:00 am festgelegten Abholort stehen.');
 }
 if(topic==='plastic')await fact('plastic_return','plastic',/Sammelsäcke für Kunststoff sind im Detailhandel erhältlich[\s\S]{0,160}?ERZ vertreibt keine Sammelsäcke\./,'Kunststoff-Sammelsäcke erhältst du bei Anbietern im Detailhandel und gibst sie dort zurück. ERZ verkauft diese Säcke nicht. Eine konkrete Filiale samt Annahme und Öffnungszeiten ist hier nicht verifiziert.');
 if(topic==='pet'){
  await fact('pet_retail','retail-return',/Grundsätzlich sind die Händler verpflichtet,[\s\S]{0,160}?die sie selbst vertreiben, zurückzunehmen\./,'Der städtische Rückgabehinweis gilt für Händler, die entsprechende Produkte selbst vertreiben.');
  await fact('pet_free','retail-return',/Im Kaufpreis von Batterien, PET-Getränkeflaschen und Elektrogeräten[\s\S]{0,300}?kostenlos zurückzunehmen\./,'PET-Getränkeflaschen sind im kostenlosen Rücknahmesystem enthalten. Eine nächstgelegene Filiale mit bestätigter Annahme und Öffnungszeiten ist hier nicht verfügbar.');
 }
 if(topic==='hazard'){
  await fact('hazard_not_trash','hazardous',/Da Sonderabfall umweltschädlich und gefährlich ist, darf er nicht im Hauskehricht entsorgt werden\./,'Sonderabfall darf nicht in den Hauskehricht.');
  await fact('hazard_location','hazard',/Kantonale Sonderabfall-Sammelstelle Hagenholz[\s\S]{0,120}?Hagenholzstrasse 110[\s\S]{0,50}?8050 Zürich/,'Anlaufstelle: Sonderabfall-Sammelstelle Hagenholz, Hagenholzstrasse 110, 8050 Zürich.');
  await fact('hazard_quantity','hazard',/Für Privatpersonen und Kleingewerbe sind bis 20 Kilogramm pro Jahr und anliefernde Person kostenlos\./,'Für Privatpersonen und Kleingewerbe sind bis 20 kg pro Jahr und anliefernde Person kostenlos.');
 }
 if(topic==='calendar'||['paper','bio','sack'].includes(topic)&&/wann|termin|kalender|welche.*tag/.test(normalized(question)))await fact('personal_calendar','calendar',/Strasse, Hausnummer sowie Entsorgungswege auswählen[\s\S]{0,200}?elektronischen Kalender importieren/,'Im amtlichen Entsorgungskalender wählst du Strasse, Hausnummer und Abfallart. Dort kannst du deinen Kalender als PDF oder Kalenderdatei beziehen. Andere adressbezogene Termine als Karton berechnet dieser Server noch nicht.');
 const unavailable=[...cache.values()].some(s=>s.status!=='retrieved');
 const gaps=['plastic','pet'].includes(topic)||/nachst|nahe|heute.*offen|jetzt.*offen/.test(normalized(question))||['paper','bio','sack'].includes(topic)&&/wann|termin/.test(normalized(question));
 const nearest=topic==='yards'&&/nachst|nahe/.test(normalized(question));
 const limitations=['Veröffentlichte Regeln und reguläre Zeiten; keine Live-Betriebsprüfung.',...(missing.length?['Einzelne Regeln fehlen oder konnten aktuell nicht bestätigt werden.']:[]),...(nearest?['Keine Distanzsortierung der Recyclinghöfe. Ein nächster Hof wird nicht behauptet.']:[])];
 const actions=sources.map(s=>({label:s.title,url:s.url}));
 return {handled:true,status:!claims.length?'unavailable':missing.length||gaps||nearest?'partial':'ok',answer:claims.length?`${headline[topic]}\n\n${claims.map(c=>'- '+c.text).join('\n')}${nearest?'\n\nWelcher Hof für dich am günstigsten liegt, berechnet dieser Server noch nicht. Öffne die Standortseite für die Anfahrt.':''}`:'Die benötigten amtlichen Regeln konnte ich derzeit nicht bestätigen. Bitte versuche es erneut.',claims,sourceLinks:sources,results:[],actions,limitations,missingRules:missing,sourceFailure:unavailable,dataAvailability:{status:gaps||nearest?'missing_data':'available',verifiedNearestLocation:false,regularHours:topic==='yards'&&claims.some(c=>c.id.endsWith('_hours')),liveOpeningHours:false},followUp:{label:'Persönlichen Entsorgungskalender öffnen',question:'Wie finde ich meinen persönlichen Entsorgungskalender?'}};
}
