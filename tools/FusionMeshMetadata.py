"""Read visible native mesh instances in root context without changing the design."""


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
    groups=[(root.name,root.meshBodies)]
    groups.extend((occurrence.fullPathName,occurrence.meshBodies)
                  for occurrence in root.allOccurrences if occurrence.isVisible)
    result=[]
    for path,bodies in groups:
        for body in bodies:
            if not body.isVisible:continue
            # A rotated proxy's boundingBox encloses its local box, which can be
            # wider than the actual mesh (e.g. a rotated round column). Match USD
            # against the displayed vertices in root assembly context instead.
            vertices=body.displayMesh.nodeCoordinatesAsDouble
            if not vertices:continue
            info={'name':body.name,'path':path,'geometryType':'mesh',
                  'bounds':[min(vertices[axis::3])*.01 for axis in range(3)]+
                           [max(vertices[axis::3])*.01 for axis in range(3)]}
            appearance=appearance_metadata(body)
            if appearance:info['appearanceFallback']=appearance
            result.append(info)
    return result
