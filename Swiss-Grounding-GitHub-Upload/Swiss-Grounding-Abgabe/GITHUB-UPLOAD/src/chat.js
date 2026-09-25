import {randomBytes, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {completion, runQuestion, modelTools, safeText, serverEnvironment} from '../APERTUS-TEST.mjs';

const token=()=>randomBytes(32).toString('hex');
const fail=(status,message)=>Object.assign(Error(message),{status});
const clean=(value,key)=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='string'?safeText(v,key):v));
const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
export async function openMcp(){
  const client=new Client({name:'swiss-grounding-demo',version:'0.6.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./mcp.js',import.meta.url))],env:serverEnvironment(process.env),stderr:'pipe'});
  try{await client.connect(transport);transport.stderr?.on('data',()=>{});return {client,tools:modelTools((await client.listTools()).tools)};}
  catch(error){await client.close();throw error;}
}
// The server stays on loopback. Browser sessions, credentials and chats live in memory.
// Injectable dependencies are exclusively for tests; there is no HTTP mock mode.
export function createChatService({connect=openMcp,ask=completion,initialKey=process.env.SWISSCOM_API_KEY||'',now=Date.now}={}){
  const sessions=new Map();let closed=false;
  const closeMcp=async s=>{const mcp=s.mcp;s.mcp=null;if(mcp)await mcp.client.close().catch(()=>{});};
  const dispose=async s=>{s.controller?.abort();s.key='';s.history=[];s.transcript=[];await closeMcp(s);};
  const sweep=async()=>{for(const [id,s]of sessions)if(!s.busy&&now()-s.touched>3600000){sessions.delete(id);await dispose(s);}};
  const timer=setInterval(()=>void sweep(),60000);timer.unref();
  return {
    async handle(req,res,readJson){
      if(!req.url.startsWith('/api/'))return false;
      try{
        if(closed)throw fail(503,'Der Server wird beendet.');
        await sweep();
        const id=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('sg_session='))?.slice(11);
        let s=id&&sessions.get(id);
        if(req.method==='GET'&&req.url==='/api/session'){
          if(!s){
            if(sessions.size>=8)throw fail(429,'Zu viele lokale Sitzungen. Bitte das Startfenster neu starten.');
            const sessionId=token();s={csrf:token(),key:initialKey.trim(),history:[],transcript:[],turns:0,touched:now(),busy:false,mcp:null,controller:null};sessions.set(sessionId,s);
            res.setHeader('set-cookie',`sg_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/`);
          }
          s.touched=now();send(res,200,{csrf:s.csrf,configured:!!s.key,turns:s.turns,messages:clean(s.transcript,s.key)});return true;
        }
        if(req.method!=='POST'||!['/api/key','/api/reset','/api/disconnect','/api/chat'].includes(req.url))throw fail(404,'Nicht gefunden.');
        if(!s)throw fail(401,'Sitzung abgelaufen. Bitte die Seite neu laden und den Schlüssel erneut eingeben.');
        const csrf=req.headers['x-csrf-token'];
        if(typeof csrf!=='string'||!/^[a-f0-9]{64}$/.test(csrf)||!timingSafeEqual(Buffer.from(csrf),Buffer.from(s.csrf)))throw fail(403,'Ungültige Sitzung. Bitte die Seite neu laden.');
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw fail(415,'JSON erforderlich.');
        const input=await readJson(req);
        // Acquire after reading the body: simultaneous requests cannot pass together.
        if(s.busy)throw fail(409,'Eine Antwort läuft bereits. Bitte warten oder zuerst abbrechen.');
        s.busy=true;s.touched=now();
        try{
          if(req.url==='/api/key'){
            if(typeof input.key!=='string'||!input.key.trim()||input.key.length>4096||/\s/.test(input.key.trim()))throw fail(400,'Bitte den vollständigen Schlüssel ohne Leerzeichen einfügen.');
            await dispose(s);s.key=input.key.trim();s.turns=0;send(res,200,{configured:true});return true;
          }
          if(req.url==='/api/disconnect'){await dispose(s);s.turns=0;send(res,200,{configured:false});return true;}
          if(req.url==='/api/reset'){s.history=[];s.transcript=[];s.turns=0;send(res,200,{ok:true});return true;}
          if(!s.key)throw fail(401,'Bitte zuerst deinen Swisscom-Schlüssel hinterlegen.');
          if(typeof input.question!=='string'||!input.question.trim()||input.question.length>2000)throw fail(400,'Bitte eine Frage mit 1 bis 2000 Zeichen eingeben.');
          if(s.turns>=20)throw fail(409,'Bitte «Neues Gespräch» wählen. Ein Testgespräch umfasst höchstens zwanzig Fragen.');
          const controller=new AbortController();s.controller=controller;
          // Upper bound includes all model calls, tool calls and queueing.
          const deadline=setTimeout(()=>controller.abort(),300000);deadline.unref();
          res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store'});res.flushHeaders();
          const emit=data=>{if(!res.destroyed)res.write(JSON.stringify(clean(data,s.key))+'\n');};
          const onClose=()=>{if(!res.writableEnded)controller.abort();};
          res.on('close',onClose);
          try{
            emit({event:'status',message:'Quellenwerkzeuge werden verbunden …'});
            if(!s.mcp)s.mcp=await connect();
            if(controller.signal.aborted)throw Error('Anfrage abgebrochen.');
            emit({event:'status',message:'Apertus prüft deine Frage …'});
            const result=await runQuestion({question:input.question.trim(),history:s.history,client:s.mcp.client,tools:s.mcp.tools,formulate:input.formulate===true,
              ask:params=>{if(controller.signal.aborted)throw Error('Anfrage abgebrochen.');return ask({key:s.key,...params,signal:controller.signal});},
              onTrace:trace=>{if(controller.signal.aborted)throw Error('Anfrage abgebrochen.');emit({event:'trace',trace});}});
            if(controller.signal.aborted)throw Error('Anfrage abgebrochen.');
            s.history=result.history;s.turns++;
            const {contextToken:privateToken,...serverResult}=result.serverResult||{};
            const visible={question:input.question.trim(),answer:result.answer,originalAnswer:result.originalAnswer,serverResult,formulation:result.formulation,answerOrigin:result.answerOrigin||'apertus',traces:result.traces,metrics:result.metrics};s.transcript.push(visible);
            emit({event:'answer',...visible,turns:s.turns});
          }catch(error){emit({event:'error',message:safeText(error.message||'Die Antwort konnte nicht erstellt werden.',s.key)});await closeMcp(s);}
          finally{clearTimeout(deadline);res.off('close',onClose);s.controller=null;res.end();}
        }finally{s.busy=false;s.touched=now();}
      }catch(error){if(!res.headersSent)send(res,error.status||400,{message:error.status?error.message:'Ungültige Anfrage.'});else res.end();}
      return true;
    },
    async close(){if(closed)return;closed=true;clearInterval(timer);await Promise.all([...sessions.values()].map(dispose));sessions.clear();}
  };
}
