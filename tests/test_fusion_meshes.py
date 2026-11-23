from pathlib import Path
from types import SimpleNamespace as NS
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from FusionMeshMetadata import mesh_metadata,appearance_metadata,appearance_material


def body(name,minimum,maximum,visible=True):
    return NS(name=name,isVisible=visible,appearance=None,nativeObject=None,displayMesh=NS(nodeCoordinatesAsDouble=list(minimum)+list(maximum)),boundingBox=NS(
        minPoint=NS(asArray=lambda:list(minimum)),maxPoint=NS(asArray=lambda:list(maximum))))


class MeshInstances(unittest.TestCase):
    def test_proxy_mesh_coordinates_are_transformed_from_native_component_space(self):
        source=body('Proxy',(0,0,0),(10,10,10))
        native=body('Native',(0,0,0),(10,20,30));source.nativeObject=native
        matrix=[[0,-1,0,100],[1,0,0,200],[0,0,1,300]]
        occurrence=NS(fullPathName='Outer:2+Logo:1',isVisible=True,meshBodies=[source],transform2=NS(getCell=lambda row,column:matrix[row][column]))
        row=mesh_metadata(NS(rootComponent=NS(name='Stand',meshBodies=[],allOccurrences=[occurrence])))[0]
        for actual,expected in zip(row['bounds'],[.8,2,3,1,2.1,3.3]):self.assertAlmostEqual(actual,expected)

    def test_rotated_instance_uses_mesh_extents_instead_of_loose_transformed_box(self):
        source=body('Round column',(-30,-30,0),(30,30,300))
        source.displayMesh.nodeCoordinatesAsDouble=[-25,-25,0,25,25,300]
        row=mesh_metadata(NS(rootComponent=NS(name='Stand',meshBodies=[source],allOccurrences=[])))[0]
        self.assertEqual(row['bounds'],[-.25,-.25,0,.25,.25,3])

    def test_repeated_instances_retain_distinct_paths_world_bounds_and_visibility(self):
        root=NS(name='Design',meshBodies=[body('Root mesh',(0,0,0),(100,50,10))],allOccurrences=[
            NS(fullPathName='Stand:1+Logo:1',isVisible=True,transform2=None,meshBodies=[body('Logo',(200,0,0),(210,50,1))]),
            NS(fullPathName='Stand:2+Logo:1',isVisible=True,transform2=None,meshBodies=[body('Logo',(400,0,0),(410,50,1)),body('Hidden',(0,0,0),(1,1,1),False)]),
            NS(fullPathName='Hidden component',isVisible=False,meshBodies=[body('Logo',(600,0,0),(610,50,1))])])
        rows=mesh_metadata(NS(rootComponent=root))
        self.assertEqual([row['path'] for row in rows],['Design','Stand:1+Logo:1','Stand:2+Logo:1'])
        self.assertEqual(rows[1]['bounds'],[2,0,0,2.1,.5,.01])
        self.assertEqual(rows[2]['bounds'],[4,0,0,4.1,.5,.01])
        self.assertTrue(all(row['geometryType']=='mesh' and 'cadEdges' not in row for row in rows))

    def test_unbound_mesh_retains_native_display_color_and_opacity(self):
        source=body('Mesh',(0,0,0),(10,10,10))
        source.visibleOpacity=.7
        properties={'generic_diffuse':NS(value=NS(red=128,green=64,blue=255)), 'surface_roughness':NS(value=.8)}
        source.appearance=NS(name='Source swatch',appearanceProperties=NS(itemById=properties.get))
        native=appearance_metadata(source);material=appearance_material(native)
        self.assertEqual(native['color'],[128/255,64/255,1])
        self.assertEqual(material['name'],'Source swatch')
        self.assertEqual(material['alphaMode'],'BLEND')
        self.assertEqual(material['pbrMetallicRoughness']['baseColorFactor'][2:],[1,.7])
        self.assertAlmostEqual(material['pbrMetallicRoughness']['baseColorFactor'][0],.21586,places=4)


if __name__=='__main__':unittest.main()
