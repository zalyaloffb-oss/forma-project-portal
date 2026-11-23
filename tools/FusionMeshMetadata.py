"""Read visible native mesh instances in root context without changing the design."""


def single_body_tessellation_match(bounds,body,mesh_name,body_count):
    # A single named native body has no competing hierarchy/instance mapping.
    # Curved USD tessellation may omit a true CAD extremum by a few millimetres.
    if body_count!=1 or body['name']!=mesh_name:return False
    span=max(body['bounds'][axis+3]-body['bounds'][axis] for axis in range(3))
    error=max(abs(a-b) for a,b in zip(bounds,body['bounds']))
    return error<=max(.002,span*.001)


def appearance_metadata(body):
    appearance=body.appearance
    if appearance is None:return None
    props=appearance.appearanceProperties
    for key in ('generic_diffuse','opaque_albedo','metal_f0','wood_early_color'):
        prop=props.itemById(key)
        if prop is None:continue
        color=prop.value
        if not all(hasattr(color,key) for key in ('red','green','blue')):continue
        rough=props.itemById('surface_roughness')
        return {'name':appearance.name,'color':[color.red/255,color.green/255,color.blue/255],
                'opacity':body.visibleOpacity,'roughness':float(rough.value) if rough else .5}
    return None


def appearance_material(appearance):
    color=appearance['color'];opacity=float(appearance['opacity'])
    if len(color)!=3 or any(not 0<=channel<=1 for channel in color) or not 0<=opacity<=1:
        raise ValueError('Invalid Fusion mesh appearance')
    material={'name':appearance['name'],'doubleSided':True,'pbrMetallicRoughness':{
        'baseColorFactor':[channel/12.92 if channel<=.04045 else ((channel+.055)/1.055)**2.4 for channel in color]+[opacity],
        'metallicFactor':0,'roughnessFactor':max(0,min(1,float(appearance['roughness'])))}}
    if opacity<1:material['alphaMode']='BLEND'
    return material


def mesh_metadata(design):
    root=design.rootComponent
    groups=[(root.name,root.meshBodies,None)]
    groups.extend((occurrence.fullPathName,occurrence.meshBodies,occurrence.transform2)
                  for occurrence in root.allOccurrences if occurrence.isVisible)
    result=[]
    for path,bodies,transform in groups:
        for body in bodies:
            if not body.isVisible:continue
            # A rotated proxy's boundingBox encloses its local box, which can be
            # wider than the actual mesh (e.g. a rotated round column). Match USD
            # against the displayed vertices in root assembly context instead.
            native=body.nativeObject or body
            vertices=native.displayMesh.nodeCoordinatesAsDouble
            if not vertices:continue
            if transform is not None:
                rows=[[transform.getCell(row,column) for column in range(4)] for row in range(3)]
                minimum=[float('inf')]*3;maximum=[-float('inf')]*3
                for index in range(0,len(vertices),3):
                    x,y,z=vertices[index:index+3]
                    for axis,(a,b,c,d) in enumerate(rows):
                        value=a*x+b*y+c*z+d
                        minimum[axis]=min(minimum[axis],value);maximum[axis]=max(maximum[axis],value)
                bounds=[value*.01 for value in minimum+maximum]
            else:bounds=[min(vertices[axis::3])*.01 for axis in range(3)]+[max(vertices[axis::3])*.01 for axis in range(3)]
            info={'name':body.name,'path':path,'geometryType':'mesh',
                  'bounds':bounds}
            appearance=appearance_metadata(body)
            if appearance:info['appearanceFallback']=appearance
            result.append(info)
    return result
