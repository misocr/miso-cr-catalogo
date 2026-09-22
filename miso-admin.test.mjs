import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createApp,validateItem,decodeImage} from './miso-admin-server.mjs';
const item={title:'Naruto · Fabi',category:'Anime & Fandom',description:'Cuadro de Naruto',keywords:'naruto anime',price:'Desde ₡19.500',active:true};
const catalog={version:1,items:[{path:'IMG_1.jpeg',id:'MISO-TEST',...item}]};
async function fixture(t,options={}){
 const calls=[];let push=true;
 const fetcher=async(url,init={})=>{
  const path=new URL(url).pathname,method=init.method||'GET',body=init.body?JSON.parse(init.body):null;calls.push({path,method,body});
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  if(path==='/login/oauth/access_token')return response({access_token:'never-send-token-to-client',expires_in:28800});
  if(path==='/user')return response({login:options.login||'misocr'});
  if(path==='/repos/misocr/miso-cr-catalogo')return response({permissions:{push}});
  if(path.endsWith('/contents/catalog.json'))return method==='GET'?response({sha:'catalog-sha',content:Buffer.from(JSON.stringify(catalog)).toString('base64')}):response({commit:{sha:'saved-commit'}});
  if(path.endsWith('/git/ref/heads/main'))return response({object:{sha:'head'}});
  if(path.endsWith('/git/commits/head'))return response({tree:{sha:'base-tree'}});
  if(path.endsWith('/git/trees/base-tree'))return response({tree:[],truncated:false});
  if(path.endsWith('/git/refs/heads/main')&&options.conflict)return response({},422);
  return response({sha:'new-sha'});
 };
 const app=createApp({env:{NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:3000',...(options.unconfigured?{}:{GITHUB_CLIENT_ID:'fake-id',GITHUB_CLIENT_SECRET:'never-send-secret-to-client'})},fetcher});
 app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>{app.closeAllConnections();app.close();});
 const base='http://127.0.0.1:'+app.address().port;
 const request=(path,init={})=>fetch(base+path,{redirect:'manual',...init});
 const login=async()=>{
  const start=await request('/auth/login');const state=new URL(start.headers.get('location')).searchParams.get('state');const cookie=start.headers.getSetCookie()[0].split(';')[0];
  const callback='/auth/callback?state='+state+'&code=fake-code';const result=await request(callback,{headers:{cookie}});
  return {result,callback,cookie:result.headers.getSetCookie()[0]?.split(';')[0],stateCookie:cookie};
 };
 const auth=async()=>{const session=await login();assert.equal(session.result.status,302);const r=await request('/api/session',{headers:{cookie:session.cookie}});const data=await r.json();return {cookie:session.cookie,origin:'http://127.0.0.1:3000','x-csrf-token':data.csrf,'content-type':'application/json'};};
 return {request,login,auth,calls,revoke:()=>{push=false;}};
}
test('anonymous visitors cannot read or modify administration data',async t=>{const f=await fixture(t);for(const route of ['/api/session','/api/catalog','/api/save','/api/create']){const r=await f.request(route,{method:route.endsWith('save')||route.endsWith('create')?'POST':'GET'});assert.equal(r.status,401);}assert.equal(f.calls.length,0);});
test('missing configuration fails closed',async t=>{const f=await fixture(t,{unconfigured:true});assert.equal((await f.request('/auth/login')).status,503);});
test('login uses PKCE, browser state and single-use callback; no token disclosed',async t=>{const f=await fixture(t);const start=await f.request('/auth/login');const u=new URL(start.headers.get('location'));assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal((await f.request('/auth/callback?state='+u.searchParams.get('state')+'&code=x')).status,403);const s=await f.login();assert.equal(s.result.status,302);assert.equal((await f.request(s.callback,{headers:{cookie:s.stateCookie}})).status,403);const r=await f.request('/api/session',{headers:{cookie:s.cookie}});const text=await r.text();assert.equal(r.status,200);assert.ok(!text.includes('never-send'));assert.ok(s.result.headers.get('set-cookie').includes('HttpOnly'));});
test('non-allowlisted user is denied even when repository is writable',async t=>{const f=await fixture(t,{login:'outsider'});assert.equal((await f.login()).result.status,403);});
test('CSRF and origin required; stale edits cannot overwrite; successful save preserves id',async t=>{const f=await fixture(t),headers=await f.auth();const body=JSON.stringify({path:'IMG_1.jpeg',sha:'catalog-sha',item:{...item,title:'Corrected',repo:'another/repo'}});for(const altered of [{...headers,origin:'https://evil.example'},{...headers,'x-csrf-token':''},{...headers,'x-csrf-token':'é'.repeat(43)}])assert.equal((await f.request('/api/save',{method:'POST',headers:altered,body})).status,403);assert.equal((await f.request('/api/save',{method:'POST',headers,body:JSON.stringify({path:'IMG_1.jpeg',sha:'stale',item})})).status,409);assert.equal(f.calls.filter(x=>x.method==='PUT').length,0);assert.equal((await f.request('/api/save',{method:'POST',headers,body})).status,200);const saved=f.calls.find(x=>x.method==='PUT');assert.equal(saved.body.sha,'catalog-sha');const value=JSON.parse(Buffer.from(saved.body.content,'base64'));assert.equal(value.items[0].id,'MISO-TEST');assert.equal(value.items[0].title,'Corrected');assert.equal(value.items[0].repo,undefined);});
test('permission revocation and logout invalidate writes',async t=>{const f=await fixture(t),headers=await f.auth();f.revoke();assert.equal((await f.request('/api/catalog',{headers})).status,403);assert.equal((await f.request('/api/logout',{method:'POST',headers})).status,200);assert.equal((await f.request('/api/catalog',{headers})).status,401);});
test('new photo and metadata committed together, never force-pushed',async t=>{const f=await fixture(t),headers=await f.auth();const bytes=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(30)]);const r=await f.request('/api/create',{method:'POST',headers,body:JSON.stringify({sha:'catalog-sha',item,upload:{base64:bytes.toString('base64')}})});assert.equal(r.status,200);const tree=f.calls.find(x=>x.method==='POST'&&x.path.endsWith('/git/trees'));assert.equal(tree.body.tree.length,2);const update=f.calls.find(x=>x.method==='PATCH');assert.equal(update.body.force,false);const metadata=f.calls.filter(x=>x.path.endsWith('/git/blobs'))[1];assert.ok(JSON.parse(metadata.body.content).items[1].id.startsWith('MISO-'));});
test('concurrent upload conflict reported, never retried as forced update',async t=>{const f=await fixture(t,{conflict:true}),headers=await f.auth();const bytes=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(30)]);assert.equal((await f.request('/api/create',{method:'POST',headers,body:JSON.stringify({sha:'catalog-sha',item,upload:{base64:bytes.toString('base64')}})})).status,409);assert.equal(f.calls.filter(x=>x.method==='PATCH').length,1);});
test('invalid fields and executable uploads rejected; large valid photo does not overflow regexp',()=>{assert.throws(()=>validateItem({...item,category:'invalid'}));assert.throws(()=>decodeImage({base64:Buffer.from('<svg onload="alert(1)">').toString('base64')}));const bytes=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(3_000_000)]);assert.equal(decodeImage({base64:bytes.toString('base64')}).bytes.length,bytes.length);});
test('catalog migration preserves 332 reviewed entries and corrections',async()=>{const data=JSON.parse(await readFile(new URL('./catalog.json',import.meta.url)));assert.equal(data.items.length,332);for(const x of data.items)validateItem(x);assert.ok(data.items.find(x=>x.path==='IMG_8188.jpeg').title.includes('Enredados'));assert.ok(data.items.find(x=>x.path==='IMG_3481.jpeg').title.includes('Liga Deportiva Alajuelense'));assert.ok(!data.items.some(x=>x.id==='MISO-1NIIT4'));});
