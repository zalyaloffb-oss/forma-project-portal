function isGLB(buffer){
 if(buffer.byteLength<20)return false;
 const view=new DataView(buffer);
 return view.getUint32(0,true)===0x46546c67&&view.getUint32(4,true)===2&&view.getUint32(8,true)===buffer.byteLength;
}

// GitHub Pages cannot configure Content-Encoding for individual GLBs. Fetch an
// optional precompressed copy and use the browser's native, lossless decoder.
// Null means the caller should use its original GLTFLoader path unchanged.
export async function fetchModelBytes(compressedUrl,{fetcher=fetch,Decoder=globalThis.DecompressionStream}={}){
 if(!compressedUrl||!Decoder)return null;
 try{
  const response=await fetcher(compressedUrl);if(!response.ok)return null;
  const encoded=await response.arrayBuffer();
  // Some hosts may already have decoded a Content-Encoding response.
  if(isGLB(encoded))return encoded;
  const stream=new Blob([encoded]).stream().pipeThrough(new Decoder('gzip'));
  const decoded=await new Response(stream).arrayBuffer();
  return isGLB(decoded)?decoded:null;
 }catch{return null;}
}
