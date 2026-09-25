import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('a real MCP client negotiates protocol, lists tools and receives clarification', async () => {
  const client = new Client({ name: 'integration-check', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/mcp.js'] }));
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.some(t => t.name === 'get_zurich_guidance'));
    const result = await client.callTool({
      name: 'get_zurich_guidance',
      arguments: { question: 'Wie melde ich mich nach dem Umzug an?' }
    });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.status, 'needs_clarification');
    assert.deepEqual(data.missingFields, ['municipality']);
  } finally {
    await client.close();
  }
});

test('MCP exposes coverage and real local dataset rows with schema enforcement', async () => {
 const client=new Client({name:'dataset-check',version:'1.0.0'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:['src/mcp.js']}));
 try {
  const list=await client.listTools();assert.equal(list.tools.length,2);
  const coverage=JSON.parse((await client.callTool({name:'get_swiss_moving_coverage',arguments:{}})).content[0].text);
  assert.deepEqual(Object.keys(coverage.cities).sort(),['zuerich']);
  const result=JSON.parse((await client.callTool({name:'get_zurich_guidance',arguments:{question:'Glas in 8004 Zürich entsorgen'}})).content[0].text);
  // This integration check also makes an expired/missing release snapshot visible.
  assert.equal(result.status,'ok');assert.ok(result.results.length>0);assert.ok(result.results.every(x=>x.postalCode==='8004'&&x.materials.includes('Glas')));
  const invalid=await client.callTool({name:'get_zurich_guidance',arguments:{question:''}});
  assert.equal(invalid.isError,true);
 }finally{await client.close();}
});
