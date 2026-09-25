import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { coverage } from './registry.js';
import {createWasteAssistant} from './waste.js';
import {createGuidance} from './guidance.js';
export function createServer(){
 const server=new McpServer({name:'swiss-grounding-zuzug',version:'0.6.0'});
 const waste=createWasteAssistant();
 const guide=createGuidance({waste});
 server.registerTool('get_zurich_guidance',{
  description:'ONLY factual entry point for moving to or within Zürich CITY: registration, supported waste/recycling, nearest recorded collection points, cardboard dates and debt-register extracts. Also use for every follow-up, short answer, correction and topic change. Pass the current user message unchanged as question and the most recent contextToken; topic is optional, omit it unless explicitly selected by the user. Never invent origin, nationality, address, postcode or eligibility. The server validates data and returns status, pending_question, missingFields, nextQuestion/options, conditional claims with citations, actions and optional map coordinates. For needs_clarification ask nextQuestion and call THIS tool again with the user reply and contextToken. For partial/missingData describe the data gap; do not infer a nearest branch, hours or eligibility. Preserve conditions, sources and limitations. Other municipalities are not supported destinations. German dialogue is validated; arbitrary language coverage is not claimed. get_swiss_moving_coverage supplies metadata only, not factual answers.',
  inputSchema:z.object({question:z.string().trim().min(1).max(2000),contextToken:z.string().max(100).optional(),topic:z.enum(['registration','debt_extract','waste']).optional()}),
  outputSchema:z.object({schema:z.literal('zurich-guidance-v1'),status:z.string().describe('ok, partial, needs_clarification, out_of_scope, unavailable, no_matches or invalid'),answer:z.string().describe('Authoritative complete fallback answer; preserve conditions and limitations'),contextToken:z.string().optional().describe('Opaque server-process-local token; pass on the next turn of this conversation only'),pending_question:z.object({field:z.string().describe('Typed missing value, e.g. house_number, city_confirmation, origin, nationality'),reason:z.string(),options:z.array(z.string())}).nullable().optional(),missingFields:z.array(z.string()).optional(),nextQuestion:z.string().nullable().optional(),options:z.array(z.string()).optional()}).passthrough(),
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}
 },async args=>{const result=await guide(args);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};});
 server.registerTool('get_swiss_moving_coverage',{
  description:'Inspect supported municipalities, topics and known limitations before broad Swiss questions.',
  inputSchema:z.object({}),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
 },async()=>({content:[{type:'text',text:JSON.stringify(coverage)}]}));
 return server;
}
void serveStdio(createServer);
