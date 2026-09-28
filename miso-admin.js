'use strict';
const $=id=>document.getElementById(id);let gallery=[],coverIndex=0,processing=false;let csrf='',catalog=[],sha='',selected=null,upload=null,busy=false,objectUrl=null,uploadSequence=0;
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const imageUrl=path=>'https://raw.githubusercontent.com/misocr/miso-cr-catalogo/main/'+path.split('/').map(encodeURIComponent).join('/');
async function api(path,method='GET',body){const r=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(method!=='GET'?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok){if(r.status===401){$('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=true;csrf='';}throw Error(data.error||'No se pudo completar la operación.');}return data;}
function message(value){$('status').textContent=value;}
async function load(){const data=await api('/api/catalog');catalog=data.data.items;sha=data.sha;render();}
function render(){const terms=normalize($('search').value).split(/\s+/).filter(Boolean),visibility=$('visibility').value;const rows=catalog.filter(x=>(visibility==='all'||(visibility==='visible')===(x.active!==false))&&terms.every(t=>normalize([x.title,x.description,x.keywords,x.id,x.path].join(' ')).includes(t)));$('count').textContent=`${rows.length} de ${catalog.length} diseños`;$('list').replaceChildren();for(const row of rows){const card=document.createElement('article');card.className='card'+(row.active===false?' is-hidden':'');const img=document.createElement('img');img.src=imageUrl(row.coverPhoto||row.path);img.alt=row.title;img.loading='lazy';const inner=document.createElement('div');inner.className='card-body';const tag=document.createElement('span');tag.className='tag';tag.textContent=`${row.active===false?'Oculto · ':''}${row.category}`;const title=document.createElement('h3');title.textContent=row.title;const button=document.createElement('button');button.textContent='Editar diseño';button.addEventListener('click',()=>edit(row));inner.append(tag,title,button);card.append(img,inner);$('list').append(card);}}
function edit(row){uploadSequence++;selected=row;upload=null;if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}gallery.forEach(x=>{if(x.url)URL.revokeObjectURL(x.url)});gallery=[];coverIndex=0;processing=false;$('galleryStatus').textContent='';$('galleryEditor').hidden=!row;if(row){gallery=[...new Set([...(row.photos||[row.path]),row.path])].map(path=>({path}));coverIndex=Math.max(0,gallery.findIndex(x=>x.path===row.coverPhoto));}renderGallery();$('form').reset();$('formError').textContent='';$('formHeading').textContent=row?'Editar diseño':'Nuevo diseño';$('uploadLabel').hidden=!!row;$('upload').required=!row;for(const key of ['title','category','description','keywords','price'])$(key).value=row?.[key]||(key==='price'?'Desde ₡17.500':key==='category'?'Otros':'');$('active').checked=row?.active!==false;$('preview').hidden=!row;if(row)$('preview').src=imageUrl(row.coverPhoto||row.path);$('editor').showModal();}
function close(){if(busy||processing)return;uploadSequence++;$('editor').close();gallery.forEach(x=>{if(x.url)URL.revokeObjectURL(x.url)});gallery=[];if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}upload=null;}
$('new').onclick=()=>edit(null);$('close').onclick=close;$('cancel').onclick=close;$('editor').addEventListener('cancel',e=>{if(busy||processing)e.preventDefault();});$('search').oninput=render;$('visibility').onchange=render;$('reload').onclick=()=>load().catch(e=>message(e.message));
$('upload').onchange=async()=>{const sequence=++uploadSequence;upload=null;const file=$('upload').files[0];if(!file)return;try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20_000_000)throw Error('Elige una foto JPEG, PNG o WebP de hasta 20 MB.');const bitmap=await createImageBitmap(file);const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!blob||blob.size>5_000_000)throw Error('La foto es demasiado grande. Prueba con una imagen más pequeña.');const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));if(sequence!==uploadSequence)return;upload={base64:btoa(binary)};if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(blob);$('preview').src=objectUrl;$('preview').hidden=false;$('formError').textContent='';}catch(e){if(sequence===uploadSequence)$('formError').textContent=e.message;}};
$('form').onsubmit=async e=>{e.preventDefault();if(busy||processing)return;if(!selected&&!upload){$('formError').textContent='Selecciona una foto y espera a que aparezca su vista previa.';return;}const item={};for(const key of ['title','category','description','keywords','price'])item[key]=$(key).value;item.active=$('active').checked;busy=true;$('save').disabled=true;$('save').textContent='Publicando…';$('formError').textContent='';let saved=false;try{await api(selected?'/api/gallery':'/api/create','POST',{sha,path:selected?.path,item,...(selected?{photos:gallery.map(x=>x.path?{path:x.path}:{base64:x.base64}),coverIndex}:{upload})});saved=true;busy=false;close();message('Guardado en GitHub. El catálogo público se actualizará en unos minutos.');await load();}catch(error){if(saved)message('El cambio se guardó. No se pudo recargar la lista; pulsa Actualizar lista.');else $('formError').textContent=error.message;}finally{busy=false;$('save').disabled=false;$('save').textContent='Guardar y publicar';}};
$('logout').onclick=async()=>{try{await api('/api/logout','POST');location.replace('/admin');}catch(e){message(e.message);}};
(async()=>{try{const session=await api('/api/session');csrf=session.csrf;$('account').textContent=`SESIÓN DE ${session.login.toUpperCase()}`;for(const name of session.categories){const option=document.createElement('option');option.value=name;option.textContent=name;$('category').append(option);}$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;await load();}catch(e){if(csrf)message(e.message);else{try{const health=await (await fetch('/health')).json();if(!health.loginConfigured){$('setup').hidden=false;document.querySelector('.login-link').hidden=true;}}catch{message('No se pudo conectar. Inténtalo nuevamente.');}}}})();


function renderGallery(){
 $('galleryList').replaceChildren();
 gallery.forEach((photo,index)=>{
  const row=document.createElement('div');row.className='gallery-row';
  const img=document.createElement('img');img.src=photo.url||imageUrl(photo.path);img.alt=`Foto ${index+1}`;
  const controls=document.createElement('div');const label=document.createElement('strong');label.textContent=`Foto ${index+1}${index===coverIndex?' · Portada':''}${photo.path===selected?.path?' · Original':''}`;controls.append(label);
  const action=(text,fn,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled||busy||processing;b.onclick=()=>{if(!busy&&!processing)fn();};controls.append(b);};
  action('Usar de portada',()=>{coverIndex=index;renderGallery();},index===coverIndex);
  const move=next=>{const cover=gallery[coverIndex];[gallery[index],gallery[next]]=[gallery[next],gallery[index]];coverIndex=gallery.indexOf(cover);renderGallery();};
  action('↑ Subir',()=>move(index-1),index===0);action('↓ Bajar',()=>move(index+1),index===gallery.length-1);
  action('Quitar foto',()=>{const cover=gallery[coverIndex];const removed=gallery.splice(index,1)[0];if(removed.url)URL.revokeObjectURL(removed.url);coverIndex=Math.max(0,gallery.indexOf(cover));renderGallery();},photo.path===selected?.path);
  row.append(img,controls);$('galleryList').append(row);
 });
}
$('galleryUpload').onchange=async()=>{
 if(busy||processing)return;
 const files=[...$('galleryUpload').files];$('galleryUpload').value='';
 if(gallery.length+files.length>10){$('formError').textContent='Podés guardar hasta 10 fotos por diseño.';return;}
 const sequence=uploadSequence;processing=true;$('save').disabled=true;renderGallery();
 try{
  for(const file of files){
   $('galleryStatus').textContent=`Preparando ${file.name}…`;
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20_000_000)throw Error('Usá fotos JPEG, PNG o WebP de hasta 20 MB.');
   const bitmap=await createImageBitmap(file),scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob||blob.size>2_500_000)throw Error('Esta foto es muy grande. Seleccioná una más pequeña.');
   const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
   if(sequence!==uploadSequence)return;
   const base64=btoa(binary);if(gallery.some(x=>x.base64===base64))continue;
   gallery.push({base64,url:URL.createObjectURL(blob)});
  }
  $('galleryStatus').textContent='Fotos listas. Pulsá Guardar y publicar para aplicar los cambios.';$('formError').textContent='';
 }catch(e){$('formError').textContent=e.message;$('galleryStatus').textContent='Revisá las fotos preparadas antes de guardar.';}
 finally{processing=false;$('save').disabled=false;renderGallery();}
};
