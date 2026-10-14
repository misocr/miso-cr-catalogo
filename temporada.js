/* Las colecciones no cambian las categorías ni el orden original de los productos. */
const SEASONS = {
  graduacion: {title:'Graduación', paths:[
    'B0F76F40-C6EA-450E-9B68-80986DC0CE3C.jpeg',
    '29C5BC46-4E34-4854-9E8A-DC81143856BA.jpeg',
    '967427CD-E361-4110-B615-3603BEC2C9C5.jpeg',
    '9B3AF20E-A84A-4A36-B11A-590189FB5161.jpeg',
    '69721A59-28F4-4A64-9B36-720DB2550C5A.jpeg',
    '7DE1CDE6-DD6C-44D1-B6AC-634B81763D22.jpeg',
    'IMG_0709.jpeg','IMG_3380.jpeg','IMG_3249.jpeg'
  ]},
  maestros: {title:'Día del Maestro', paths:[
    'F2F90262-945E-4FC0-8419-B639C7CDAB6C.jpeg',
    '33F55BB0-2C2E-4363-9A2F-7DB9038DCDB7.jpeg',
    'BE3C80B6-C376-484C-AA44-B41623734E3E.jpeg',
    '136270CC-EED5-4A35-8FEC-73F953EF03A4.jpeg',
    'IMG_0753.jpeg','IMG_0758.jpeg'
  ]}
};
let activeSeason='';
function matchesSeason(item){return !activeSeason || SEASONS[activeSeason].paths.includes(item.path);}
function updateSeasonSelection(){
  const notice=document.getElementById('seasonal-selection');
  notice.hidden=!activeSeason;
  notice.querySelector('span').textContent=activeSeason ? 'Colección: '+SEASONS[activeSeason].title : '';
}
function clearSeason(){activeSeason='';updateSeasonSelection();}
function initSeasonal(){
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  document.getElementById('seasonal-clear').onclick=()=>{clearSeason();active='Todos';showAll=true;renderChips();render();};
  document.querySelectorAll('[data-season]').forEach(card=>{
    const key=card.dataset.season;
    const group=SEASONS[key];
    const slides=group.paths.map(path=>ITEMS.find(item=>item.path===path&&item.active)).filter(Boolean);
    const stage=card.querySelector('.seasonal-stage');
    const counter=card.querySelector('.seasonal-counter');
    const pause=card.querySelector('.seasonal-pause');
    const link=card.querySelector('.seasonal-link');
    let index=0, paused=motion.matches, visible=false, timer=null, request=0;
    const stop=()=>{clearTimeout(timer);timer=null;};
    const sync=()=>{
      stop();
      pause.textContent=paused?'Reproducir':'Pausar';
      pause.setAttribute('aria-label',(paused?'Reproducir':'Pausar')+' galería de '+group.title);
      stage.setAttribute('aria-live',paused?'polite':'off');
      if(!paused&&visible&&!document.hidden&&slides.length>1)timer=setTimeout(()=>step(1),5000);
    };
    const display=async(next)=>{
      const token=++request;
      const item=slides[next];
      const image=new Image();
      image.alt=item.title;
      image.src=item.image;
      image.decoding='async';
      try{await image.decode();}catch{if(token===request)sync();return;}
      if(token!==request)return;
      index=next;
      stage.replaceChildren(image);
      counter.textContent=`${index+1} / ${slides.length}`;
      sync();
    };
    const step=delta=>{stop();display((index+delta+slides.length)%slides.length);};
    card.querySelector('.seasonal-prev').onclick=()=>{paused=true;step(-1);};
    card.querySelector('.seasonal-next').onclick=()=>{paused=true;step(1);};
    pause.onclick=()=>{paused=!paused;sync();};
    // Detener la reproducción al navegar con teclado; reanudar solo a petición.
    card.addEventListener('focusin',()=>{paused=true;sync();});
    motion.addEventListener('change',()=>{if(motion.matches){paused=true;sync();}});
    document.addEventListener('visibilitychange',sync);
    if('IntersectionObserver' in window){
      new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.15}).observe(card);
    }else{visible=true;}
    link.removeAttribute('aria-disabled');
    link.onclick=event=>{
      event.preventDefault();activeSeason=key;active='Todos';showAll=true;
      document.getElementById('q').value='';updateSeasonSelection();renderChips();render();
      const target=document.getElementById('catalogo');
      target.focus({preventScroll:true});target.scrollIntoView({behavior:motion.matches?'auto':'smooth',block:'start'});
    };
    if(slides.length)display(0);
  });
}
