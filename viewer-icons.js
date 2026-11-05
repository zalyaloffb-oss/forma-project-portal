// Lucide provides consistent line icons; custom CAD-specific controls remain available.
import {lucideIcons} from './viewer-lucide.js?v=1';
const paths={
 download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
 tree:'M4 5h5v4H4zM15 15h5v4h-5zM15 5h5v4h-5zM9 7h6M11 7v10h4',
 orbit:'M5 8a8 8 0 1 1-1 8M5 3v5h5M8 12h8M12 8v8',
 pan:'M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v8c0 4-3 7-7 7h-2c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2l2 2',
 zoom:'M17 17l5 5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0M6 10h8M10 6v8',
 fit:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M7 7h10v10H7z',
 home:'M3 11l9-8 9 8M6 9v12h12V9M10 21v-7h4v7',
 move:'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3',
 restore:'M4 8a8 8 0 1 1 0 9M4 3v5h5M9 10l3-2 3 2v5l-3 2-3-2z',
 measure:'M3 8l5-5 13 13-5 5zM7 7l3 3M10 10l2-2M13 13l3-3M16 16l2-2',
 section:'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10M2 14l20-6M5 15l2-3M9 14l2-3M13 13l2-3M17 12l2-3',
 explode:'M9 9l3-2 3 2v6l-3 2-3-2zM2 2l5 5M2 6V2h4M22 2l-5 5M18 2h4v4M2 22l5-5M2 18v4h4M22 22l-5-5M18 22h4v-4',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 camera:'M3 7h4l2-3h6l2 3h4v13H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 reset:'M4 8a8 8 0 1 1 0 9M4 3v5h5',
 face:'M3 8l10-5 8 5-10 5zM3 8v8l8 5 10-5V8M11 13v8',
 edge:'M4 6l8-4 8 4v12l-8 4-8-4zM4 6l8 4 8-4M12 10v12M4 6v12',
 aa:'M3 19l4-4h4v-4h4V7h6M3 14L21 3',
 background:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 2v20M12 5h4M12 9h8M12 13h9M12 17h7',
 help:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M9 8a3 3 0 1 1 4 3c-1 1-1 1-1 3M12 17h.01',
 full:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
 clear:'M5 5l14 14M19 5L5 19'
};
export function iconButton(button,name,label){
 button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${lucideIcons[name] || `<path d="${paths[name]}"/>`}</svg>`;
 button.classList.add('icon-button');button.setAttribute('aria-label',label);button.title=label;
}
const controls={
 '#tree-toggle':['tree','Структура модели'], '[data-mode="orbit"]':['orbit','Орбита'], '[data-mode="pan"]':['pan','Сдвиг'], '[data-mode="zoom"]':['zoom','Масштаб'], '#fit':['fit','Уместить модель'], '#home':['home','Домашний вид'], '[data-mode="move"]':['move','Двигать тело'], '#restore-bodies':['restore','Вернуть тела'], '[data-mode="measure"]':['measure','Линейка'], '#section-toggle':['section','Сечение'], '#explode-toggle':['explode','Разнести'], '#show-all':['eye','Показать всё'], '#snapshot':['camera','Снимок'], '#reset':['reset','Сброс'], '[data-mode="face"]':['face','Выбрать плоскость / полигон'], '[data-mode="edge"]':['edge','Выбрать рёбра · сумма длин'], '#antialias':['aa','Сглаживание: ВКЛ'], '#background':['background','Переключить фон'], '#help':['help','Справка'], '#full':['full','На весь экран'], '#measure-clear':['clear','Очистить измерение']
};
for(const [selector,[name,label]] of Object.entries(controls)){const b=document.querySelector(selector);if(b)iconButton(b,name,label);}
