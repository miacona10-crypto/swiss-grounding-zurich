import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('browser demo serves its page and real results via the local API', async () => {
  const port = 47129;
  const child = spawn(process.execPath, ['src/web.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
  });
  try {
    let page;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { page = await fetch(`http://127.0.0.1:${port}/`); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.equal(page?.status, 200);
    assert.match(await page.text(), /Gut ankommen/);
    const result = await fetch(`http://127.0.0.1:${port}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'Wie melde ich meinen Umzug an?', municipality: '' })
    });
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.status, 'needs_clarification');
    assert.deepEqual(data.missingFields, ['municipality']);
  } finally { child.kill(); }
});

test('HTTP locations, input limits and cross-origin protection work',async()=>{
 const port=47130,base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['src/web.js'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
 const post=(body,headers={})=>fetch(base+'/locations',{method:'POST',headers:{'content-type':'application/json',...headers},body});
 try{
  for(let attempt=0;attempt<40;attempt++){try{await fetch(base);break;}catch{await new Promise(r=>setTimeout(r,50));}}
  const response=await post(JSON.stringify({postalCode:'8004',material:'Glas'}));assert.equal(response.status,200);assert.equal((await response.json()).status,'ok');
  assert.equal((await post('{')).status,400);
  assert.equal((await post('null')).status,400);
  assert.equal((await post('x'.repeat(9000))).status,413);
  assert.equal((await post('{}',{origin:'https://example.com'})).status,403);
 }finally{child.kill();}
});
