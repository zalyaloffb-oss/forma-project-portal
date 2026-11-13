// Share one lazy import. PDF.js starts its own worker and handles its fallback;
// importing the worker on the main thread in advance forces the slow fake-worker path.
let engine;
export function loadPdfEngine(){
 if(!engine)engine=import('./vendor/pdf.min.mjs?v=beget-2').then(pdf=>{
  pdf.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
  return pdf;
 }).catch(error=>{engine=null;throw error;});
 return engine;
}
export async function openPdf(blob){
 const pdf=await loadPdfEngine();
 return pdf.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
}
