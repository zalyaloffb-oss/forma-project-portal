// Keep the production CAD viewer unchanged; banner layouts use the same model URL.
if(new URLSearchParams(location.search).get('view')==='banners')await import('./banner-viewer.js?v=1');
else await import('./viewer-pro.js?v=fpp-labels-1');
