// Case-bound administrative facts. Every factual field must match current source text.
import {defaultRetriever} from './retrieve.js';
const squash=s=>String(s||'').replace(/\s+/g,' ').trim();
function between(text,start,end){const i=text.indexOf(start);if(i<0)return '';const rest=text.slice(i+start.length),j=end?rest.indexOf(end):-1;return j<0?rest:rest.slice(0,j);}
export async function civicEvidence(topic,{retriever=defaultRetriever}={}){
 const id=topic==='registration'?'zh-registration':topic==='registration_local'?'zh-local-move':'zh-debt';
 const doc=await retriever.retrieve(id);
 if(doc.status!=='retrieved')return {available:false,error:doc.error||'source_unavailable',facts:[],sources:[]};
 const full=squash(doc.doc.blocks.map(b=>b.text).join(' '));
 const facts=[],sources=[{id,url:doc.url,title:doc.title,authority:'Stadt Zürich',retrievedAt:doc.retrievedAt,contentSha256:doc.contentSha256,passages:[]}];
 function add(key,scope,section,pattern,text){const hit=section.match(pattern);if(!hit)return;facts.push({id:key,text,conditions:scope,sourceId:id,passageId:key});sources[0].passages.push({id:key,heading:scope,text:hit[0],truncated:false});}
 const links=doc.doc.links||[];
 if(topic==='registration_local'){
  add('local_deadline','Umzug innerhalb der Stadt Zürich',full,/Die Meldepflicht Ihrer Adressänderung beträgt 14 Tage ab Umzug\./,'Melde die Adressänderung innerhalb von 14 Tagen nach dem Umzug.');
  add('local_online','Online-Adressänderung innerhalb der Stadt Zürich',full,/Sie sind bereits in der Stadt Zürich angemeldet\. Sie sind volljährig und handlungsfähig[\s\S]{0,150}?30 Tage vor Einzug melden\./,'Die städtische Online-Adressänderung ist für bereits in Zürich angemeldete, volljährige und handlungsfähige Personen vorgesehen; frühestens 30 Tage vor Einzug.');
  add('local_office','Persönliche Adressänderung innerhalb der Stadt Zürich',full,/nur noch mit Termin an den Standorten Personenmeldeamt Zürich Nord oder Personenmeldeamt Zürich West möglich\./,'Für die persönliche Adressänderung buche einen Termin bei Zürich Nord oder Zürich West.');
  add('local_fees','Adressänderung; je nach Bewilligung und gewählten Leistungen',full,/Die Gebühren sind je nach Art der Bewilligung verschieden/,'Gebühren hängen von der Bewilligung und gewählten Leistungen ab. Einen persönlichen Gesamtbetrag bestätigt dieser Server nicht.');
  add('local_docs','Online-Adressänderung',full,/Benötigte Dokumente Meldebestätigung Mietvertrag Kreditkarte oder TWINT[\s\S]{0,220}?verschieden\)/,'Online bereithalten: Meldebestätigung, Mietvertrag und gegebenenfalls Kreditkarte oder TWINT für anfallende Gebühren.');
  add('local_swiss','Persönliche Adressänderung; Schweizer Staatsangehörigkeit',full,/Schweizer Bürger\*innen: Pass oder Identitätskarte Meldebestätigung oder Wochenaufenthaltsbewilligung \(sofern vorhanden\) Mietvertrag, Wohnungsausweis oder Untermietvertrag/,'Am Schalter als Schweizer/in: Pass oder Identitätskarte, Meldebestätigung/gegebenenfalls Wochenaufenthaltsbewilligung und Mietnachweis.');
  add('local_foreign','Persönliche Adressänderung; ausländische Staatsangehörigkeit',full,/Ausländische Staatsangehörige: Ausländerausweis Pass[\s\S]{0,350}?Untermietvertrag/,'Am Schalter mit ausländischer Staatsangehörigkeit: Ausländerausweis, Pass (EU/EFTA auch Identitätskarte), Meldebestätigung sofern vorhanden und Mietnachweis.');
 }else if(topic==='registration'){
  const domestic=between(full,'Sie sind aus einer anderen Schweizer Gemeinde nach Zürich gezogen?','Zuzug aus dem Ausland Sie sind');
  const abroad=between(full,'Sie sind aus dem Ausland nach Zürich gezogen?');
  const swiss=between(domestic,'Schweizer Bürger*innen:','Ausländische Staatsangehörige:');
  const foreign=between(domestic,'Ausländische Staatsangehörige:');
  add('deadline','Zuzug in die Stadt Zürich',full,/Sie müssen sich innerhalb von 14 Tagen bei der Stadt Zürich anmelden \(Meldepflicht\)\. Eine Anmeldung ist erst ab dem effektiven Einzug möglich\./,'Melde deinen Zuzug innerhalb von 14 Tagen nach dem tatsächlichen Einzug. Vor dem Einzug ist die Anmeldung noch nicht möglich.');
  add('domestic_online','Zuzug aus einer Schweizer Gemeinde',domestic,/Einige Gemeinden nehmen bereits am schweizweiten eUmzugCH teil\.[\s\S]{0,180}?online via eUmzugCH/,'Prüfe deinen Umzug im offiziellen eUmzugCH-Portal. Eine Online-Anmeldung ist je nach Ausgangsgemeinde und persönlicher Situation möglich; dieser Server bestätigt die individuelle Berechtigung nicht.');
  add('domestic_deregister','Zuzug aus einer Schweizer Gemeinde',domestic,/Bitte melden Sie sich bei Ihrer bisherigen Wohnsitzgemeinde ab\. Ohne die Abmeldung[\s\S]{0,120}?anmelden\./,'Melde dich bei der bisherigen Wohngemeinde ab. Die Stadt nennt die Abmeldung als Voraussetzung für die Anmeldung.');
  add('domestic_appointment','Persönliche Anmeldung bei Zuzug aus der Schweiz',domestic,/Eine Vorsprache vor Ort ist ausschliesslich mit vorheriger Terminvereinbarung möglich\./,'Wenn du persönlich vorsprechen möchtest, buche vorher einen Termin. Der bestätigte Termin legt den Besuchsort fest.');
  add('abroad_appointment','Zuzug aus dem Ausland',abroad,/Für die Anmeldung aus dem Ausland müssen Sie einen Termin vereinbaren\. Die Anmeldung findet persönlich beim Personenmeldeamt Zürich Süd statt\./,'Bei Zuzug aus dem Ausland: persönlich beim Personenmeldeamt Zürich Süd anmelden und vorher einen Termin buchen.');
  add('family','Familienanmeldung bei Zuzug aus dem Ausland',abroad,/bei Familienanmeldungen alle Familienmitglieder persönlich beim Termin erscheinen\./,'Bei einer Familienanmeldung aus dem Ausland müssen alle Familienmitglieder persönlich zum Termin erscheinen.');
  for(const [key,scope,section]of [['swiss','Zuzug aus der Schweiz; Schweizer Staatsangehörigkeit',swiss],['foreign','Zuzug aus der Schweiz; ausländische Staatsangehörigkeit',foreign],['abroad','Zuzug aus dem Ausland',abroad]]){
   add(key+'_lease',scope,section,/Mietvertrag, Wohnungsausweis oder Untermietvertrag/,'Mietvertrag, Wohnungsausweis oder Untermietvertrag mitnehmen.');
   add(key+'_insurance',scope,section,/Krankenkassenkarte \(aller Familienmitglieder\)/,'Krankenkassenkarten aller anzumeldenden Familienmitglieder mitnehmen.');
   add(key+'_civil',scope,section,/Zivilstandspapiere(?: im Original)? \(Ehepapiere und Geburtsscheine der Kinder\)/,'Relevante Zivilstandspapiere mitnehmen: Ehepapiere und Geburtsscheine der Kinder; bei Zuzug aus dem Ausland im Original.');
   add(key+'_fee',scope,section,/Fr\. 40.– pro erwachsene Person/,'Die städtische Anmeldegebühr beträgt 40 Franken pro erwachsene Person.');
  }
  if([...domestic.matchAll(/Fr\. 40.– pro erwachsene Person/g)].length>=2)add('domestic_fee','Zuzug aus einer Schweizer Gemeinde; pro erwachsene Person',domestic,/Fr\. 40.– pro erwachsene Person/,'Die städtische Anmeldegebühr beträgt 40 Franken pro erwachsene Person.');
  add('swiss_identity','Zuzug aus der Schweiz; Schweizer Staatsangehörigkeit',swiss,/Pass oder Identitätskarte/,'Pass oder Identitätskarte mitnehmen.');
  add('foreign_identity','Zuzug aus der Schweiz; ausländische Staatsangehörigkeit',foreign,/Pass \(bei EU\/EFTA Staatsangehörigen genügt auch die Identitätskarte\)/,'Pass mitnehmen; für EU/EFTA-Staatsangehörige genügt auch die Identitätskarte.');
  add('foreign_permit','Zuzug aus der Schweiz; ausländische Staatsangehörigkeit',foreign,/Ausländerausweis \(sofern vorhanden\)/,'Ausländerausweis mitnehmen, sofern vorhanden.');
  add('foreign_fees','Ausländische Staatsangehörigkeit; je nach Bewilligung',foreign,/Migrationsamtliche Gebühren \(je nach Art der Bewilligung unterschiedlich\)/,'Bei ausländischer Staatsangehörigkeit: Zusätzliche migrationsamtliche Gebühren hängen von der Bewilligung ab; ein Gesamtbetrag wird hier nicht bestätigt.');
  add('abroad_identity','Zuzug aus dem Ausland',abroad,/Reisepass \(bei EU\/EFTA Staatsangehörigen genügt auch der Personalausweis\)/,'Reisepass mitnehmen; bei EU/EFTA-Staatsangehörigkeit genügt auch der Personalausweis.');
  add('abroad_work','Zuzug aus dem Ausland',abroad,/Arbeitsvertrag oder Studienbestätigung/,'Arbeitsvertrag oder Studienbestätigung nach der persönlichen Situation mitnehmen.');
  add('abroad_permit','Zuzug aus dem Ausland; sofern vorhanden',abroad,/Zusicherung der Aufenthaltsbewilligung \(sofern vorhanden\) Ermächtigung der Visumserteilung \(sofern vorhanden\)/,'Zusicherung der Aufenthaltsbewilligung und Ermächtigung der Visumserteilung mitnehmen, sofern vorhanden.');
  add('abroad_fees','Zuzug aus dem Ausland; je nach Bewilligung',abroad,/Migrationsamtliche Gebühren \(je nach Art der Bewilligung unterschiedlich\)/,'Migrationsamtliche Gebühren hängen von der Art der Bewilligung ab; ein persönlicher Gesamtbetrag ist hier nicht bestätigt.');
 }else{
  add('debt_methods','Betreibungsregisterauszug Zürich',full,/Dies ist online, per Brief oder persönlich am Schalter möglich\./,'Du kannst den Auszug online, per Brief oder persönlich am Schalter bestellen.');
  add('debt_jurisdiction','Adresse, auf die sich der Auszug bezieht',full,/Welches der zwölf städtischen Betreibungsämter[\s\S]{0,280}?zuständige Betreibungsamt kann den Auszug erstellen/,'Zuständig ist das Betreibungsamt für die betreffende aktuelle oder frühere Wohnadresse. Die neue Adresse oder das nächstgelegene Amt ist nicht automatisch richtig.');
  add('debt_online','Onlinebestellung',full,/Sie müssen nicht selbst das zuständige Amt finden[\s\S]{0,250}?alle diese Adressen bestellen\./,'Im offiziellen Onlineformular wird das zuständige Amt ermittelt. Mehrere Zürcher Wohnadressen der letzten fünf Jahre können dort berücksichtigt werden.');
  add('debt_identity_online','Onlinebestellung',full,/Voraussetzung: Halten Sie eine elektronische Kopie[\s\S]{0,350}?hochladen\./,'Halte für das amtliche Bestellformular eine Ausweiskopie bereit. Lade sie ausschliesslich dort hoch, nicht in diesen Chat.');
  add('debt_identity_office','Persönliche Bestellung',full,/Bringen Sie einen Ihrer amtlichen Ausweise mit[\s\S]{0,130}?Debitkarte bezahlen\./,'Am Schalter: amtlichen Ausweis mitbringen; Bezahlung bar oder mit Debitkarte.');
  add('debt_fee','Standardauszug',full,/Ein Standard-Auszug kostet 17 Franken plus Porto \(A-Post\)/,'Ein Standardauszug kostet 17 Franken zuzüglich Porto; andere Auskunftsarten können abweichen.');
  add('debt_third','Auszug über eine andere Person oder Firma',full,/Damit Sie über eine andere Person oder Firma[\s\S]{0,600}?nachzuweisen\./,'Für Auskünfte über andere Personen oder Firmen muss ein berechtigtes Interesse durch Unterlagen glaubhaft gemacht werden. Das Amt prüft den Einzelfall.');
  add('debt_delivery','Schriftlicher Auszug',full,/Schriftliche Betreibungsauszüge versenden wir mit A-Post ausschliesslich an Adressen in der Schweiz\./,'Schriftliche Auszüge werden laut Stadt ausschliesslich an Adressen in der Schweiz versandt.');
 }
 return {available:facts.length>0,facts,sources,links};
}
export async function pmaAddress({retriever=defaultRetriever}={}){
 const r=await retriever.retrieve('zh-pma-locations');if(r.status!=='retrieved')return null;
 const contact=r.doc.contacts?.find(c=>c.title==='Personenmeldeamt Zürich Süd'&&c.streets.includes('Stadthausquai 17')&&c.postalCode==='8001'&&c.city==='Zürich');
 if(!contact)return null;
 return {address:'Stadthausquai 17, 8001 Zürich',source:{id:'zh-pma-locations',url:r.url,title:'Kontakt Personenmeldeamt Zürich Süd',authority:'Stadt Zürich',retrievedAt:r.retrievedAt,contentSha256:r.contentSha256,passages:[{id:'contact',heading:contact.title,text:contact.streets.join(', ')+', '+contact.postalCode+' '+contact.city,truncated:false}]}};
}

// Optional, source-gated first-steps checklist. Every row is displayed only when its
// exact supporting clause is present in the official city page fetched at runtime.
export async function firstStepsEvidence({retriever=defaultRetriever}={}){
 const doc=await retriever.retrieve('zh-first-steps');
 if(doc.status!=='retrieved')return {available:false,facts:[],sources:[]};
 const full=squash(doc.doc.blocks.map(b=>b.text).join(' '));
 const facts=[],source={id:'zh-first-steps',url:doc.url,title:doc.title,authority:'Stadt Zürich',retrievedAt:doc.retrievedAt,contentSha256:doc.contentSha256,passages:[]};
 function add(id,conditions,pattern,text){const hit=full.match(pattern);if(hit){facts.push({id,text,conditions,sourceId:source.id,passageId:id});source.passages.push({id,heading:conditions,text:hit[0],truncated:false});}}
 add('steps_utilities','Nach einem Zuzug in die Stadt Zürich',/Ihre Anmeldung beim Personenmeldeamt ersetzt nicht die Anmeldung bei der Strom- und Wasserversorgung\./,'Die Anmeldung beim Personenmeldeamt meldet Strom und Wasser nicht automatisch um. Kläre die Anmeldung bei ewz und der Wasserversorgung.');
 add('steps_car','Bei Fahrzeugbesitz; Umzug innerhalb des Kantons oder aus einem anderen Kanton',/Bei einem Umzug innerhalb des Kantons Zürich können Sie Ihre neue Adresse beim Strassenverkehrsamt melden\. Ansonsten müssen Sie die neuen Kontrollschilder und Ausweise innert 14 Tagen persönlich abholen\./,'Falls du ein Auto hast: Innerhalb des Kantons kannst du die neue Adresse dem Strassenverkehrsamt melden; bei einem Zuzug aus einem anderen Kanton nennt die Stadt für neue Kontrollschilder und Ausweise eine Frist von 14 Tagen und persönliche Abholung.');
 add('steps_insurance_abroad','Zuzug aus dem Ausland; nach Anmeldung beim Personenmeldeamt',/Wenn Sie aus dem Ausland zuziehen und sich beim Personenmeldeamt angemeldet haben, bleiben Ihnen drei Monate Zeit, die obligatorische Krankenversicherung bei einer Krankenkasse Ihrer Wahl abzuschliessen\./,'Beim Zuzug aus dem Ausland nennt die Stadt nach Anmeldung beim Personenmeldeamt drei Monate für den Abschluss der obligatorischen Krankenversicherung. Kläre individuelle Ausnahmen direkt mit der zuständigen Stelle.');
 add('steps_dog','Hund über drei Monate; Zuzug in die Stadt Zürich',/Jeder Hund im Alter von über drei Monaten muss bei der Hundekontrolle innerhalb von zehn Tagen nach dem Zuzug angemeldet werden\./,'Wenn du einen Hund über drei Monate hast, melde ihn innert zehn Tagen nach dem Zuzug bei der städtischen Hundekontrolle an.');
 add('steps_self_employed','Selbständigerwerbend; Zuzug in die Stadt Zürich',/Melden Sie sich direkt bei der SVA Zürich an, falls Sie selbständigerwerbend sind\./,'Falls du selbständig erwerbstätig bist, melde dich bei der SVA Zürich.');
 return {available:facts.length>0,facts,sources:[source]};
}
