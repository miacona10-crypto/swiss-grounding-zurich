import {readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const DATASETS={stations:'geo_sammelstelle',addresses:'geo_adressen_stadt_zuerich',districts:'geo_stadtkreise',calendar:'entsorgungskalender_karton'};
export const SOURCE_LINKS=Object.entries(DATASETS).map(([id,name])=>({id,title:({stations:'Amtliche Sammelstellen mit Koordinaten',addresses:'Amtliche Gebäudeadressen Zürich',districts:'Amtliche Stadtkreisgrenzen',calendar:'Amtlicher Kartonkalender nach PLZ'})[id],url:'https://data.stadt-zuerich.ch/dataset/'+name}));
export function normalized(value){return String(value||'').toLowerCase().replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/zuerich/g,'zurich').trim();}
export function distanceMeters(a,b){const rad=Math.PI/180,dy=(b.lat-a.lat)*rad,dx=(b.lon-a.lon)*rad;const h=Math.sin(dy/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dx/2)**2;return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,h)));}
export function inRing([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
export function inGeometry(point,g){const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];return polygons.some(p=>inRing(point,p[0])&&!p.slice(1).some(h=>inRing(point,h)));}
function point(lat,lon){if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<47.30||lat>47.45||lon<8.44||lon>8.65)throw Error('Invalid Zürich coordinates');return {lat,lon};}
function collection(d){if(d?.type!=='FeatureCollection'||!Array.isArray(d.features))throw Error('Invalid GeoJSON collection');return d.features;}
export function buildGeoData({stations,addresses,districts,calendar,year,downloadedAt=new Date().toISOString(),provenance=[]}){
  const borders=collection(districts).map(f=>({district:Number(f.properties.name),geometry:f.geometry}));
  if(borders.length!==12||new Set(borders.map(b=>b.district)).size!==12||borders.some(b=>b.district<1||b.district>12||!['Polygon','MultiPolygon'].includes(b.geometry?.type)))throw Error('Expected all 12 district polygons');
  const points=collection(stations).filter(f=>f.properties.publish_internet==='1').map(f=>{
    const p=f.properties,c=f.geometry;if(c?.type!=='Point')throw Error('Station geometry missing');
    const coords=point(c.coordinates[1],c.coordinates[0]);
    for(const key of ['glas','metall','oel','textilien'])if(![null,'X'].includes(p[key]))throw Error('Unknown material flag');
    const hits=borders.filter(b=>inGeometry(c.coordinates,b.geometry));
    if(hits.length!==1)throw Error('Station cannot be assigned to one district');
    if(!p.poi_id||!p.adresse||!/^8\d{3}$/.test(p.plz))throw Error('Invalid station identity');
    return {id:p.poi_id,address:p.adresse,postalCode:p.plz,district:hits[0].district,...coords,materials:['glas','metall','oel','textilien'].filter(k=>p[k]==='X').map(k=>({glas:'Glas',metall:'Metall',oel:'Oel',textilien:'Textilien'})[k])};
  });
  if(points.length<100||new Set(points.map(p=>p.id)).size!==points.length)throw Error('Incomplete or duplicate stations');
  const rows=collection(addresses).filter(f=>f.properties.status_txt==='real').map(f=>{
    const p=f.properties,postalCode=String(p.plz),district=Number(p.stadtkreis);
    if(!p.adresse||!p.lokalisationsname||!p.hausnummer||!/^8\d{3}$/.test(postalCode)||!Number.isInteger(district)||district<1||district>12)throw Error('Invalid real address');
    return {id:f.id,address:p.adresse,street:p.lokalisationsname,number:p.hausnummer,postalCode,district,...point(p.hausnummer_koord_lat,p.hausnummer_koord_long)};
  });
  if(rows.length<30000)throw Error('Incomplete address collection');
  const events=calendar?.result?.records;
  if(!calendar.success||!Array.isArray(events)||events.length!==calendar.result.total||events.length<500)throw Error('Incomplete calendar');
  const dates=events.map(r=>{const postalCode=String(r.PLZ),date=r.Abholdatum;if(!/^8\d{3}$/.test(postalCode)||!new RegExp('^'+year+'-\\d{2}-\\d{2}$').test(date)||new Date(date).toISOString().slice(0,10)!==date)throw Error('Invalid calendar row');return {postalCode,date};});
  const unique=[...new Map(dates.map(d=>[d.postalCode+'|'+d.date,d])).values()];
  return {version:1,license:'cc-zero',downloadedAt,referenceYear:year,provenance,sourceLinks:SOURCE_LINKS,counts:{stations:points.length,rawAddresses:addresses.features.length,realAddresses:rows.length,calendarRows:events.length},stations:points,addresses:rows,calendar:unique};
}
const path=new URL('../data/zurich-geo.json',import.meta.url);let cached,modified;
export function readGeoData(){try{const m=statSync(path).mtimeMs;if(m!==modified){cached=JSON.parse(readFileSync(path));modified=m;}return cached;}catch{return null;}}
export function snapshotProblem(data,now=Date.now()){
  if(!data||data.version!==1||data.license!=='cc-zero'||!data.addresses?.length||!data.stations?.length)return 'Geodaten fehlen oder sind ungültig. Bitte DATEN-AKTUALISIEREN starten.';
  const age=now-Date.parse(data.downloadedAt);
  if(!Number.isFinite(age)||age< -60000||age>7*86400000||data.referenceYear!==new Date(now).getUTCFullYear())return 'Die Geodaten sind nicht mehr aktuell. Bitte DATEN-AKTUALISIEREN starten.';
  return null;
}
export function sha256(value){return createHash('sha256').update(value).digest('hex');}
