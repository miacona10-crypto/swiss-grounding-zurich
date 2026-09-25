export const stationColumns=['PLZ','Station','Glas','Metall','Oel','Textilien'];
export function prepareStations(records,year){
 const unique=new Map(),addressMaterials=new Map();let placeholderRows=0;
 for(const row of records){
  if(stationColumns.every(name=>row[name]==='.')){placeholderRows++;continue;}
  if(!Number.isInteger(row._id)||stationColumns.slice(2).some(name=>!['x','.'].includes(row[name])))throw Error('Invalid source fields');
  const station={id:`zh-${year}-${row._id}`,sourceRecordIds:[row._id],postalCode:String(Number(row.PLZ)),address:row.Station?.trim(),materials:stationColumns.slice(2).filter(name=>row[name]==='x')};
  if(!/^8\d{3}$/.test(station.postalCode)||!station.address||station.address==='.')throw Error('Invalid station data');
  const addressKey=JSON.stringify([station.postalCode,station.address]);
  const materialsKey=JSON.stringify(station.materials);
  if(addressMaterials.has(addressKey)&&addressMaterials.get(addressKey)!==materialsKey)throw Error('Conflicting material records');
  addressMaterials.set(addressKey,materialsKey);
  const key=JSON.stringify([station.postalCode,station.address,station.materials]);
  if(unique.has(key))unique.get(key).sourceRecordIds.push(row._id);else unique.set(key,station);
 }
 return {stations:[...unique.values()],placeholderRows};
}
