import { writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import robotsParser from 'robots-parser';
import { prepareStations, stationColumns } from '../src/dataset.js';
const origin='https://data.stadt-zuerich.ch';
const metadataUrl=origin+'/api/3/action/package_show?id=entsorgungskalender_sammelstellen';
async function raw(url) {
  if(new URL(url).origin!==origin)throw Error('Untrusted origin');
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{'User-Agent':'SwissGroundingPrototype/0.2'}});
  const chunks=[];let size=0;
  for await(const chunk of response.body||[]){size+=chunk.length;if(size>2000000)throw Error('Source too large');chunks.push(chunk);}
  return {status:response.status,text:Buffer.concat(chunks).toString('utf8')};
}
let robot;
if(process.env.RESPECT_ROBOTS!=='false'){
  const r=await raw(origin+'/robots.txt');
  if(![200,404].includes(r.status))throw Error('robots_unavailable');
  robot=robotsParser(origin+'/robots.txt',r.status===404?'':r.text);
}
async function get(url){
  if(robot?.isAllowed(url,'SwissGroundingPrototype')===false)throw Error('robots_disallowed');
  const delay=Math.max(1,robot?.getCrawlDelay('SwissGroundingPrototype')||1);
  if(delay>30)throw Error('crawl_delay_exceeds_budget');
  await new Promise(resolve=>setTimeout(resolve,delay*1000));
  const r=await raw(url);if(r.status!==200)throw Error('HTTP '+r.status);return JSON.parse(r.text);
}
const meta=await get(metadataUrl);
if(!meta.success)throw Error('Invalid CKAN result');
if(process.env.RESPECT_TERMS!=='false'&&meta.result.license_id!=='cc-zero')throw Error('Review changed dataset licence');
const year=new Date().getUTCFullYear();
const resource=meta.result.resources.find(item=>item.name===`entsorgungskalender_sammelstellen_${year}.csv`);
if(!resource||!resource.datastore_active||!/^[-a-f0-9]{36}$/i.test(resource.id)||new URL(resource.url).origin!==origin)throw Error('No current-year dataset with official datastore');
const recordsUrl=origin+'/api/3/action/datastore_search?resource_id='+resource.id+'&limit=2000';
const payload=await get(recordsUrl),result=payload.result;
if(!payload.success||!result||!Array.isArray(result.records)||result.total!==result.records.length||result.total<10)throw Error('Incomplete datastore response');
if(stationColumns.some(name=>!result.fields.some(field=>field.id===name)))throw Error('Schema changed');
const {stations,placeholderRows}=prepareStations(result.records,year);
if(stations.length<10)throw Error('Insufficient station records');
const data={sourceUrl:resource.url,recordsUrl,datasetUrl:origin+'/dataset/entsorgungskalender_sammelstellen',metadataUrl,license:meta.result.license_id,referenceYear:year,downloadedAt:new Date().toISOString(),sourceMetadataModified:meta.result.metadata_modified,rawRecordCount:result.records.length,placeholderRows,sha256:createHash('sha256').update(JSON.stringify(result.records)).digest('hex'),stations};
const directory=new URL('../data/',import.meta.url);await mkdir(directory,{recursive:true});
const tmp=new URL('zurich-locations.json.tmp',directory),target=new URL('zurich-locations.json',directory);
await writeFile(tmp,JSON.stringify(data,null,2));await rename(tmp,target);
console.log(`Saved ${stations.length} unique entries from ${result.records.length} official rows (${placeholderRows} empty placeholders ignored) for ${year}; ${data.license}.`);
