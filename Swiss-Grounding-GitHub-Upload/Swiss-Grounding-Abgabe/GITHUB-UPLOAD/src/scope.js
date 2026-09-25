import {normalized} from './geo-data.js';
// Deliberately bounded recognition, not a claim to detect every language/place.
export function languageProblem(text){
 const q=normalized(text);
 return /\b(?:comment puis|comment .*inscri|je (?:veux|viens|demenage)|ou puis|quels documents|dove posso|come (?:posso|mi)|mi trasferisco|quali documenti|cura en|co poss|tge documents|jau (?:sun|vi)|where (?:can|do)|how (?:can|do)|i (?:am|want|move))\b/.test(q)||/[\u0400-\u052f\u0600-\u06ff\u4e00-\u9fff]/.test(q);
}
export function outsideScope(text){
 const q=normalized(text);
 const canton=q.match(/\b(?:in|im|nach|fur)\s+(?:den |dem |im )?kanton\s+(waadt|bern|aargau|zug|zurich|tessin|genf|basel|luzern)\b/);
 if(canton)return {kind:'canton',place:canton[1],answer:`Dieser Server deckt die Stadt Zürich ab, nicht den ganzen Kanton ${canton[1]}. Für kantonale oder andere kommunale Verfahren nutze die zuständige Behörde.`};
 const dest=[...q.matchAll(/\b(?:nach|zielgemeinde|zielort)\b\s*:?\s*(?:der\s+stadt\s+|stadt\s+)?([\p{L}.-]+(?:\s+gallen)?)/gu)].at(-1)?.[1]?.replace(/\.+$/,'');
 const inPlace=q.match(/\b(?:in|fur|a)\s+(?:der\s+stadt\s+|stadt\s+)?(uster|winterthur|bern|basel|baden|dietikon|dubendorf|konstanz|munchen|paris|berlin|luzern|lugano|scuol)\b/)?.[1];
 const excluded=['dem','der','den','einem','einer','meinem','meiner','zuzug','umzug','ablauf','hause','haus','luftlinie','entfernung','postleitzahl','plz','material','adresse','deiner','demnach'];
 const place=dest&&!excluded.includes(dest)?dest:!q.includes('nach zurich')?inPlace:null;
 if(!place||/^(?:zurich|zuerich|zurigo|turitg)$/.test(place))return null;
 const abroad=/^(?:konstanz|munchen|paris|berlin|london|deutschland|frankreich|italien|osterreich)$/;
 return {kind:abroad.test(place)?'outside_switzerland':'municipality',place,answer:abroad.test(place)?`${place}: Dieses Ziel liegt ausserhalb der Schweiz. Der Server deckt ausschliesslich die Stadt Zürich ab und gibt dafür keine ausländischen Regeln oder Gebühren aus.`:`Dieser Server unterstützt ausschliesslich die Stadt Zürich, nicht ${place}. Für diese andere Gemeinde wende dich an deren Einwohneramt oder Entsorgungsstelle.`};
}
