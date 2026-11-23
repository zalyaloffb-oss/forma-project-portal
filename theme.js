(()=>{
 const root=document.documentElement,key='ees-catalog-theme';
 let theme='light';try{if(localStorage.getItem(key)==='dark')theme='dark';}catch{}
 function apply(){
  root.dataset.theme=theme;
  const button=document.getElementById('theme-toggle');if(!button)return;
  const label=theme==='dark'?'Включить светлую тему':'Включить тёмную тему';
  button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(theme==='dark'));
  button.innerHTML=theme==='dark'?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>';
 }
 apply();
 document.addEventListener('DOMContentLoaded',()=>{apply();document.getElementById('theme-toggle').onclick=()=>{theme=theme==='dark'?'light':'dark';try{localStorage.setItem(key,theme);}catch{}apply();};});
 window.addEventListener('storage',event=>{if(event.key===key){theme=event.newValue==='dark'?'dark':'light';apply();}});
})();
