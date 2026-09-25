import { Parser } from 'htmlparser2';
export const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// This deliberately reads visible HTML only. Dynamic maps and PDFs need their own adapters.
export function extract(html, baseUrl, readTables = true) {
  const blocks = [], links = [], contacts = [], stack = [], headings = [];
  let hidden = 0, text = '', title = '', inTitle = false, anchor = null;
  let activeHeading = null, firstH1 = -1;
  const boundary = new Set(['p', 'li', 'div', 'section', 'br', 'tr', 'dt', 'dd']);
  const clean = value => value.replace(/\s+/g, ' ').trim();
  function flush() {
    const value = clean(text);
    if (value.length > 1) blocks.push({ heading: headings.filter(Boolean).join(' › '), text: value });
    text = '';
  }
  const parser = new Parser({
    onopentag(name, attrs) {
      const suppress = ['script','style','nav','footer','header','form','noscript','svg','template'].includes(name)
        || 'hidden' in attrs || attrs['aria-hidden'] === 'true'
        || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrs.style || '')
        || /(?:cookie|outdated-browser|login-form|cookieconsent)/i.test((attrs.class || '') + ' ' + (attrs.id || ''));
      stack.push({name, suppress});
      if (suppress) hidden++;
      if (name === 'title') inTitle = true;
      if (hidden) return;
      // The city publishes some prices in inert JSON table attributes.
      // Parse bounded cells as text, never run the web component or its scripts.
      if (readTables && name === 'stzh-datatable' && (attrs.rows||'').length < 200000) {
        try {
          const rows=JSON.parse(attrs.rows||'[]');
          if(Array.isArray(rows)&&rows.length<=100) for(const row of rows){
            if(!Array.isArray(row)||row.length>10||!row.every(c=>typeof c?.value==='string'&&c.value.length<5000))continue;
            const cells=row.map(c=>extract(c.value,baseUrl,false).blocks.map(b=>b.text).join(' '));
            if(cells.some(Boolean))blocks.push({heading:headings.filter(Boolean).join(' › '),text:cells.join(' | ')});
          }
        } catch {}
      }
      // Public address data rendered by the city's contact web component.
      // Read only bounded contact fields, never execute component code.
      if (name === 'stzh-contact') {
        try {
          const streets = JSON.parse(attrs.street || '[]');
          if (Array.isArray(streets) && streets.length < 5 && streets.every(s=>typeof s==='string'&&s.length<200) && /^\d{4}$/.test(attrs['postal-code'] || '')) {
            contacts.push({title:String(attrs.heading||'').slice(0,200),streets,postalCode:attrs['postal-code'],city:String(attrs.location||'').slice(0,100)});
          }
        } catch {}
      }
      if (/^h[1-6]$/.test(name)) {
        flush();
        activeHeading = {level: Number(name[1]), text: ''};
        if (name === 'h1' && firstH1 < 0) firstH1 = blocks.length;
      }
      if (!activeHeading && boundary.has(name)) flush();
      if (name === 'a' && attrs.href) anchor = {href: attrs.href, label: ''};
    },
    ontext(value) {
      if (inTitle) title += value;
      if (hidden || inTitle) return;
      if (activeHeading) activeHeading.text += value + ' ';
      else text += value + ' ';
      if (anchor) anchor.label += value;
    },
    onclosetag(name) {
      if (!hidden) {
        if (/^h[1-6]$/.test(name) && activeHeading) {
          const {level, text: label} = activeHeading;
          headings.length = level;
          headings[level - 1] = clean(label);
          activeHeading = null;
        }
        if (!activeHeading && boundary.has(name)) flush();
        if (name === 'a' && anchor) {
          try {
            const url = new URL(anchor.href, baseUrl);
            if (url.protocol === 'https:') links.push({url: url.href, title: clean(anchor.label)});
          } catch {}
          anchor = null;
        }
      }
      if (name === 'title') inTitle = false;
      const element = stack.pop();
      if (element?.suppress) hidden--;
    }
  }, {decodeEntities: true});
  parser.write(html); parser.end(); flush();
  return {
    title: clean(title),
    blocks: blocks.slice(Math.max(0, firstH1)),
    links: [...new Map(links.filter(link => link.title).map(link => [link.url, link])).values()],
    contacts
  };
}

export function passages(doc, query, topic, maxChars = 6000) {
  const hints = {
    registration: ['anmeld','zuzug','dokument','gebuhr','frist','ausland'],
    cardboard: ['karton','altstadt','bereitstell','zugelassen'],
    waste: ['kehricht','gebuhr','sperrgut','grun','glas'],
    collection_calendar: ['kalender','adresse','strasse','hausnummer','abfuhr'],
    recycling_locations: ['sammelstelle','offnungs','glas','standort'],
    debt_extract: ['betreib','auszug','zustand','bestell','gebuhr']
  };
  const terms = normalize(query).split(/[^a-z0-9]+/).filter(t => t.length > 3 && !['zuerich','zurich','winterthur','uster','welche','welchen','meine','meinen','bitte'].includes(t));
  // Cross-language intent expansion affects retrieval, not the factual content.
  if (/document|unterlag|mitbring|dovrel/.test(normalize(query))) terms.push('dokument', 'unterlag');
  if (/deadline|delai|frist|entro|termin/.test(normalize(query))) terms.push('14', 'tage', 'anmeld');
  if (/cost|cout|costo|gebuhr|kost/.test(normalize(query))) terms.push('gebuhr');
  const groups = [];
  for (const block of doc.blocks) {
    let group = groups.at(-1);
    if (!group || group.heading !== block.heading || group.text.length + block.text.length > 2100) {
      group = {heading: block.heading, text: ''}; groups.push(group);
    }
    group.text += (group.text ? '\n' : '') + block.text;
  }
  let scored = groups.map((group, index) => {
    const heading = normalize(group.heading), text = normalize(group.text);
    const topicScore = (hints[topic] || []).reduce((n, term) => n + (text.includes(term) ? 1 : 0), 0);
    const queryScore = terms.reduce((n, term) => n + (text.includes(term) ? 3 : 0) + (heading.includes(term) ? 4 : 0), 0);
    return {...group, index, score: topicScore + queryScore};
  }).filter(group => group.score > 0 && (group.text.length >= 40 || (/nicht zugelassen|das nicht|nicht erlaubt/.test(normalize(group.heading)) && group.text.length >= 15)));
  // Never mix paper/green-waste rules into a cardboard result when a cardboard section exists.
  if (topic === 'cardboard' && scored.some(group => /karton/.test(normalize(group.heading)))) {
    scored = scored.filter(group => /karton/.test(normalize(group.heading)) || (/nicht zugelassen|das nicht|nicht erlaubt/.test(normalize(group.heading)) && /karton/.test(normalize(group.text))));
  }
  scored.sort((a,b) => b.score-a.score || a.index-b.index);
  const out = []; let used = 0;
  for (const group of scored) {
    if (out.length === 4 || used >= maxChars) break;
    const text = group.text.slice(0, Math.min(2200, maxChars-used));
    out.push({id:`p${group.index}`, heading:group.heading, text, truncated:text.length < group.text.length});
    used += text.length;
  }
  return out.sort((a,b) => Number(a.id.slice(1))-Number(b.id.slice(1)));
}
