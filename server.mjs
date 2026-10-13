import http from 'node:http';
import path from 'node:path';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {createLocalHandler} from './server/local-api.mjs';
import {readProxyConfig} from './server/local-config.mjs';
const root=fileURLToPath(new URL('./public/',import.meta.url)).replace(/[\/]$/,'');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp4':'video/mp4','.svg':'image/svg+xml'};
export function createWardrobeServer({env={},handler=createLocalHandler({env})}={}){
 const server=http.createServer(async(req,res)=>{
  try{
   const port=server.address()?.port;
   if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403);res.end();return;}
   const url=new URL(req.url,'http://localhost');
   if(url.pathname.startsWith('/api/')){
    if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host){res.writeHead(403,{'Content-Type':'application/json'});res.end('{"error":"请求来源无效"}');return;}
    await handler(req,res);return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   const name=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=path.resolve(root,'.'+name);
   if(!file.startsWith(root+path.sep)||name.includes('/.')){res.writeHead(404);res.end();return;}
   const info=await stat(file);if(!info.isFile()){res.writeHead(404);res.end();return;}
   res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
   let start=0,end=info.size-1;const range=req.headers.range;
   if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match){res.writeHead(416,{'Content-Range':'bytes */'+info.size});res.end();return;}start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':'bytes */'+info.size});res.end();return;}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);}
   res.setHeader('Content-Length',Math.max(0,end-start+1));if(req.method==='HEAD'||info.size===0){res.end();return;}await pipeline(createReadStream(file,{start,end}),res);
  }catch(error){if(res.headersSent){res.destroy();return;}res.writeHead(error.code==='ENOENT'?404:503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'暂时无法读取，请重试'}));}
 });
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const env=await readProxyConfig(),server=createWardrobeServer({env});
 server.listen(env.PORT,'127.0.0.1',()=>console.log(`数字衣柜：http://127.0.0.1:${env.PORT}/`));
 process.on('SIGTERM',()=>server.close(()=>process.exit()));
 process.on('SIGINT',()=>server.close(()=>process.exit()));
}
