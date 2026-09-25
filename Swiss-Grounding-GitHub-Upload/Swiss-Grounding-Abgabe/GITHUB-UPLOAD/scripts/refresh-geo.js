import {writeFile,rename} from 'node:fs/promises';
import robotsParser from 'robots-parser';
import {buildGeoData,DATASETS,sha256} from '../src/geo-data.js';
const allowed=new Set(['https://data.stadt-zuerich.ch','https://www.ogd.stadt-zuerich.ch']);
const robots=new Map(),lastRequest=new Map(),provenance=[];
async function raw(url,maxBytes=30000000){
 if(!allowed.has(new URL(url).origin))throw Error('Untrusted data origin');
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000),headers:{'User-Agent':'SwissGroundingPrototype/0.4 (local hackathon data refresh)'}});
 let size=0;const chunks=[];for await(const chunk of response.body||[]){size+=chunk.length;if(size>maxBytes)throw Error('Dataset exceeds size limit');chunks.push(chunk);}
 return {status:response.status,text:Buffer.concat(chunks).toString('utf8')};
}
async function get(url){
 const origin=new URL(url).origin;
 if(process.env.RESPECT_ROBOTS!=='false'&&!robots.has(origin)){
  const r=await raw(origin+'/robots.txt',200000);if(![200,404].includes(r.status))throw Error('robots_unavailable');
  robots.set(origin,robotsParser(origin+'/robots.txt',r.status===404?'':r.text));
 }
 const policy=robots.get(origin);if(policy?.isAllowed(url,'SwissGroundingPrototype')===false)throw Error('robots_disallowed');
 const delay=Math.max(1,policy?.getCrawlDelay('SwissGroundingPrototype')||1)*1000;if(delay>30000)throw Error('Crawl delay exceeds refresh budget');
 await new Promise(r=>setTimeout(r,Math.max(0,(lastRequest.get(origin)||0)+delay-Date.now())));
 lastRequest.set(origin,Date.now());let r;try{r=await raw(url);}catch(error){throw Error('Datenabruf fehlgeschlagen: '+new URL(url).pathname+' ('+error.name+'). Bisheriger Datenstand bleibt erhalten.');}if(r.status!==200)throw Error('Source HTTP '+r.status);
 provenance.push({url,sha256:sha256(r.text),fetchedAt:new Date().toISOString()});return r.text;
}
async function wfs(dataset,type,extra={}){
 const base='https://www.ogd.stadt-zuerich.ch/wfs/geoportal/'+dataset;
 const common={service:'WFS',version:'1.1.0',request:'GetFeature',typename:type};
 const data=JSON.parse(await get(base+'?'+new URLSearchParams({...common,outputFormat:'GeoJSON',srsName:'EPSG:4326',maxFeatures:'100000',...extra})));
 if(!Array.isArray(data.features)||!data.features.length||data.features.length>=100000)throw Error('WFS response missing or reaches requested limit');return data;
}
const metadata={};
for(const [key,name]of Object.entries(DATASETS)){
 const m=JSON.parse(await get('https://data.stadt-zuerich.ch/api/3/action/package_show?id='+name));
 if(!m.success||!m.result)throw Error('Invalid metadata');
 if(process.env.RESPECT_TERMS!=='false'&&m.result.license_id!=='cc-zero')throw Error('Dataset licence changed; review before reuse');metadata[key]=m.result;
}
const year=new Date().getUTCFullYear(),resource=metadata.calendar.resources.find(r=>r.name===`entsorgungskalender_karton_${year}.csv`&&r.datastore_active);
if(!resource||!/^[-a-f0-9]{36}$/i.test(resource.id))throw Error('Current-year cardboard calendar unavailable');
console.log('Amtliche Sammelstellen, Adressen, Kreise und Kartontermine werden geladen. Dies kann einige Minuten dauern.');
const stations=await wfs('Sammelstelle','poi_sammelstelle_view');
const addresses=await wfs('Adressen_Stadt_Zuerich','adrstzh_adressen_stzh_p',{propertyName:'adresse,hausnummer,lokalisationsname,plz,stadtkreis,status_txt,hausnummer_koord_lat,hausnummer_koord_long'});
const districts=await wfs('Stadtkreise','adm_stadtkreise_a');
const calendar=JSON.parse(await get('https://data.stadt-zuerich.ch/api/3/action/datastore_search?resource_id='+resource.id+'&limit=10000'));
const data=buildGeoData({stations,addresses,districts,calendar,year,provenance});
const target=new URL('../data/zurich-geo.json',import.meta.url),tmp=new URL('../data/zurich-geo.json.tmp',import.meta.url);
await writeFile(tmp,JSON.stringify(data));await rename(tmp,target);
console.log(JSON.stringify({saved:true,...data.counts,downloadedAt:data.downloadedAt}));
