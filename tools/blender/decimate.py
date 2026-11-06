# Headless Blender: import a glTF, decimate every mesh to a target triangle count, export a compact .glb
#   blender -b -P tools/blender/decimate.py -- <in.gltf> <out.glb> <triangles>
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, target = argv[0], argv[1], int(argv[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes:  # glTF import splits vertices at every seam: weld them so edges can collapse
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode='OBJECT')
tri = lambda: sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
for _ in range(6):  # seams stop a single pass early: repeat until close to the target
    now = tri()
    if now <= target * 1.15: break
    for o in meshes:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = max(0.02, target / now)
        m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier='dec')
for o in meshes: o.data.shade_smooth()
size = int(argv[3]) if len(argv) > 3 else 512
for img in bpy.data.images:
    if img.size[0] > size: img.scale(size, size)
print('triangles after', sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=82, export_apply=True)
