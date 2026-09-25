import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ground,coverage} from './ground.js';
import {findLocations} from './locations.js';
import {createChatService} from './chat.js';
const host='127.0.0.1';
const jsonHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
async function readJson(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>8192)throw Object.assign(Error('Anfrage zu gross.'),{status:413});chunks.push(chunk);}
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid');return input;
}
export async function createDemoServer({chat=createChatService()}={}){
  const files=new Map();
  for(const [url,file,type]of [['/','index.html','text/html'],['/app.js','app.js','text/javascript'],['/style.css','style.css','text/css']])files.set(url,{content:await readFile(new URL('../web/'+file,import.meta.url)),type});
  const server=http.createServer(async(req,res)=>{
    res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','strict-origin-when-cross-origin');
    res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const port=server.address()?.port;
    if(![`${host}:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403);return res.end('Forbidden');}
    if(req.headers.origin&&!['http://'+host+':'+port,'http://localhost:'+port].includes(req.headers.origin)){res.writeHead(403);return res.end('Forbidden');}
    try{
      if(await chat.handle(req,res,readJson))return;
      if(req.method==='GET'&&files.has(req.url)){const file=files.get(req.url);res.writeHead(200,{'content-type':file.type+'; charset=utf-8'});return res.end(file.content);}
      if(req.method==='GET'&&req.url==='/coverage'){res.writeHead(200,jsonHeaders);return res.end(JSON.stringify(coverage));}
      if(req.method==='POST'&&['/search','/locations'].includes(req.url)){
        const input=await readJson(req);const result=req.url==='/locations'?findLocations(input):await ground(input);
        res.writeHead(result.status==='invalid'?400:200,jsonHeaders);return res.end(JSON.stringify(result));
      }
      res.writeHead(404);res.end('Not found');
    }catch(error){if(!res.headersSent){res.writeHead(error.status||400,jsonHeaders);res.end(JSON.stringify({status:'invalid',message:error.status?error.message:'Ungültige Anfrage.',results:[]}));}else res.end();}
  });
  let closePromise;
  const close=()=>closePromise ||= (async()=>{const stopped=new Promise(r=>{server.close(r);server.closeAllConnections();});await chat.close();await stopped;})();
  server.on('close',()=>void chat.close());
  return {server,close};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4173);const app=await createDemoServer();
  app.server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} ist belegt. Beende das andere Startfenster oder verwende einen anderen PORT.`:error.message);void app.close();process.exitCode=1;});
  app.server.listen(port,host,()=>{
    const url=`http://${host}:${port}`;console.error(`Apertus-Demo: ${url}\nDieses Fenster offen lassen. Beenden: Strg+C.`);
    if(process.env.OPEN_BROWSER==='1'&&process.platform==='win32'){const browser=spawn('cmd.exe',['/c','start','',url],{stdio:'ignore',windowsHide:true});browser.on('error',()=>console.error('Bitte die Adresse oben im Browser öffnen.'));}
  });
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close());
}
