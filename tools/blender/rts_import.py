"""Quaternius 'Ultimate Fantasy RTS' (CC0) -> game-ready GLBs.
usage: blender -b -P tools/blender/rts_import.py -- <dir with .gltf> <out dir>
Each output: one mesh, transforms applied, origin at the bottom centre, +Y up in three.js."""
import bpy, sys, os, mathutils

src, out = sys.argv[sys.argv.index('--') + 1:][:2]
# output name -> list of (source file, offset x, offset y, scale, rotation z degrees)
SETS = {
    'house_a': [('Houses_FirstAge_1_Level1', 0, 0, 1, 0)],
    'house_b': [('Houses_FirstAge_2_Level1', 0, 0, 1, 0)],
    'house_c': [('Houses_SecondAge_1_Level1', 0, 0, 1, 0)],
    'farm': [('Farm_Dirt_Level2', 0, 0, 1, 0), ('Houses_FirstAge_3_Level1', 0.62, 0.55, 0.85, 90)],
    'lumber': [('Storage_FirstAge_Level1', 0, 0, 1, 0)],
    'quarry': [('Rock_Group', 0, 0, 1, 0), ('Houses_FirstAge_3_Level1', 0.45, -0.5, 0.8, 0)],
    'mine': [('Mine', 0, 0, 1, 0)],
    'mill': [('Windmill_FirstAge', 0, 0, 1, 0)],
    'market': [('Market_FirstAge_Level1', 0, 0, 1, 0)],
    'barracks': [('Barracks_FirstAge_Level2', 0, 0, 1, 0)],
    'range': [('Archery_FirstAge_Level1', 0, 0, 1, 0)],
    'stable': [('Storage_FirstAge_Level1', 0, 0, 1, 90)],
    'infirmary': [('Temple_FirstAge_Level1', 0, 0, 1, 0)],
    'workshop': [('TowerHouse_FirstAge', 0, 0, 1, 0)],
    'smithy': [('Houses_SecondAge_1_Level1', 0, 0, 1, 0)],
    'trees': [('Resource_Tree_Group', 0, 0, 1, 0)],
    'pines': [('Resource_PineTree_Group', 0, 0, 1, 0)],
    'mountains_a': [('Mountain_Group_1', 0, 0, 1, 0)],
    'mountains_b': [('Mountain_Group_2', 0, 0, 1, 0)],
    'mountain': [('MountainLarge_Single', 0, 0, 1, 0)],
    'rocks': [('Rock_Group', 0, 0, 1, 0)],
    'keep1': [('Wonder_SecondAge_Level1', 0, 0, 1, 0)],
    'keep2': [('Wonder_SecondAge_Level2', 0, 0, 1, 0)],
    'keep3': [('Wonder_SecondAge_Level3', 0, 0, 1, 0)],
    'tower1': [('WatchTower_SecondAge_Level1', 0, 0, 1, 0)],
    'tower2': [('WatchTower_SecondAge_Level2', 0, 0, 1, 0)],
    'tower3': [('WatchTower_SecondAge_Level3', 0, 0, 1, 0)],
    'watch': [('WatchTower_FirstAge_Level3', 0, 0, 1, 0)],
}

only = sys.argv[sys.argv.index('--') + 3:]
for name, parts in SETS.items():
    if only and name not in only: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = []
    for f, ox, oy, sc, rz in parts:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(src, f + '.gltf'))
        new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        for o in new:
            o.matrix_world = mathutils.Matrix.Translation((ox, oy, 0)) @ mathutils.Matrix.Rotation(rz * 3.14159265 / 180, 4, 'Z') @ mathutils.Matrix.Scale(sc, 4) @ o.matrix_world
        objs += new
    for o in bpy.data.objects:
        if o.type != 'MESH': bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    vs = [v.co for v in ob.data.vertices]
    cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2; z0 = min(v.z for v in vs)
    for v in ob.data.vertices: v.co -= mathutils.Vector((cx, cy, z0))
    for m in ob.data.materials:
        if m and m.node_tree:
            b = m.node_tree.nodes.get('Principled BSDF')
            if b: b.inputs['Metallic'].default_value = 0; b.inputs['Roughness'].default_value = 0.85
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, name + '.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    print('OUT', name, len(ob.data.polygons))
