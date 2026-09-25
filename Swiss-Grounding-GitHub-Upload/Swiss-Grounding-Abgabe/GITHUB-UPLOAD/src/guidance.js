import {randomBytes} from 'node:crypto';
import {normalized,readGeoData,snapshotProblem} from './geo-data.js';
import {createWasteAssistant,wasteIntent} from './waste.js';
import {civicEvidence,pmaAddress,firstStepsEvidence} from './civic.js';
import {ground} from './ground.js';
import {wasteRules,ruleTopic,wasteMaterials} from './waste-rules.js';
import {residenceSlots,residenceEvidence} from './residence.js';
import {outsideScope,languageProblem} from './scope.js';
const cityRx=/\b(?:zurich|zuerich|zurigo|turitg)\b/;
const foreignCountries=/\b(?:deutschland|italien|frankreich|osterreich|portugal|spanien|usa|england|grossbritannien|polen|indien|berlin|paris|london|ausland)\b/;
const domesticPlaces=/\b(?:schweiz|schweizer gemeinde|winterthur|uster|bern|basel|luzern|baden|dietikon|dubendorf|duebendorf|st\. gallen|lugano|lausanne|genf|zug)\b/;
const pendingFields={houseNumber:'house_number',municipality:'city_confirmation',residenceOrigin:'origin',postalCode:'postal_code'};
const affirmative=/^(?:ja|ja genau|genau|richtig|korrekt|stimmt|yes|jep|jawohl)[.! ]*$/;
// Typed answers are resolved before routing, but only against the question
// actually asked. A country of origin never implies a nationality.
export function resolvePendingInput(question,pending,{topic}={}){
 let text=question.trim();
 const correction=/^(?:nein|nee|noe|nö|doch|korrektur)(?=\s|[,.:!-]|$)[\s,:-]*/i.test(text);
 if(correction)text=text.replace(/^(?:nein|nee|noe|nö|doch|korrektur)(?=\s|[,.:!-]|$)[\s,:-]*/i,'').replace(/^(?:ich\s+)?(?:meine|meinte)\s+/i,'').trim();
 const q=normalized(text),field=pending?.field;
 const result={question:text||question,updates:{},resolved:false,correction};
 if(field==='city_confirmation'&&(affirmative.test(q)||/^(?:die\s+)?(?:stadt\s+)?(?:zurich|zuerich)[.! ]*$/.test(q))){result.question='Stadt Zürich';result.updates.city=true;result.resolved=true;}
 else if(['house_number','postal_code','district'].includes(field)){
  const value=q.match(/^(?:(?:es ist|ich meine|ich wohne bei|bei|die|der|nummer|nr\.?|hausnummer|plz|postleitzahl|kreis)\s+)*(\d+[a-z]?)[.! ]*$/)?.[1];
  if(value&&(field!=='postal_code'||/^8\d{3}$/.test(value))&&(field!=='district'||/^(?:[1-9]|1[0-2])$/.test(value))){result.question=field==='postal_code'?'PLZ '+value:field==='district'?'Kreis '+value:value;result.resolved=true;}
 }else if(field==='street'&&affirmative.test(q)&&pending.options?.length===1){result.question=pending.options[0];result.resolved=true;}
 if((field==='origin'||topic==='registration'&&correction)&&!/(?:nicht|kein).*\baus\b/.test(q)){
  let origin;
  if(foreignCountries.test(q)&&domesticPlaces.test(q)&&!/sondern/.test(q)){result.conflict='origin';return result;}
  if(/innerhalb|gleiche.*stadt|bereits.*zurich/.test(q))origin='within_city';
  else if(foreignCountries.test(q)&&(field==='origin'||/\b(?:aus|von)\b/.test(q)))origin='abroad';
  else if(domesticPlaces.test(q)||/ander(?:e|en|er|em)\s+kanton/.test(q))origin='switzerland';
  if(origin){result.updates.origin=origin;result.resolved=field==='origin';if(field==='origin'&&!/\b(?:aus|von|innerhalb)\b/.test(q))result.question='Aus '+text;}
 }
 if(field==='nationality'){
  const foreign=/ausland|(?:nicht|kein|keine) schweizer|eu\/efta|deutsch|italien|franzos|osterreich|portugies|spanisch/.test(q);
  // "aus Deutschland" answers origin, not citizenship. Keep asking if needed.
  if(!/\b(?:aus|von)\b|schweizer gemeinde/.test(q)&&(foreign||/schweizer/.test(q))){result.updates.nationality=foreign?'foreign':'swiss';result.question=foreign?'Ausländische Staatsangehörigkeit':'Schweizer Staatsangehörigkeit';result.resolved=true;}
 }
 if(pending?.options?.some(o=>normalized(o)===q)){result.question=pending.options.find(o=>normalized(o)===q);result.resolved=true;}
 return result;
}
export function guidanceTopic(question){
 const q=normalized(question),found=[];
 if(/anmeld|melde.*an|registr|inscri|annunzi|s'inscrire|checkliste|erste schritte|nachsende|adressanderung.*(?:bank|arbeitgeber)|wohnungs.*protokoll|militar|zivildienst|zivilschutz|was.*(?:sonst|alles).*umzug|was.*(?:vor|nach).*umzug|strom.*(?:umzug|zuzug)|(?:hund|auto|kontrollschilder|ewz).*zu(?:zug|rich)/.test(q))found.push('registration');
 if(/betreib|poursuite|debt.?extract|esecuz/.test(q))found.push('debt_extract');
 if(wasteIntent(q)||ruleTopic(q)||/kehricht|abfall|recycl|entsorg|dechet|rifiut/.test(q))found.push('waste');
 if(!found.length&&/zuzug|umzug|umzieh|zieh.*(?:nach|um)/.test(q))found.push('registration');
 return found;
}
const labels={registration:'Anmeldung',debt_extract:'Betreibungsauszug',waste:'Entsorgung'};
export function createGuidance({now=Date.now,evidence=civicEvidence,firstSteps=firstStepsEvidence,office=pmaAddress,waste=createWasteAssistant(),readData=readGeoData,grounding=ground,rules=wasteRules,residence=residenceEvidence}={}){
 const sessions=new Map();
 return async function guide({question,contextToken,topic}={}){
  if(typeof question!=='string'||!question.trim()||question.length>2000)return {schema:'zurich-guidance-v1',handled:true,status:'invalid',answer:'Bitte eine Frage mit 1 bis 2000 Zeichen eingeben.',results:[]};
  for(const [k,v]of sessions)if(now()-v.time>3600000)sessions.delete(k);
  const prior=contextToken?sessions.get(contextToken):null;let s=prior?structuredClone(prior.state):{};
  const resolved=resolvePendingInput(question,s.pending_question,{topic:s.topic});
  const newResidence=residenceSlots(question,s.pending_question?.field);
  question=resolved.question;Object.assign(s,resolved.updates,newResidence);
  if(newResidence.citizenshipGroup==='swiss'){delete s.permitType;}
  if(newResidence.permitType||newResidence.citizenshipGroup){delete s.awaiting;}
  if(newResidence.permitType||newResidence.nationality==='foreign'||newResidence.withChildren)s.request='foreign_overview';
  if(resolved.resolved)s.pending_question=null;
  let effectiveQuestion=question;
  let q=normalized(question).replace(/str\.(?=\s|$)/g,'strasse');if(q.includes('sondern'))q=q.split('sondern').at(-1);
  function finish(status,answer,extra={}){
   const field=extra.missingFields?.[0]||s.awaiting;
   s.pending_question=status==='needs_clarification'&&field?{field:pendingFields[field]||field,reason:extra.nextQuestion||answer,options:extra.options||[]}:null;
   if(status!=='needs_clarification')delete s.awaiting;
   const token=randomBytes(24).toString('hex');if(sessions.size>=200)sessions.delete(sessions.keys().next().value);sessions.set(token,{time:now(),state:structuredClone(s)});
   return {schema:'zurich-guidance-v1',handled:true,status,answer,message:answer,topic:s.topic||null,contextToken:token,context:{municipality:s.city?'Stadt Zürich':null,address:s.address||null,addressStatus:s.address?'user_provided':'missing',residenceOrigin:s.origin||null,nationality:s.nationality||null,citizenshipGroup:s.citizenshipGroup||null,permitType:s.permitType||null,withChildren:!!s.withChildren},missingFields:[],nextQuestion:null,options:[],cards:[],actions:[],claims:[],results:[],sourceLinks:[],limitations:[],...extra,pending_question:s.pending_question};
  }
  function ask(field,text,options=[],extra={}){s.awaiting=field;return finish('needs_clarification',text,{missingFields:[field],nextQuestion:text,options,...extra});}
  if(contextToken&&!prior)return ask('restart','Dieses Gespräch ist abgelaufen. Bitte nenne dein Anliegen und die Zielgemeinde erneut.');
  if(resolved.conflict==='origin'){delete s.origin;return ask('residenceOrigin','Du nennst verschiedene bisherige Wohnorte. Wo wohnst du unmittelbar vor dem Zuzug?',['Aus einer anderen Schweizer Gemeinde','Aus dem Ausland']);}
  const scope=outsideScope(q),foreignLanguage=languageProblem(q);
  if(scope){s={};return finish('out_of_scope',scope.answer+(foreignLanguage?' Bitte formuliere Fragen für die Stadt Zürich auf Deutsch.':''),{reason:scope.kind,scope,languageSupported:!foreignLanguage});}
  if(foreignLanguage)return finish('invalid','Dieser Server unterstützt derzeit deutschsprachige Fragen zur Stadt Zürich. Bitte formuliere die Frage auf Deutsch; eine verlässliche Antwort in anderen Sprachen ist hier nicht geprüft.',{reason:'unsupported_language',languageSupported:false});
  if(/impfung|impfungen|steuer|schulferien|kindergarten|pramie|gunstigste.*krankenkasse|rundfunk|wetter|arzt/.test(q))return finish('out_of_scope','Dieses Thema gehört nicht zum verifizierten Umfang. Ich unterstütze Anmeldung/Adressänderung, ausgewählte Entsorgung und Betreibungsregisterauszüge in der Stadt Zürich.');
  const found=guidanceTopic(q);if(!found.length&&(newResidence.permitType||newResidence.nationality||newResidence.withChildren))found.push('registration');const requested=topic&&['registration','debt_extract','waste'].includes(topic)?topic:null;
  if(found.length>1&&s.awaiting!=='topic'){s.pendingQuestion=question;return ask('topic','Du hast mehrere Anliegen. Welches möchtest du zuerst klären?',found.map(t=>labels[t]));}
  const nextTopic=requested||found[0];
  if(s.awaiting==='topic'&&nextTopic&&s.pendingQuestion){effectiveQuestion=s.pendingQuestion+' '+question;q=normalized(effectiveQuestion);delete s.pendingQuestion;}

  if(nextTopic&&nextTopic!==s.topic){delete s.request;delete s.awaiting;s.topic=nextTopic;}
  if(!s.topic)return ask('topic','Ich unterstütze die Stadt Zürich bei Anmeldung, ausgewählter Entsorgung und Betreibungsauszügen. Worum geht es?',Object.values(labels));
  // The origin of a move is not its destination. A reply to an origin question is also not a new destination.
  const originReply=s.topic==='registration'&&s.awaiting==='residenceOrigin';
  const destination=q.match(/\b(?:nach|zielgemeinde|zielort)\b\s*:?\s*(?:der\s+stadt\s+|stadt\s+)?([\p{L}.-]+(?:\s+gallen)?)/u)?.[1];
  const explicitOutside=destination&&!['dem','der','den','einem','einer','meinem','meiner','zuzug','umzug'].includes(destination)&&!cityRx.test(destination);
  const outsideIn=q.match(/\b(?:in|fur)\s+(?:der\s+stadt\s+|stadt\s+)?(uster|winterthur|bern|basel|baden|dietikon|dubendorf|konstanz|luzern|lugano)\b/);
  if(explicitOutside||outsideIn&&!originReply&&!cityRx.test(destination||'')){s={};return finish('out_of_scope','Dieser Server unterstützt ausschliesslich die Stadt Zürich. Für die genannte andere Gemeinde gebe ich keine Zürcher Regeln aus.');}
  if(cityRx.test(q.replace(/kanton\s+zurich/g,'')))s.city=true;
  if(s.awaiting==='municipality'&&/^(?:ja|genau|yes)$/.test(q))s.city=true;
  const address=q.match(/\b([\p{L}-]+(?:strasse|gasse|weg|quai|platz))\s+(\d+[a-z]?)\b/u);if(address)s.address=address[0];
  const newRule=ruleTopic(q);
  const basicCardboard=/karton/.test(q)&&/\b(?:wie|was)\b/.test(q)&&!/wann|termin|abhol/.test(q);
  // A general rule for this declared single-city scope needs no personal location.
  if(s.topic==='waste'&&(newRule||basicCardboard||/\b(?:batterien?|karton|cardboard)\b/.test(q)))s.city=true;
  if(!s.city){s.pendingQuestion=effectiveQuestion;return ask('municipality','Meinst du die Stadt Zürich? Die Auskünfte dieses Servers gelten ausschliesslich dort.',['Stadt Zürich']);}
  if(s.awaiting==='municipality'&&s.pendingQuestion){effectiveQuestion=s.pendingQuestion+' '+question;q=normalized(effectiveQuestion);delete s.pendingQuestion;delete s.awaiting;}
  if(s.awaiting==='topic'){delete s.awaiting;delete s.pendingQuestion;}
  if(/bewilligung.*(?:erhalt|bekomm)|asyl|wochenaufenthalt|obdach|beistand|minderjahrig.*allein|ruckkehr.*schweizer|schweizer.*ruckkehr/.test(q))return finish('out_of_scope','Dieser Sonderfall ist nicht als verifiziertes Verfahren abgedeckt. Bitte kläre ihn mit dem zuständigen Amt; aus dem normalen Zuzug leite ich keine Bewilligung oder Sonderregel ab.');
  if(s.topic==='waste'){
   const materials=wasteMaterials(q);
   if(newRule&&materials.length>1&&/\b(?:und|oder)\b/.test(q))return ask('material','Für diese Materialien gelten unterschiedliche Entsorgungswege. Welches möchtest du zuerst klären?',materials);
   if(newRule)s.wasteRule=newRule;
   else if(wasteIntent(q))delete s.wasteRule;
   if(s.wasteRule){
    const r=await rules({question:effectiveQuestion,topic:s.wasteRule});
    if(r)return finish(r.status,r.answer,r);
   }
   if(!wasteIntent(q)&&/entsorg|surfbrett/.test(q)&&!/wann|termin|kalender/.test(q))return ask('material','Welches Material oder welche Art Gegenstand möchtest du entsorgen? Bei sperrigen Gegenständen sind auch Grösse und Material wichtig; ich ordne unbekannte Dinge nicht automatisch einer Sammelstelle zu.',['Glas','Karton','Metall','Sperrgut','Elektrogeräte','Sonderabfall']);
   let actual=effectiveQuestion;if(!cityRx.test(q)&&!s.wasteToken)actual+=' in der Stadt Zürich';
   if(s.address&&!s.wasteToken&&!address&&/nahe|nachst|wo.*glas/.test(q))actual+=' bei '+s.address;
   let r=await waste({question:actual,...(s.wasteToken?{contextToken:s.wasteToken}:{})});
   if(!r.handled){const result=await grounding({query:actual,municipality:'Zürich'});const hits=result.results||[];return finish(result.status,hits.length?'Zu dieser Frage habe ich eine amtliche Quelle gefunden, aber keine geprüfte persönliche Ortsauskunft. Die Quelle ist unten verlinkt. Für die nächste Sammelstelle nenne bitte Material, Strasse und Hausnummer in der Stadt Zürich.':result.message,{sourceLinks:hits.map(h=>({...h,passages:h.passages})),limitations:result.limitations||[]});}
   s.wasteToken=r.contextToken;if(r.origin)s.address=r.origin.address;
   const {contextToken:unused,schema:unusedSchema,context:wc,...extra}=r;
   const dataGap=/\bbatterien?\b|\bpet\b|\bplastik\b|\bkunststoff\b/.test(q)&&!r.results?.length?{dataAvailability:{status:'missing_data',fields:['verified_acceptance_locations','nearest_acceptance_location','branch_opening_hours']}}:{};
   return finish(r.status,r.answer,{...extra,...dataGap,context:{municipality:'Stadt Zürich',...wc},actions:r.actions||[],cards:r.cards||[]});
  }
  if(s.topic==='registration'&&/nachsende|\bpost\b|\bbank\b|arbeitgeber|wohnungs.*protokoll|ubergabeprotokoll|antrittsprotokoll|militar|zivildienst|zivilschutz/.test(q))return finish('partial','Für dieses zusätzliche Umzugsthema liegt hier noch keine verifizierte Verfahrensregel vor. Ich bestätige deshalb keine Kosten, Frist oder persönliche Pflicht. Du kannst mit der belegten Anmelde- und Erste-Schritte-Checkliste fortfahren.',{dataAvailability:{status:'missing_data',fields:['verified_additional_moving_procedure']},followUp:{label:'Belegte Erste-Schritte-Checkliste',question:'Welche ersten Schritte muss ich nach meinem Zuzug beachten?'}});
  const request=/unterlag|dokument|mitbring|papers|documents|documenti/.test(q)?'documents':/kost|gebuhr|preis|fees|cost/.test(q)?'fees':/frist|bis wann|wann.*anmeld|deadline|delai/.test(q)?'deadline':/online|digital|eumzug/.test(q)?'online':/schalter|personlich|vorbei|wo genau|welches amt|zustandig|wo.*anmeld|wo.*melden/.test(q)?'office':/auslandisch|auslander|auslanderin|nicht schweizer/.test(q)&&/beacht|wichtig|wissen|muss|soll|brauche|bin /.test(q)?'foreign_overview':/checkliste|was.*(?:alles|sonst|weiter|beachten|erledigen).*?(?:umzug|zuzug|ummelden)|(?:strom|wasser|ewz|hund|auto|kontrollschilder|fahrzeugausweis).*?(?:umzug|zuzug|melden|zurich)|(?:umzug|zuzug).*?(?:strom|wasser|ewz|hund|auto|kontrollschilder|fahrzeugausweis|beachten|erledigen)/.test(q)||/zieh|umzug|zuzug/.test(q)&&/was.*(?:alles|sonst|weiter|beachten|erledigen)/.test(q)?'checklist':/allgemein|uberblick|moglichkeiten/.test(q)?'overview':null;
  if(newResidence.permitType||newResidence.nationality==='foreign'||newResidence.withChildren){if(!request||request==='office'||request==='overview')s.request='foreign_overview';}
  if(/erste.*schritte/.test(q))s.request='checklist';else if(request)s.request=request;const intent=s.request||'overview';
  if(s.topic==='registration'){
   if(/(?:aus|von).*?\b(?:schweiz|schweizer gemeinde)\b/.test(q)&&/(?:aus|von).*?\bausland\b/.test(q)){delete s.origin;return ask('residenceOrigin','Du nennst Inland und Ausland. Wo wohnst du unmittelbar vor diesem Zuzug?',['Aus einer anderen Schweizer Gemeinde','Aus dem Ausland']);}
   if(/innerhalb|bereits.*(?:stadt )?zurich|gleiche.*stadt/.test(q))s.origin='within_city';
   else if(/\baus(?: dem)? ausland\b|\bvom ausland\b|from abroad/.test(q)||foreignCountries.test(q)&&(/\b(?:aus|von|from)\b/.test(q)||originReply))s.origin='abroad';
   else if(/(?:aus|von|from).*?(?:schweiz|schweizer gemeinde|(?:anderen?\s+)?kanton|winterthur|uster|bern|basel|luzern|baden|dietikon|dubendorf|lugano|lausanne|genf|zug)\b/.test(q)||originReply&&domesticPlaces.test(q))s.origin='switzerland';
   if(/\b(?:schweizer|schweizerin)\b/.test(q.replace(/schweizer gemeinde/g,'')))s.nationality='swiss';
   if(/auslandisch|auslander|auslanderin|eu\/efta|deutscher|deutsche|italiener|italienerin|nicht schweizer/.test(q))s.nationality='foreign';
   if(s.nationality==='swiss'&&s.request==='foreign_overview')s.request='overview';
   if(s.nationality==='foreign'&&intent==='foreign_overview'&&s.origin==='switzerland')s.request='foreign_overview';

   if(!s.origin&&!['deadline'].includes(intent)&&!(/allgemein|uberblick|moglichkeiten/.test(q)))return ask('residenceOrigin',(address?'Die Adresse ist übernommen. Für den Anmeldeweg ist deine Herkunft entscheidend.\n\n':'')+'Ziehst du aus einer anderen Schweizer Gemeinde oder aus dem Ausland nach Zürich?',['Aus einer anderen Schweizer Gemeinde','Aus dem Ausland','Umzug innerhalb der Stadt Zürich']);
   if(s.permitType&&s.origin==='switzerland'&&!s.citizenshipGroup)return ask('citizenshipGroup','Du hast die Bewilligung '+s.permitType+' genannt. Hast du eine EU/EFTA-Staatsangehörigkeit oder die eines anderen Staates? Der bisherige Wohnort sagt nichts über deine Staatsangehörigkeit aus.',['EU/EFTA-Staatsangehörigkeit','Staatsangehörigkeit eines Drittstaats']);
   if(intent==='documents'&&s.origin==='switzerland'&&!s.nationality)return ask('nationality','Für die Unterlagen beim Zuzug aus der Schweiz: Hast du die Schweizer oder eine ausländische Staatsangehörigkeit?',['Schweizer Staatsangehörigkeit','Ausländische Staatsangehörigkeit']);
  }
  delete s.awaiting;
  const e=await evidence(s.topic==='registration'&&s.origin==='within_city'?'registration_local':s.topic);if(!e.available)return finish('unavailable','Die amtliche Quelle ist derzeit nicht ausreichend abrufbar. Ich bestätige deshalb keine Frist, Gebühr oder Zuständigkeit. Bitte versuche es erneut.');
  let firstStepsMissing=false;
  if(s.topic==='registration'&&intent==='checklist'){
   const extra=await firstSteps().catch(()=>({available:false}));
   if(extra.available){e.facts=[...e.facts,...extra.facts];e.sources=[...e.sources,...extra.sources];}
   else firstStepsMissing=true;
  }
  let residenceMissing=false;
  const mobilityCase=s.topic==='registration'&&s.origin==='switzerland'&&s.citizenshipGroup==='eu_efta'&&['B','C','L'].includes(s.permitType)&&s.permitValidity!=='not_confirmed';
  if(mobilityCase){const extra=await residence().catch(()=>({available:false}));if(extra.available){e.facts=[...e.facts,...extra.facts];e.sources=[...e.sources,...extra.sources];}else residenceMissing=true;}
  const used=[],actions=[],cards=[],missingRules=[];
  function take(id){const f=e.facts.find(f=>f.id===id);if(f&&!used.includes(f))used.push(f);return f;}
  function card(title,ids){const items=ids.map(id=>{const f=take(id);if(!f)missingRules.push(id);return f;}).filter(Boolean).map(f=>f.text);if(items.length)cards.push({title,items});}
  function action(pattern,label){const l=e.links.find(l=>pattern.test(l.title));if(l)actions.push({label,url:l.url});}
  let headline='';
  if(s.topic==='registration'){
   if(s.origin==='within_city'){headline='Dein Verfahren: Adressänderung innerhalb der Stadt Zürich.';if(intent==='deadline')card('Frist',['local_deadline']);else if(intent==='fees')card('Gebühren',['local_fees']);else if(intent==='documents')card('Unterlagen je Anmeldeweg',['local_docs',...(s.nationality==='swiss'?['local_swiss']:s.nationality==='foreign'?['local_foreign']:['local_swiss','local_foreign'])]);else {card('Online oder persönlich',['local_online','local_office','local_deadline']);}actions.push({label:'Adressänderung online melden',url:e.sources[0].url});action(/Termin.*innerhalb/i,'Termin für Adressänderung');}
   else if(intent==='deadline'){card('Anmeldefrist',['deadline']);headline='Die Anmeldefrist für deinen Zuzug nach Zürich:';}
   else if(!s.origin){card('Aus einer Schweizer Gemeinde',['domestic_online','domestic_appointment']);card('Aus dem Ausland',['abroad_appointment']);headline='Die Anmeldewege unterscheiden sich nach dem bisherigen Wohnort.';}
   else if(s.origin==='switzerland'){
    headline='Dein Anmeldeweg: Zuzug aus einer anderen Schweizer Gemeinde nach Zürich.';
    if(intent==='documents'){const prefix=s.nationality==='swiss'?'swiss':'foreign';card('Deine Unterlagen',[prefix+'_identity',prefix+'_lease',prefix+'_insurance',...(prefix==='foreign'?['foreign_permit','foreign_civil']:[])]);}
    else if(intent==='checklist'){
     card('Zuzug anmelden',['domestic_deregister','deadline','domestic_appointment','domestic_online']);
     if(s.nationality){const prefix=s.nationality==='swiss'?'swiss':'foreign';card('Passende Unterlagen',[prefix+'_identity',prefix+'_lease',prefix+'_insurance',...(prefix==='foreign'?['foreign_permit','foreign_civil']:[])]);}
    }
    else if(intent==='foreign_overview'&&s.nationality==='foreign'){
     headline='Als ausländische Person beim Zuzug aus einer anderen Schweizer Gemeinde nach Zürich: Das solltest du vorbereiten.';
     card('Anmeldung',['domestic_deregister','deadline','domestic_appointment','domestic_online']);
     card('Unterlagen für die Anmeldung',['foreign_identity','foreign_permit','foreign_lease','foreign_insurance','foreign_civil']);
     card('Gebühren',['domestic_fee','foreign_fees']);
    }
    else if(intent==='fees'){card('Gebühren',['domestic_fee',...(s.nationality==='swiss'?[]:['foreign_fees'])]);}
    else {card('Online oder mit Termin',['domestic_online','domestic_appointment']);card('Vorbereitung',['domestic_deregister','deadline']);}
    action(/online via eUmzugCH/i,'Online-Anmeldung prüfen');action(/Termin.*Schweizer Gemeinde/i,'Termin für Zuzug aus der Schweiz');
   }else{
    headline='Dein Anmeldeweg: Zuzug aus dem Ausland nach Zürich.';
    if(intent==='documents')card('Unterlagen laut Stadt',['abroad_identity','abroad_lease','abroad_permit','abroad_work','abroad_civil']);
    else if(intent==='checklist'){
     card('Zuzug anmelden',['abroad_appointment','deadline']);
     card('Vorbereitung',['abroad_identity','abroad_lease','abroad_permit','abroad_work','abroad_civil','family']);
    }
    else if(intent==='foreign_overview'&&s.nationality==='foreign'){
     headline='Als ausländische Person beim Zuzug aus dem Ausland nach Zürich: Das solltest du vorbereiten.';
     card('Persönliche Anmeldung',['abroad_appointment','deadline']);
     card('Unterlagen für die Anmeldung',['abroad_identity','abroad_lease','abroad_permit','abroad_work','abroad_civil']);
     card('Familienanmeldung',['family']);
     card('Gebühren',['abroad_fees']);
    }
    else if(intent==='fees')headline='Einen festen Gesamtbetrag für den Zuzug aus dem Ausland kann ich aus dieser Quelle nicht bestätigen. Die zuständige Stelle klärt anfallende Gebühren.';
    else {card('Persönlich anmelden',['abroad_appointment','deadline']);card('Bei einer Familienanmeldung',['family']);const a=await office();if(a&&used.some(f=>f.id==='abroad_appointment')){cards.push({title:'Besuchsort',items:['Personenmeldeamt Zürich Süd · '+a.address]});e.sources.push(a.source);used.push({id:'pma_south_address',text:a.address,conditions:'Besuchsort bei Zuzug aus dem Ausland',sourceId:'zh-pma-locations',passageId:'contact'});}}
    action(/Termin.*Ausland/i,'Termin für Zuzug aus dem Ausland');
   }
   if(intent==='checklist'){
    const selected=/\b(?:strom|wasser|ewz)\b/.test(q)?['steps_utilities']:/\b(?:hund|hundekontrolle)\b/.test(q)?['steps_dog']:/\b(?:auto|fahrzeug|kontrollschilder|strassenverkehr)\b/.test(q)?['steps_car']:/\bkrankenkasse\b/.test(q)?s.origin==='abroad'?['steps_insurance_abroad']:[]:/\bselbstandig\b/.test(q)?['steps_self_employed']:['steps_utilities','steps_car',...(s.origin==='abroad'?['steps_insurance_abroad']:[]),'steps_dog','steps_self_employed'];
    if(selected.length&&!firstStepsMissing)card('Weitere Schritte nach deiner Situation',selected);
   }
  }else{
   headline='Betreibungsregisterauszug in der Stadt Zürich';
   if(intent==='fees')card('Kosten',['debt_fee']);
   else if(/andere person|fremde person|firma|mieter.*pruf/.test(q)){card('Auskunft über Dritte',['debt_third']);}
   else if(intent==='office'){
    card('Zuständigkeit und Besuch',['debt_jurisdiction','debt_identity_office']);
    action(/zuständige.*Amt|zuständige.*Betreibungsamt/i,'Zuständiges Amt anhand der betreffenden Adresse finden');
    headline='Für einen Schalterbesuch zählt die Adresse, auf die sich der Auszug bezieht. Nutze die amtliche Adresssuche; ich ordne dich nicht automatisch dem Amt deiner neuen Wohnung zu.';
   }else{card('Bestellung',['debt_methods','debt_online','debt_identity_online']);card('Kosten und Versand',['debt_fee','debt_delivery']);}
   actions.push({label:'Amtliche Bestellung und Adresssuche öffnen',url:e.sources[0].url});
  }
  if(mobilityCase&&!residenceMissing)card('Deine bestehende '+s.permitType+'-Bewilligung EU/EFTA',['permit_eu_mobility','permit_eu_address']);
  if(s.topic==='registration'&&s.permitType&&s.origin==='switzerland'&&(!mobilityCase||residenceMissing)){
   const note=residenceMissing?'Die spezielle Regel für deine EU/EFTA-Bewilligung konnte gerade nicht aus der SEM-Quelle bestätigt werden.':s.citizenshipGroup==='other'?'Die EU/EFTA-Regel lässt sich nicht allein aus deiner '+s.permitType+'-Bewilligung ableiten. Eine mögliche Bewilligung zum Kantonswechsel und Ausnahmen, etwa aufgrund der Familienkonstellation, müssen separat geklärt werden.':'Für diesen Bewilligungstyp ist hier keine verifizierte Sonderregel hinterlegt.';
   cards.push({title:'Bewilligung und Kantonswechsel klären',items:[note+' Kläre den Kantonswechsel vor dem Umzug mit dem Migrationsamt Zürich.']});
   actions.push({label:'Migrationsamt Zürich: Aufenthalt und Bewilligungen',url:'https://www.zh.ch/de/migration-integration/aufenthalt.html'});
   residenceMissing=true;
  }
  const facts=used.map(f=>{const source=e.sources.find(x=>x.id===f.sourceId);return {...f,sourceUrl:source?.url,sourceTitle:source?.title,retrievedAt:source?.retrievedAt};});
  const relevantSources=e.sources.map(source=>({...source,passages:source.passages?.filter(p=>used.some(f=>f.passageId===p.id))}));
  if(!used.length&&!(s.topic==='registration'&&['abroad','within_city'].includes(s.origin)&&intent==='fees'))return finish('unavailable','Die benötigte Regel ist in der abgerufenen Quelle nicht sicher wiedergefunden worden. Bitte prüfe die Originalseite.',{sourceLinks:e.sources.map(({passages,...x})=>x)});
  const answer=headline+'\n\n'+cards.map(c=>'**'+c.title+'**\n'+c.items.map(x=>'- '+x).join('\n')).join('\n\n');
  const partial=missingRules.length>0||(s.topic==='registration'&&['abroad','within_city'].includes(s.origin)&&intent==='fees')||s.topic==='debt_extract'&&intent==='office';
  return finish(partial||firstStepsMissing||residenceMissing?'partial':'ok',answer,{cards,claims:facts,actions,sourceLinks:relevantSources,missingRules,suggestions:s.topic==='registration'?[{label:'Erste Schritte',question:'Welche ersten Schritte muss ich nach meinem Zuzug beachten?'},{label:'Entsorgungskalender',question:'Wie finde ich meinen persönlichen Entsorgungskalender?'}]:[],limitations:residenceMissing?['Bewilligungsspezifische Auskunft unvollständig; keine persönliche Bewilligungsentscheidung.']:firstStepsMissing?['Die amtliche Seite „Erste Schritte“ war nicht abrufbar. Weitere Umzugsaufgaben konnten deshalb nicht bestätigt werden.']:missingRules.length?['Einzelne benötigte Regeln konnten nicht bestätigt werden. Die angezeigte Liste ist unvollständig; prüfe die amtliche Quelle.']:s.topic==='registration'&&intent==='online'?['Individuelle eUmzug-Berechtigung wird im offiziellen Portal geprüft, nicht anhand deiner Hausnummer.']:[],followUp:s.topic==='registration'&&intent!=='documents'?{label:'Passende Unterlagen anzeigen',question:'Welche Unterlagen muss ich mitbringen?'}:null});
 };
}
