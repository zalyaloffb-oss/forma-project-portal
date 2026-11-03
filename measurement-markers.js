// Convert a small screen radius into scene units at each measured surface point.
export function measurementMarkerRadius(camera,point,height,pixels=3.5){
 const h=Math.max(1,height);
 if(camera.isOrthographicCamera)return Math.abs(camera.top-camera.bottom)/Math.max(camera.zoom,1e-6)/h*pixels;
 const depth=Math.max(camera.near,Math.abs(point.clone().applyMatrix4(camera.matrixWorldInverse).z));
 return 2*depth*Math.tan(camera.fov*Math.PI/360)/Math.max(camera.zoom,1e-6)/h*pixels;
}
