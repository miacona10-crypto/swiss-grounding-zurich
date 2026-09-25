import {normalized} from './geo-data.js';
import {defaultRetriever} from './retrieve.js';
// Citizenship is explicit self-identification; a place of departure is not citizenship.
export function residenceSlots(text,pending){
 let q=normalized(text);if(q.includes('sondern'))q=q.split('sondern').at(-1);const out={};
 const citizenship=/\b(?:bin|sind|staatsangehorigkeit|staatsburger|nationalitat|pass)\b/.test(q)||pending==='citizenshipGroup'||pending==='nationality';
 if(citizenship&&(!/\b(?:aus|von)\b/.test(q)||/\b(?:staatsangehorigkeit|staatsburger|nationalitat|pass)\b|\b(?:bin|sind)\s+(?:(?:ein|eine)\s+)?(?:italiener|italienerin|deutscher|deutsche|schweizer|schweizerin|inder|indisch|franzose|franzosin|portugiese|spanier)\b/.test(q))){
  if(/\b(?:schweizer|schweizerin|schweiz)\b/.test(q)&&!/nicht|kein/.test(q))out.citizenshipGroup='swiss';
  else if(!/drittstaat|ausserhalb.*eu|nicht.*eu/.test(q)&&/\b(?:italiener(?:in)?|italienisch\w*|italien|deutsch\w*|franzos\w*|frankreich|osterreich\w*|portugies\w*|spanier\w*|spanisch\w*|niederland\w*|polnisch\w*|pole|polin|griech\w*|norweg\w*|schwed\w*)\b|\beu\s*\/\s*efta\b/.test(q))out.citizenshipGroup='eu_efta';
  else if(/drittstaat|ausserhalb.*eu|nicht.*eu|indisch|inder|indien|serbisch|serbe|turkisch|turke|amerikanisch|usa|brasilianisch/.test(q))out.citizenshipGroup='other';
 }
 if(out.citizenshipGroup)out.nationality=out.citizenshipGroup==='swiss'?'swiss':'foreign';
 const permit=q.match(/\b(?:bewilligung|ausweis|aufenthaltsbewilligung)\s*[-:]?\s*([bclfgsn])\b|\b([bclfgsn])\s*[- ]\s*(?:bewilligung|ausweis)\b/);
 if(permit){out.permitType=/(?:keine?|keinen|ohne)\s+(?:(?:gultige|bestehende)\s+)?(?:[bclfgsn]\s*[- ]\s*)?(?:bewilligung|ausweis)/.test(q)?null:(permit[1]||permit[2]).toUpperCase();}
 else if(pending==='permitType'&&/^[bclfgsn]$/.test(q.trim()))out.permitType=q.trim().toUpperCase();
 if(/abgelaufen|ungultig|widerrufen/.test(q)&&/bewilligung|ausweis/.test(q))out.permitValidity='not_confirmed';
 if(/\b(?:baby|kind|kinder|sohn|tochter)\b/.test(q))out.withChildren=true;
 return out;
}
export async function residenceEvidence({retriever=defaultRetriever}={}){
 const doc=await retriever.retrieve('sem-eu-mobility');
 if(doc.status!=='retrieved')return {available:false,facts:[],sources:[]};
 const full=doc.doc.blocks.map(b=>b.text).join(' ').replace(/\s+/g,' ');
 const scope=full.match(/Kurzaufenthalts-, Aufenthalts- und Niederlassungsbewilligungen EU\/EFTA gelten für das ganze Gebiet der Schweiz[^.]*\./);
 const mobility=full.match(/Staatsangehörige der EU\/EFTA und ihre Familienangehörigen benötigen keine neue Bewilligung,[\s\S]{0,160}?anderen Kanton verlegen\./);
 const address=full.match(/Im EU\/EFTA-Ausweis ist aber die neue Wohnadresse aufzuführen\. Der Ausweis ist zu diesem Zweck bei der Anmeldung am neuen Wohnort vorzulegen\./);
 const source={id:'sem-eu-mobility',title:doc.title,url:doc.url,authority:'Staatssekretariat für Migration SEM',retrievedAt:doc.retrievedAt,contentSha256:doc.contentSha256,passages:[]},facts=[];
 function add(id,match,text){if(match){facts.push({id,text,conditions:'Bestehende EU/EFTA-Bewilligung; Wohnortwechsel innerhalb der Schweiz',sourceId:source.id,passageId:id});source.passages.push({id,heading:'Stellen- oder Wohnortwechsel',text:match[0],truncated:false});}}
 if(scope)add('permit_eu_mobility',mobility,'Mit einer bestehenden EU/EFTA-Bewilligung ist beim Wechsel in einen anderen Kanton laut SEM keine neue Bewilligung allein wegen des Wohnortwechsels nötig. Dies bestätigt weder die persönliche Gültigkeit noch eine Verlängerung deiner Bewilligung.');
 add('permit_eu_address',address,'Lege deinen EU/EFTA-Ausweis bei der Anmeldung am neuen Wohnort vor, damit die neue Wohnadresse eingetragen wird.');
 return {available:facts.length===2,facts,sources:[source]};
}
