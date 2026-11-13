// Keep the production CAD viewer unchanged; banner layouts use the same model URL.
if(new URLSearchParams(location.search).get('view')==='banners')await import('./banner-viewer.js?v=mobile-model-2');
else await import('./viewer-pro.js?v=performance-1');
