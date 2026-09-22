import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const REPO='misocr/miso-cr-catalogo', BRANCH='main', DATA='catalog.json';
const categories=['Parejas','Familia','Mascotas','Cumpleaños','Aniversarios','Reconocimientos','Deportes','Anime & Fandom','Profesiones y hobbies','Fe e inspiración','Graduación + Escolar','Otros'];
function refFor(path){let h=2166136261;for(let i=0;i<path.length;i++){h^=path.charCodeAt(i);h=Math.imul(h,16777619);}return 'MISO-'+(h>>>0).toString(36).toUpperCase().padStart(6,'0').slice(0,6);}
const random=()=>randomBytes(32).toString('base64url');
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const fail=(status,message)=>Object.assign(new Error(message),{status});
const imagePath=p=>typeof p==='string'&&p.length<=240&&!p.includes('..')&&!p.startsWith('/')&&/^[\w ./-]+\.(jpe?g|png|webp)$/i.test(p);
export function validateItem(input){
 if(!input||typeof input!=='object')throw fail(400,'Ficha inválida.');
 const limits={title:140,category:60,description:1500,keywords:700,price:100};const out={};
 for(const [key,max]of Object.entries(limits)){
  if(typeof input[key]!=='string'||input[key].length>max)throw fail(400,`Campo inválido: ${key}`);
  out[key]=input[key].trim();
 }
 if(!out.title||!categories.includes(out.category)||typeof input.active!=='boolean')throw fail(400,'Completa el nombre y la categoría.');
 out.active=input.active;return out;
}
export function decodeImage(upload){
 if(!upload||typeof upload.base64!=='string'||upload.base64.length>8_000_000||upload.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(upload.base64))throw fail(400,'Imagen inválida o demasiado grande.');
 const bytes=Buffer.from(upload.base64,'base64');let ext;
 if(bytes.length>12&&bytes.subarray(0,3).equals(Buffer.from([255,216,255])))ext='jpg';
 else if(bytes.length>24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';
 else if(bytes.length>16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')ext='webp';
 else throw fail(400,'Solo se aceptan imágenes JPEG, PNG o WebP.');
 const digest=createHash('sha256').update(bytes).digest('hex');
 const blobSha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
 return {bytes,blobSha,path:`uploads/${digest}.${ext}`};
}
export function createApp({env=process.env,fetcher=fetch}={}){
 const origin=env.APP_ORIGIN?.replace(/\/$/,'');
 if(!origin||(!origin.startsWith('https://')&&!(env.NODE_ENV==='test'&&origin.startsWith('http://127.0.0.1'))))throw Error('APP_ORIGIN must be a fixed HTTPS origin.');
 if(new URL(origin).origin!==origin)throw Error('APP_ORIGIN cannot contain a path.');
 const secure=origin.startsWith('https://');const sessionName=secure?'__Host-miso-session':'miso-session',stateName=secure?'__Host-miso-state':'miso-state';
 const sessions=new Map(),flows=new Map(),attempts=new Map();
 const allowed=new Set((env.ADMIN_LOGINS||'misocr').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean));
 const configured=!!(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET);
 const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure?'; Secure':''}`;
 const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
 async function gh(token,path,method='GET',body){
  const response=await fetcher(`https://api.github.com${path}`,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'Miso-private-admin'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok){if(response.status===401)throw fail(401,'Tu sesión venció. Inicia sesión nuevamente.');if(response.status===403)throw fail(403,'GitHub no permite esta operación. Revisa los permisos del catálogo.');if([409,422].includes(response.status))throw fail(409,'El catálogo cambió. Recarga antes de guardar para no sobrescribir otro cambio.');throw fail(502,'No se pudo completar la operación con GitHub. Inténtalo nuevamente.');}
  return response.json();
 }
 async function permission(token){const repo=await gh(token,`/repos/${REPO}`);if(!repo.permissions?.push)throw fail(403,'Esta cuenta no tiene permisos para administrar MISO CR.');}
 async function readCatalog(token){const file=await gh(token,`/repos/${REPO}/contents/${DATA}?ref=${BRANCH}`);const data=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));if(data.version!==1||!Array.isArray(data.items))throw fail(502,'Formato de catálogo no válido.');return {sha:file.sha,data};}
 async function body(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'Se requiere JSON.');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8_500_000)throw fail(413,'Archivo demasiado grande.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(400,'Datos no válidos.');}}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://raw.githubusercontent.com blob: data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  const redirect=where=>{res.writeHead(302,{Location:where});res.end();};
  try{
   const url=new URL(req.url,origin);const route=url.pathname;const now=Date.now();
   for(const map of [sessions,flows,attempts])for(const [key,value]of map)if(value.expires<now)map.delete(key);
   if(req.method==='GET'&&route==='/health')return json(200,{ok:true,loginConfigured:configured});
   if(req.method==='GET'&&['/','/admin','/miso-admin.js','/miso-admin.css'].includes(route)){
    const file=route.endsWith('.js')?'miso-admin.js':route.endsWith('.css')?'miso-admin.css':'miso-admin.html';
    const content=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});return res.end(content);
   }
   if(req.method==='GET'&&route==='/auth/login'){
    if(!configured)throw fail(503,'El panel está preparado, pero falta activar la conexión privada con GitHub.');
    const address=req.socket.remoteAddress;const attempt=attempts.get(address)||{count:0,expires:now+600000};if(++attempt.count>30||flows.size>=500)throw fail(429,'Demasiados intentos. Espera unos minutos.');attempts.set(address,attempt);
    const state=random(),verifier=random(),binding=random();flows.set(state,{verifier,binding,expires:now+600000});res.setHeader('Set-Cookie',cookie(stateName,binding,600));
    const auth=new URL('https://github.com/login/oauth/authorize');auth.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:`${origin}/auth/callback`,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',allow_signup:'false'}).toString();return redirect(auth.href);
   }
   if(req.method==='GET'&&route==='/auth/callback'){
    const state=url.searchParams.get('state'),flow=flows.get(state);flows.delete(state);
    if(!flow||flow.expires<now||!eq(flow.binding,cookies(req)[stateName]))throw fail(403,'Inicio de sesión inválido o vencido. Vuelve a entrar desde el panel.');
    const code=url.searchParams.get('code');if(!code||code.length>512)throw fail(400,'GitHub no autorizó el acceso.');
    const response=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,code_verifier:flow.verifier,redirect_uri:`${origin}/auth/callback`})});
    if(!response.ok)throw fail(502,'No se pudo completar el inicio de sesión.');const result=await response.json();if(!result.access_token)throw fail(403,'GitHub no autorizó el acceso.');
    const user=await gh(result.access_token,'/user');if(!allowed.has(user.login.toLowerCase()))throw fail(403,'Esta cuenta no está autorizada para el panel de MISO CR.');await permission(result.access_token);
    const id=random(),csrf=random();sessions.delete(cookies(req)[sessionName]);if(sessions.size>=1000)throw fail(503,'Inténtalo más tarde.');sessions.set(id,{token:result.access_token,csrf,login:user.login,expires:now+Math.min(3600000,(result.expires_in||3600)*1000)});
    res.setHeader('Set-Cookie',[cookie(sessionName,id,3600),cookie(stateName,'',0)]);return redirect('/admin');
   }
   if(route.startsWith('/api/')){
    const session=sessions.get(cookies(req)[sessionName]);if(!session||session.expires<now)throw fail(401,'Inicia sesión para administrar.');
    if(req.method!=='GET'&&(req.headers.origin!==origin||!eq(req.headers['x-csrf-token'],session.csrf)))throw fail(403,'Solicitud no autorizada. Recarga el panel.');
    if(req.method==='POST'&&route==='/api/logout'){sessions.delete(cookies(req)[sessionName]);res.setHeader('Set-Cookie',cookie(sessionName,'',0));return json(200,{ok:true});}
    await permission(session.token);
    if(req.method==='GET'&&route==='/api/session')return json(200,{login:session.login,csrf:session.csrf,categories});
    if(req.method==='GET'&&route==='/api/catalog'){const current=await readCatalog(session.token);return json(200,{...current,publicUrl:'https://misocr.github.io/miso-cr-catalogo/'});}
    if(req.method==='POST'&&route==='/api/save'){
     const input=await body(req);const value=validateItem(input.item);const current=await readCatalog(session.token);
     if(input.sha!==current.sha)throw fail(409,'Otra persona modificó el catálogo. Recarga y revisa los cambios.');
     if(!imagePath(input.path))throw fail(400,'Ruta de imagen inválida.');
     const index=current.data.items.findIndex(x=>x.path===input.path);if(index<0)throw fail(404,'La ficha ya no existe.');
     current.data.items[index]={...current.data.items[index],...value};
     const result=await gh(session.token,`/repos/${REPO}/contents/${DATA}`,'PUT',{message:`Actualizar ficha: ${value.title}`,branch:BRANCH,sha:current.sha,content:Buffer.from(JSON.stringify(current.data,null,2)+'\n').toString('base64')});
     return json(200,{ok:true,commit:result.commit.sha});
    }
    if(req.method==='POST'&&route==='/api/create'){
     const input=await body(req);const value=validateItem(input.item),upload=decodeImage(input.upload);
     // Capture a base commit and read the catalog at that exact commit. A concurrent
     // update is rejected by GitHub's non-fast-forward check, never overwritten.
     const ref=await gh(session.token,`/repos/${REPO}/git/ref/heads/${BRANCH}`);const head=await gh(session.token,`/repos/${REPO}/git/commits/${ref.object.sha}`);
     const file=await gh(session.token,`/repos/${REPO}/contents/${DATA}?ref=${ref.object.sha}`);if(input.sha!==file.sha)throw fail(409,'El catálogo cambió. Recarga antes de subir la imagen.');
     const data=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));const tree=await gh(session.token,`/repos/${REPO}/git/trees/${head.tree.sha}?recursive=1`);if(tree.truncated)throw fail(503,'El catálogo requiere revisión antes de cargar más fotos.');
     if(tree.tree.some(x=>x.sha===upload.blobSha)||data.items.some(x=>x.path===upload.path))throw fail(409,'Esta imagen ya existe. Busca la ficha para editarla.');
     data.items.push({path:upload.path,id:refFor(upload.path),...value});
     const image=await gh(session.token,`/repos/${REPO}/git/blobs`,'POST',{content:upload.bytes.toString('base64'),encoding:'base64'});
     const metadata=await gh(session.token,`/repos/${REPO}/git/blobs`,'POST',{content:JSON.stringify(data,null,2)+'\n',encoding:'utf-8'});
     const next=await gh(session.token,`/repos/${REPO}/git/trees`,'POST',{base_tree:head.tree.sha,tree:[{path:upload.path,mode:'100644',type:'blob',sha:image.sha},{path:DATA,mode:'100644',type:'blob',sha:metadata.sha}]});
     const commit=await gh(session.token,`/repos/${REPO}/git/commits`,'POST',{message:`Agregar diseño: ${value.title}`,tree:next.sha,parents:[ref.object.sha]});
     await gh(session.token,`/repos/${REPO}/git/refs/heads/${BRANCH}`,'PATCH',{sha:commit.sha,force:false});return json(200,{ok:true,commit:commit.sha});
    }
    throw fail(404,'Acción no disponible.');
   }
   throw fail(404,'Página no encontrada.');
  }catch(error){json(error.status||500,{error:error.status?error.message:'No se pudo completar la operación. Inténtalo nuevamente.'});}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createApp();server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('MISO admin ready'));}
