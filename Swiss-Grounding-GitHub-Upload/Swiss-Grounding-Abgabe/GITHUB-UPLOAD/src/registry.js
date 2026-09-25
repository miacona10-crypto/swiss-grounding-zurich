// Fixed authority registry: user input never becomes a network URL.
export const cities = { zuerich: 'Stadt Zürich' };
export const topics = ['registration', 'cardboard', 'waste', 'collection_calendar', 'recycling_locations', 'debt_extract'];
const z = 'https://www.stadt-zuerich.ch';
const entries = [
 ['zh-registration','zuerich',['registration'], z+'/de/lebenslagen/einwohner-services/umziehen-melden/zuzug.html','Zuzug in die Stadt Zürich'],
 ['zh-cardboard','zuerich',['cardboard'], z+'/de/umwelt-und-energie/entsorgung/was-entsorgen/karton.html','Karton: geeignete Materialien'],
 ['zh-cardboard-collection','zuerich',['cardboard'], z+'/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/kartonsammlung.html','Kartonsammlung: Bereitstellung und Sammeltag'],
 ['zh-calendar','zuerich',['collection_calendar'], z+'/de/umwelt-und-energie/entsorgung/entsorgungskalender.html','Entsorgungskalender Zürich'],
 ['zh-locations','zuerich',['recycling_locations','waste'], z+'/wertstoffsammelstelle','Wertstoff-Sammelstellen Zürich'],
 ['zh-debt','zuerich',['debt_extract'], z+'/de/lebenslagen/einwohner-services/betreibungen/betreibungsregisterauszug-bestellen.html','Betreibungsregisterauszug Zürich'],
];
entries.push(['zh-local-move','zuerich',[],z+'/umzug','Umzug innerhalb der Stadt Zürich']);
entries.push(['zh-pma-locations','zuerich',[],z+'/de/lebenslagen/einwohner-services/dokumente-und-bestaetigungen/lebensbestaetigung.html','Standorte Personenmeldeamt Zürich']);
entries.push(['zh-first-steps','zuerich',[],z+'/de/lebenslagen/neu-in-zuerich/erste-schritte.html','Erste Schritte in Zürich']);
entries.push(['zh-retail-return','zuerich',[],z+'/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/verkaufsstelle.html','Zurück an die Verkaufsstelle']);
// Additional pages on the same municipal authority, through the same policy-aware reader.
for(const [id,path,title] of [
 ['coupons','/de/aktuell/medienmitteilungen/2024/09/die-stadt-zuerich-setzt-auf-quartiernahe-entsorgung.html','Abschaffung der Entsorgungs-Coupons'],
 ['yards','/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/recyclinghof.html','Recyclinghöfe'],
 ['pickup','/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/abfuhr-sperrgut-metall-elektro-grubengut.html','Abholung von Sperrgut und Elektrogeräten'],
 ['bulky','/de/umwelt-und-energie/entsorgung/was-entsorgen/sperrgut.html','Sperrgut'],
 ['mobile','/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/mobiler-recyclinghof.html','Mobiler Recyclinghof'],
 ['sack','/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/abfuhr-hauskehricht.html','Hauskehricht und Züri-Sack'],
 ['paper','/papiersammlung','Papiersammlung'],
 ['hazard','/sonderabfall-sammelstelle','Sonderabfall-Sammelstelle Hagenholz'],
 ['hazardous','/de/umwelt-und-energie/entsorgung/was-entsorgen/sonderabfall.html','Sonderabfall'],
 ['bio','/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/abfuhr-bioabfall.html','Bioabfallsammlung'],
 ['plastic','/de/umwelt-und-energie/entsorgung/wo-und-wann-entsorgen/kunststoffsammlung.html','Kunststoffsammlung']
])entries.push(['zh-'+id,'zuerich',[],z+path,title]);
export const registry = entries.filter(e=>e[1]==='zuerich').map(([id, city, topics, url, title]) => ({id, city, topics, url, title, authority:cities[city], language:'de'}));
registry.push({id:'sem-eu-mobility',city:'zuerich',topics:[],url:'https://www.sem.admin.ch/sem/de/home/themen/fza_schweiz-eu-efta/eu-efta_buerger_schweiz/faq.html',title:'SEM: Wohnortwechsel mit EU/EFTA-Bewilligung',authority:'Staatssekretariat für Migration SEM',language:'de'});
export const sourcePolicy = {
 'https://www.sem.admin.ch':{termsUrl:'https://www.admin.ch/gov/de/start/rechtliches.html',reviewedOn:'2026-09-25',mode:'local_reference'},
 [z]: {termsUrl:z+'/de/service/rechtliche-hinweise.html',reviewedOn:'2026-09-24',mode:'local_reference'},
};
export const coverage = {
 cities, topics, sourceCount:registry.length,
 languages:{supported:['de'],unsupportedInput:'invalid with reason unsupported_language when recognized; bounded heuristic'},
 materialAvailability:[
  ...['Glas','Metall','Oel','Textilien'].map(material=>({material,verifiedLocations:true,nearest:'straight_line',sources:['data/zurich-geo.json']})),
  {material:'Karton',verifiedLocations:false,calendar:'postal_code',sources:['zh-cardboard-collection','data/zurich-geo.json']},
  {material:'Batterien',verifiedLocations:true,locationSubset:'two municipal recycling yards, household batteries only',nearest:'missing_data',retailerLocator:'https://recycling-map.ch/de/karte',rules:'source_gated',sources:['zh-retail-return','zh-yards','data/zurich-geo.json']},
  ...[['PET','zh-retail-return'],['Kunststoff','zh-plastic'],['Sperrgut','zh-bulky'],['Elektrogeräte','zh-yards'],['Papier','zh-paper'],['Bioabfall','zh-bio'],['Hauskehricht','zh-sack']].map(([material,source])=>({material,verifiedLocations:false,nearest:'missing_data',rules:'source_gated',sources:[source]})),
  {material:'Recyclinghöfe',verifiedLocations:true,nearest:'not_computed',regularHours:'source_gated',liveOpeningHours:false,sources:['zh-yards']},
  {material:'Sonderabfall',verifiedLocations:true,nearest:'not_computed',sources:['zh-hazard','zh-hazardous']}
 ],
 mcp:{primaryTool:'get_zurich_guidance',metadataTool:'get_swiss_moving_coverage',followUp:'Pass the latest contextToken and the unchanged current user question, including short answers and corrections. pending_question identifies the required field; the server validates values. Omit optional topic unless explicitly chosen.',transport:'stdio',contextLifetimeMinutes:60},
 cityTopics: Object.fromEntries(Object.keys(cities).map(city=>[city,[...new Set(registry.filter(s=>s.city===city).flatMap(s=>s.topics))]])),
 structuredData: {tool:'get_zurich_guidance',city:'zuerich',materials:['Glas','Metall','Oel','Textilien','Karton'],filter:'verified address / district / postal code; cardboard calendar by postal code; straight-line distance for exact addresses',maxAgeDays:7},
 mode:'Case-bound Zürich guidance with citations, clarification and explicit limits',
 limitations:['Zürich: postal-code cardboard dates and straight-line recycling distances. No pedestrian routing, live collection status or calendars for other cities.',
 'Battery retailer-return rule and two municipal household-battery acceptance sites when confirmed from city sources. Recycling-Map linked for retailer search; no copied third-party database or verified nearest battery/PET/plastic branch.',
 'Existing EU/EFTA B/C/L mobility when citizenship and Swiss origin are supplied; live SEM clause-gated. Other permit cases receive a referral. No permit eligibility decisions or comprehensive moving checklist.',
 'Deutsch only. Recognizable FR/IT/RM/EN input is declined with a language reason; this is a limited heuristic, not universal language recognition. No multilingual end-to-end claim.',
 'Dynamic maps, PDFs and downstream forms are linked but not parsed.',
 'Sources can change, fail or restrict access. A retrieved passage is not automatically an answer.'],
};
