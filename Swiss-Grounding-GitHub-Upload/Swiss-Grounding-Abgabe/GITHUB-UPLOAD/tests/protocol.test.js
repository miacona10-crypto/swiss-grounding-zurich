import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// A second implementation exercises newline-delimited JSON-RPC without using the MCP client SDK.
test('independent JSON-RPC client initializes and calls tools from another working directory',async()=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL('../src/mcp.js',import.meta.url))],{cwd:fileURLToPath(new URL('../data/',import.meta.url)),stdio:['pipe','pipe','pipe']});
 let buffer='',nextId=0;const pending=new Map();
 child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const data=JSON.parse(line);pending.get(data.id)?.(data);}catch{}}});
 const call=(method,params)=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>reject(Error('protocol timeout')),6000);pending.set(id,response=>{clearTimeout(timer);pending.delete(id);resolve(response);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 try{
  const init=await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'independent-test',version:'1.0.0'}});assert.equal(init.result.serverInfo.name,'swiss-grounding-zuzug');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const tools=await call('tools/list',{});assert.equal(tools.result.tools.length,2);assert.deepEqual(tools.result.tools.map(t=>t.name).sort(),['get_swiss_moving_coverage','get_zurich_guidance']);
  const clarified=await call('tools/call',{name:'get_zurich_guidance',arguments:{question:'Ich möchte mich in Zürich anmelden.'}});
  const guidance=JSON.parse(clarified.result.content[0].text);assert.equal(guidance.status,'needs_clarification');assert.deepEqual(guidance.missingFields,['residenceOrigin']);assert.equal(clarified.result.structuredContent.status,guidance.status);
  const response=await call('tools/call',{name:'get_zurich_guidance',arguments:{question:'Metall in 8004 Zürich entsorgen'}});
  const payload=JSON.parse(response.result.content[0].text);assert.equal(payload.status,'ok');assert.ok(payload.results.every(x=>x.materials.includes('Metall')));
 }finally{child.kill();}
});
