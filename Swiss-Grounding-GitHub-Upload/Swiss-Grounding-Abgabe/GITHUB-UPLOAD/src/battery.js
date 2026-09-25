import {defaultRetriever} from './retrieve.js';
import {normalized,distanceMeters} from './geo-data.js';
// Only contacts and acceptance published together by the municipal operator.
// Recycling Map is linked for the broader retailer network, never copied.
export async function batteryLocations({data,origin,read=()=>defaultRetriever.retrieve('zh-yards')}={}){
 let doc;try{doc=await read();}catch{return null;}
 if(doc.status!=='retrieved')return null;
 const blocks=doc.doc?.blocks||[],row=blocks.find(b=>/Haushaltsbatterien/.test(b.text)&&/\|\s*Gratis/.test(b.text));
 const scope=blocks.find(b=>/Recyclinghöfe Looächer und Werdhölzli/.test(b.text)&&/haushaltsüblichen Mengen/.test(b.text));
 if(!row||!scope)return null;
 const source={id:'battery-yards',title:doc.title,url:doc.url,authority:'Stadt Zürich',retrievedAt:doc.retrievedAt,contentSha256:doc.contentSha256,passages:[{id:'battery_acceptance',heading:'Annahme in den städtischen Recyclinghöfen',text:row.text,truncated:false},{id:'household_scope',heading:'Haushaltsübliche Mengen',text:scope.text,truncated:false}]};
 const results=[];
 for(const contact of doc.doc.contacts||[]){
  if(!/^Recyclinghof (?:Looächer|Werdhölzli)/.test(contact.title)||contact.city!=='Zürich')continue;
  const address=contact.streets[0],points=data.addresses.filter(p=>normalized(p.address)===normalized(address)&&p.postalCode===contact.postalCode);
  source.passages.push({id:'contact_'+results.length,heading:contact.title,text:`${address}, ${contact.postalCode} Zürich`,truncated:false});
  const point=points.length===1?points[0]:null;
  results.push({id:'battery-'+contact.postalCode,name:contact.title,address,postalCode:contact.postalCode,materials:['Batterien'],...(point?{district:point.district,lat:point.lat,lon:point.lon,mapUrl:`https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=17/${point.lat}/${point.lon}`,...(origin?{distanceMeters:Math.round(distanceMeters(origin,point)/10)*10}:{})}:{})});
 }
 if(!results.length)return null;
 if(origin)results.sort((a,b)=>(a.distanceMeters??Infinity)-(b.distanceMeters??Infinity));
 return {source,results};
}
export function batterySearchAction(postalCode){return {label:'Weitere Batterie-Annahmestellen auf Recycling-Map suchen',url:'https://recycling-map.ch/de/karte'+(/^8\d{3}$/.test(postalCode||'')?'?zip='+postalCode:'')};}
