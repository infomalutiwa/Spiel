# Headless Blender: builds the Talwacht castle kit (walls, piers per tier, intact + battered) with bevelled edges,
# bakes ambient occlusion into a vertex colour and exports one GLB with named objects.
#   blender -b -P tools/blender/castle_kit.py -- <out.glb>
# Units are metres (Blender Z up). Wall arms run along +X from the cell centre (0) to the cell edge (2 m);
# the outer (enemy) side of every module is +Y. The game mirrors / rotates the modules (castlekit.ts).
import bpy, bmesh, sys, random, math

out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
DEPTH = 3.0  # walls reach below ground so slopes never show a gap

MATS = {}
def mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.85
    MATS[name] = m; return m
srgb = lambda h: tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5))
for n, h in [('stone', '#bdb19b'), ('stone_dark', '#8f8473'), ('stone_top', '#d3c8b2'), ('plinth', '#7b7262'), ('stone3', '#a69d90'), ('stone3_dark', '#7f776c'),
             ('wood', '#8a6440'), ('wood_dark', '#5e4128'), ('plank', '#a87b4c'), ('iron', '#3b3b42')]:
    mat(n, srgb(h))

parts = []
def cube(name, x0, x1, y0, y1, z0, z1, m, bevel=0.035, rot=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.scale = (x1 - x0, y1 - y0, z1 - z0); o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); o.rotation_euler = (0, 0, rot)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        b = o.modifiers.new('bev', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier='bev')
    o.data.materials.append(MATS[m]); parts.append(o); return o
def log(x, y, z0, z1, r, m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=r, depth=z1 - z0, location=(x, y, (z0 + z1) / 2))
    o = bpy.context.object; o.data.materials.append(MATS[m]); parts.append(o)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r * 1.04, depth=0.55, location=(x, y, z1 + 0.27))
    t = bpy.context.object; t.data.materials.append(MATS['wood_dark']); parts.append(t)

def finish(name):
    """join the collected parts into one object, smooth-by-angle, bake AO into vertex colour 'ao'"""
    global parts
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.object; o.name = name; o.data.name = name
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    parts = []
    MODULES.append(o)
    return o

MODULES = []
random.seed(7)
TOP = {1: 2.6, 2: 4.8, 3: 5.4}

def stone_arm(tier, damaged, name):
    T = 2.4 if tier == 2 else 2.9; top = TOP[tier]; h = T / 2
    body, dark = ('stone', 'stone_dark') if tier == 2 else ('stone3', 'stone3_dark')
    cube('b', 0, 2.0, -h, h, -DEPTH, top, body, 0.02)
    cube('p', 0, 2.0, -h - 0.2, h + 0.2, -DEPTH, 0.9, 'plinth', 0.05)
    cube('s', 0, 2.0, -h - 0.06, h + 0.06, top * 0.55 - 0.11, top * 0.55 + 0.11, dark, 0.03)
    cube('w', 0, 2.0, -h + 0.35, h - 0.25, top - 0.02, top + 0.03, 'stone_top', 0)  # walkway
    cube('pp', 0, 2.0, h - 0.32, h, top, top + 0.55, body)                           # outer parapet
    for x in (0.5, 1.5):                                                              # merlons
        if damaged and random.random() < 0.55: continue
        cube('m', x - 0.42, x + 0.42, h - 0.32, h, top + 0.55, top + 1.45, body, 0.05)
    cube('ip', 0, 2.0, -h, -h + 0.22, top, top + 0.38, body)                          # inner low parapet
    for x in (0.4, 1.3):                                                              # proud ashlar blocks on both faces
        for side in (-1, 1):
            z = 1.4 + random.random() * (top - 2.2)
            cube('a', x, x + 0.6 + random.random() * 0.3, side * (h + 0.02) - 0.05, side * (h + 0.02) + 0.05, z, z + 0.4, random.choice([dark, 'stone_top']), 0.02)
    if tier == 3:
        cube('bt', 0.7, 1.5, h, h + 0.9, -DEPTH, top * 0.82, dark, 0.06)              # buttress
        cube('bc', 0.7, 1.5, h, h + 0.9, top * 0.82, top * 0.82 + 0.2, 'stone_top', 0.04)
    if damaged:
        cube('c', 0.4, 1.3, h + 0.01, h + 0.04, top * 0.25, top * 0.75, 'iron', 0)   # dark crack / scorch
    finish(name)

def stone_pier(tier, corner, name):
    T = (2.4 if tier == 2 else 2.9) + (0.5 if corner else 0); top = TOP[tier]; h = T / 2
    body = 'stone' if tier == 2 else 'stone3'
    cube('b', -h, h, -h, h, -DEPTH, top, body, 0.03)
    cube('p', -h - 0.2, h + 0.2, -h - 0.2, h + 0.2, -DEPTH, 0.9, 'plinth', 0.05)
    cube('w', -h + 0.2, h - 0.2, -h + 0.2, h - 0.2, top - 0.02, top + 0.03, 'stone_top', 0)
    if corner:
        cube('cap', -h - 0.15, h + 0.15, -h - 0.15, h + 0.15, top, top + 0.3, 'stone_top', 0.04)
        for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            cube('m', sx * (h - 0.35) - 0.35, sx * (h - 0.35) + 0.35, sy * (h - 0.35) - 0.35, sy * (h - 0.35) + 0.35, top + 0.3, top + 1.3, body, 0.05)
    finish(name)

def palisade_arm(damaged, name):
    top = TOP[1]
    n = 4
    for k in range(n):
        if damaged and k == 2: continue
        x = (k + 0.5) / n * 2.0
        log(x, 0, -DEPTH, 3.25 + (random.random() - 0.5) * 0.35, 0.25, random.choice(['wood', 'wood_dark']))
    cube('beam', 0, 2.0, -0.32, -0.18, 1.1, 1.35, 'wood_dark', 0.03)
    cube('walk', 0, 2.0, -1.45, -0.3, top - 0.12, top + 0.04, 'plank', 0.02)
    cube('post', 0.9, 1.1, -1.35, -1.15, 0, top - 0.12, 'wood_dark', 0.02)
    finish(name)

def palisade_pier(name):
    log(0, 0, -DEPTH, 3.6, 0.34, 'wood_dark')
    finish(name)

for tier in (2, 3):
    stone_arm(tier, False, f'arm{tier}'); stone_arm(tier, True, f'arm{tier}_d')
    stone_pier(tier, False, f'pier{tier}'); stone_pier(tier, True, f'pier{tier}_c')
palisade_arm(False, 'arm1'); palisade_arm(True, 'arm1_d'); palisade_pier('pier1')

# ---- bake ambient occlusion into a vertex colour per module (with a ground plane so feet darken) ----
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.device = 'CPU'
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0)); ground = bpy.context.object
for o in MODULES:
    for other in MODULES: other.hide_render = other is not o
    o.data.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
    o.data.color_attributes.active_color = o.data.color_attributes['ao']
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
for o in MODULES: o.hide_render = False
bpy.data.objects.remove(ground)
for i, o in enumerate(MODULES): o.location = (i * 8, 0, 0)  # spread out (positions are ignored by the game)
print('modules', [(o.name, len(o.data.polygons)) for o in MODULES])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_apply=True)
