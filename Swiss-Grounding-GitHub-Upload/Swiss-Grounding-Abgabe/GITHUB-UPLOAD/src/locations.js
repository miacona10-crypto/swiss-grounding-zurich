import { readFileSync } from 'node:fs';
import { normalize } from './extract.js';
function readSnapshot() {
  try { return JSON.parse(readFileSync(new URL('../data/zurich-locations.json',import.meta.url))); }
  catch { return null; }
}
export function findLocations({postalCode,material,limit=5}={}, {data=readSnapshot(),now=Date.now()}={}) {
  if (!data) return {status:'unavailable',message:'Sammelstellendaten fehlen. npm run refresh:locations ausführen.',results:[]};
  const age=now-Date.parse(data.downloadedAt);
  if (!Number.isFinite(age) || age < -60000 || data.license!=='cc-zero' || !Array.isArray(data.stations)) return {status:'unavailable',message:'Der Sammelstellen-Datenstand ist ungültig.',results:[]};
  const common={sourceUrl:data.sourceUrl,datasetUrl:data.datasetUrl,downloadedAt:data.downloadedAt,referenceYear:data.referenceYear,license:data.license};
  if (age>7*86400000 || new Date(now).getUTCFullYear()!==data.referenceYear) return {status:'unavailable',message:'Der Sammelstellen-Datenstand muss aktualisiert werden: npm run refresh:locations.',...common,results:[]};
  if (!postalCode || !material) return {status:'needs_clarification',message:'Welche Postleitzahl in der Stadt Zürich und welches Material: Glas, Metall, Öl oder Textilien?',missingFields:[...(!postalCode?['postalCode']:[]),...(!material?['material']:[])],results:[]};
  if (typeof postalCode!=='string' || !/^8\d{3}$/.test(postalCode) || typeof material!=='string' || !Number.isInteger(limit) || limit<1 || limit>10) return {status:'invalid',message:'Bitte eine vierstellige Zürcher Postleitzahl, ein Material und ein Limit von 1 bis 10 verwenden.',results:[]};
  const materials={glas:'Glas',glass:'Glas',verre:'Glas',vetro:'Glas',metall:'Metall',metal:'Metall',oel:'Oel',ol:'Oel',oil:'Oel',huile:'Oel',olio:'Oel',textilien:'Textilien',textiles:'Textilien',tessili:'Textilien'};
  const selected=materials[normalize(material)];
  if (!selected) return {status:'out_of_scope',message:'Dieser Datensatz belegt nur Glas, Metall, Öl und Textilien. Keine PET- oder Kunststoffannahme daraus ableiten.',results:[]};
  const matches=data.stations.filter(station=>station.postalCode===postalCode && station.materials.includes(selected));
  return {status:matches.length?'ok':'no_matches',message:matches.length?'Passende Sammelstellen im angegebenen Zürcher Postleitzahlgebiet.':'Keine passenden Einträge im Datensatz. Das beweist nicht, dass es vor Ort keine Annahmestelle gibt.',...common,totalMatches:matches.length,results:matches.slice(0,limit),limitations:['PLZ-Filter, keine Distanzsortierung. Keine Aussage zur nächstgelegenen Stelle.','Keine Öffnungszeiten, aktuellen Betriebsmeldungen oder detaillierten Materialbedingungen enthalten.']};
}
