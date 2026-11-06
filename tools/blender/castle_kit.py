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
             ('wood', '#8a6440'), ('wood_dark', '#5e4128'), ('plank', '#a87b4c'), ('iron', '#3b3b42'),
             ('roof', '#3f5f8f'), ('roof_dark', '#2f4870'), ('cloth', '#b23a34'), ('gold', '#d9b45a'), ('glass', '#1d1a18')]:
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

def cyl(x, y, z0, z1, r, m, verts=12, r2=None, bevel=0.03):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0, location=(x, y, (z0 + z1) / 2))
    o = bpy.context.object
    if bevel:
        b = o.modifiers.new('bev', 'BEVEL'); b.width = bevel; b.segments = 1; b.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier='bev')
    o.data.materials.append(MATS[m]); parts.append(o); return o
def cone(x, y, z0, h, r, m, verts=12, rot=0.0):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=0, depth=h, location=(x, y, z0 + h / 2), rotation=(0, 0, rot))
    o = bpy.context.object; o.data.materials.append(MATS[m]); parts.append(o); return o
def merlon_ring_square(cx, cy, half, z, body, n=3, w=0.9):
    for k in range(4):
        a = k * math.pi / 2
        for i in range(n):
            t = (i - (n - 1) / 2) * (2 * half / n)
            x = cx + math.cos(a) * (half - 0.25) - math.sin(a) * t; y = cy + math.sin(a) * (half - 0.25) + math.cos(a) * t
            cube('m', x - w / 2, x + w / 2, y - 0.25, y + 0.25, z, z + 1.0, body, 0.05, rot=a + math.pi / 2)
def merlon_ring_round(cx, cy, r, z, body, n=8):
    for i in range(n):
        a = i / n * 2 * math.pi
        x, y = cx + math.cos(a) * (r - 0.25), cy + math.sin(a) * (r - 0.25)
        cube('m', x - 0.35, x + 0.35, y - 0.22, y + 0.22, z, z + 0.85, body, 0.04, rot=a + math.pi / 2)
def banner(x, y, z, m='cloth'):
    cube('pole', x - 0.06, x + 0.06, y - 0.06, y + 0.06, z, z + 2.4, 'wood_dark', 0)
    cube('flag', x + 0.06, x + 1.2, y - 0.02, y + 0.02, z + 1.6, z + 2.3, m, 0)

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

# ---------- keep, towers, gates, bridge ----------
def keep(level):
    W = 11.0; H = 14 + level * 3; h = W / 2
    cube('pl', -h - 1.2, h + 1.2, -h - 1.2, h + 1.2, -DEPTH, 2.0, 'plinth', 0.08)
    cube('b', -h, h, -h, h, -DEPTH, H, 'stone', 0.04)
    for z in (H * 0.35, H * 0.7): cube('sc', -h - 0.15, h + 0.15, -h - 0.15, h + 0.15, z - 0.18, z + 0.18, 'stone_dark', 0.03)
    cube('cb', -h - 0.35, h + 0.35, -h - 0.35, h + 0.35, H - 0.5, H, 'stone_dark', 0.04)  # corbel band
    merlon_ring_square(0, 0, h + 0.2, H, 'stone', n=5, w=1.1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            tx, ty, th = sx * h, sy * h, H + 4 + level
            cyl(tx, ty, -DEPTH, th, 2.0, 'stone', 14)
            cyl(tx, ty, th - 0.6, th, 2.25, 'stone_dark', 14)
            merlon_ring_round(tx, ty, 2.25, th, 'stone', 8)
            cone(tx, ty, th + 0.2, 5.0, 2.6, 'roof', 14)
            banner(tx, ty, th + 5.0)
            for z in (th * 0.45, th * 0.75):  # arrow slits on the outward face of the round turret
                a = math.atan2(sy, sx); px, py = tx + math.cos(a) * 1.97, ty + math.sin(a) * 1.97
                cube('slit', px - 0.09, px + 0.09, py - 0.22, py + 0.22, z, z + 0.9, 'glass', 0, rot=a)
    cone(0, 0, H + 0.4, 6 + level, W * 0.66, 'roof_dark', 4, rot=math.pi / 4)
    # portal on the back face (-Y in Blender = towards +Z in game, the courtyard side) with stairs
    cube('door', -1.3, 1.3, -h - 0.25, -h + 0.1, 0, 3.6, 'wood_dark', 0.02)
    cyl(0, -h - 0.1, 3.4, 3.4 + 0.01, 1.3, 'wood_dark', 12, bevel=0)
    cube('arch', -1.9, 1.9, -h - 0.4, -h + 0.05, 3.6, 4.3, 'stone_dark', 0.04)
    for i in range(4): cube('st', -2.2, 2.2, -h - 1.0 - i * 0.55, -h - 0.45 - i * 0.55, 0, 1.8 - i * 0.45, 'stone_top', 0.03)
    for sx in (-1, 1):
        for z in (H * 0.5, H * 0.8):
            for face in (-1, 1):
                cube('win', sx * 2.8 - 0.45, sx * 2.8 + 0.45, face * (h + 0.02) - 0.08, face * (h + 0.02) + 0.08, z, z + 1.5, 'glass', 0)
                cube('wl', sx * 2.8 - 0.6, sx * 2.8 + 0.6, face * (h + 0.05) - 0.1, face * (h + 0.05) + 0.1, z + 1.5, z + 1.75, 'stone_dark', 0.02)
    if level >= 2:  # forebuilding with its own roof
        cube('fb', h - 0.5, h + 5, -3.5, 3.5, -DEPTH, 8 + level, 'stone', 0.04)
        cone(h + 2.2, 0, 8 + level, 4, 4.6, 'roof', 4, rot=math.pi / 4)
    finish(f'keep{level}')

def tower(kind, level):
    wall_tier = min(3, max(2, level + 1)); plat = TOP[wall_tier] + 2.2
    W = 5.2 if kind == 'tower_catapult' else 4.6; h = W / 2
    body, dark = ('stone', 'stone_dark') if wall_tier == 2 else ('stone3', 'stone3_dark')
    if kind == 'tower_bow' and level == 1:
        for sx in (-1, 1):
            for sy in (-1, 1): cube('post', sx * 1.9 - 0.25, sx * 1.9 + 0.25, sy * 1.9 - 0.25, sy * 1.9 + 0.25, -DEPTH, plat, 'wood_dark', 0.03)
        cube('board', -2.0, 2.0, -2.0, 2.0, -DEPTH, plat - 1.0, 'wood', 0.02)
        for z in range(1, int(plat), 2): cube('band', -2.08, 2.08, -2.08, 2.08, z, z + 0.18, 'wood_dark', 0.01)
        cube('deck', -2.4, 2.4, -2.4, 2.4, plat - 0.15, plat + 0.1, 'plank', 0.02)
        for sx in (-1, 1):
            cube('rail', -2.4, 2.4, sx * 2.25 - 0.1, sx * 2.25 + 0.1, plat + 0.1, plat + 1.1, 'wood_dark', 0.02)
            cube('rail', sx * 2.25 - 0.1, sx * 2.25 + 0.1, -2.4, 2.4, plat + 0.1, plat + 1.1, 'wood_dark', 0.02)
    else:
        cube('pl', -h - 0.3, h + 0.3, -h - 0.3, h + 0.3, -DEPTH, 1.0, 'plinth', 0.06)
        cube('b', -h, h, -h, h, -DEPTH, plat, body, 0.04)
        cube('cb', -h - 0.25, h + 0.25, -h - 0.25, h + 0.25, plat - 0.45, plat, dark, 0.04)
        merlon_ring_square(0, 0, h + 0.1, plat, body, n=3)
        for z in (plat * 0.4, plat * 0.7): cube('slit', -0.18, 0.18, h - 0.05, h + 0.03, z, z + 0.85, 'glass', 0)
        cube('deck', -h + 0.3, h - 0.3, -h + 0.3, h - 0.3, plat - 0.05, plat + 0.08, 'plank', 0.02)
    if kind == 'tower_bow':
        for sx in (-1, 1):
            for sy in (-1, 1): cube('rp', sx * 1.9 - 0.13, sx * 1.9 + 0.13, sy * 1.9 - 0.13, sy * 1.9 + 0.13, plat, plat + 2.3, 'wood_dark', 0.02)
        cone(0, 0, plat + 2.2, 3.6 if level < 3 else 4.4, 3.5 if level < 3 else 3.8, 'roof', 4, rot=math.pi / 4)
        banner(0, 0, plat + 2.2 + (3.6 if level < 3 else 4.4) - 0.4, 'cloth' if level == 3 else 'gold')
    if kind == 'tower_xbow':
        for sx in (-1, 1):
            for sy in (-1, 1): cube('rp', sx * 2.0 - 0.15, sx * 2.0 + 0.15, sy * 2.0 - 0.15, sy * 2.0 + 0.15, plat, plat + 2.1, dark, 0.02)
        cube('roof', -2.6, 2.6, -2.6, 2.6, plat + 2.1, plat + 2.5, 'roof_dark', 0.06)
        cube('roof2', -1.9, 1.9, -1.9, 1.9, plat + 2.5, plat + 3.0, 'roof', 0.06)
        banner(2.1, 2.1, plat + 3.0)
    finish(f'{kind}{level}')

def watchtower():
    for sx in (-1, 1):
        for sy in (-1, 1): cube('post', sx * 1.5 - 0.18, sx * 1.5 + 0.18, sy * 1.5 - 0.18, sy * 1.5 + 0.18, -DEPTH, 11.0, 'wood_dark', 0.03)
    for z in (3.5, 7.0):
        for sy in (-1, 1): cube('br', -1.7, 1.7, sy * 1.5 - 0.1, sy * 1.5 + 0.1, z, z + 0.2, 'wood', 0.02)
        for sx in (-1, 1): cube('br', sx * 1.5 - 0.1, sx * 1.5 + 0.1, -1.7, 1.7, z, z + 0.2, 'wood', 0.02)
    cube('deck', -2.1, 2.1, -2.1, 2.1, 10.85, 11.15, 'plank', 0.02)
    for s in (-1, 1):
        cube('rail', -2.1, 2.1, s * 2.0 - 0.1, s * 2.0 + 0.1, 11.15, 12.0, 'wood', 0.02)
        cube('rail', s * 2.0 - 0.1, s * 2.0 + 0.1, -2.1, 2.1, 11.15, 12.0, 'wood', 0.02)
    cone(0, 0, 12.6, 2.6, 3.4, 'roof', 4, rot=math.pi / 4)
    for sx in (-1, 1):
        for sy in (-1, 1): cube('rp', sx * 1.8 - 0.1, sx * 1.8 + 0.1, sy * 1.8 - 0.1, sy * 1.8 + 0.1, 11.1, 12.7, 'wood_dark', 0.01)
    banner(0, 0, 15.0)
    finish('watchtower1')

def gate(tier):
    top = TOP[tier]
    if tier == 1:
        for sx in (-1, 1): log(sx * 1.75, 0, -DEPTH, 4.6, 0.4, 'wood_dark')
        cube('lintel', -2.1, 2.1, -0.3, 0.3, 3.5, 3.95, 'wood', 0.03)
        cube('walk', -2.1, 2.1, -1.45, -0.3, top - 0.12, top + 0.04, 'plank', 0.02)
    else:
        T = 2.4 if tier == 2 else 2.9; h = T / 2; body = 'stone' if tier == 2 else 'stone3'
        for sx in (-1, 1): cube('jamb', sx * 1.75 - 0.38, sx * 1.75 + 0.38, -h - 0.15, h + 0.15, -DEPTH, top + 0.5, body, 0.04)
        cube('lintel', -2.1, 2.1, -h - 0.15, h + 0.15, 3.4, top + 0.5, body, 0.04)
        cyl(0, 0, 3.0, 3.0 + 0.001, 1.4, 'stone_dark', 16, bevel=0)
        for sx in (-1, 1): cube('voussoir', sx * 1.1 - 0.4, sx * 1.1 + 0.4, -h - 0.2, h + 0.2, 2.95, 3.45, 'stone_dark', 0.04)
        cube('key', -0.35, 0.35, -h - 0.25, h + 0.25, 3.25, 3.75, 'stone_top', 0.04)
        for i in range(4): cube('m', -1.6 + i * 1.07 - 0.42, -1.6 + i * 1.07 + 0.42, h - 0.3, h + 0.15, top + 0.5, top + 1.4, body, 0.05)
        if tier == 3:
            for sx in (-1, 1):
                cyl(sx * 2.7, 0.4, -DEPTH, top + 2.6, 1.65, body, 14)
                cyl(sx * 2.7, 0.4, top + 2.0, top + 2.6, 1.85, 'stone3_dark', 14)
                merlon_ring_round(sx * 2.7, 0.4, 1.85, top + 2.6, body, 7)
                cone(sx * 2.7, 0.4, top + 2.8, 3.2, 2.1, 'roof', 14)
    finish(f'gate{tier}')
    # doors (one leaf pair as one object; the game squashes it open)
    cube('d', -1.3, 1.3, -0.15, 0.15, 0, 3.0, 'wood' if tier == 1 else 'wood_dark', 0.03)
    for i in range(4): cube('plank', -1.0 + i * 0.67 - 0.06, -1.0 + i * 0.67 + 0.06, -0.18, 0.18, 0.05, 2.95, 'wood_dark', 0.01)
    if tier >= 2:
        for z in (0.7, 1.6, 2.5): cube('band', -1.31, 1.31, -0.19, 0.19, z - 0.08, z + 0.08, 'iron', 0.01)
    finish(f'gate_door{tier}')
    if tier == 3:
        for i in range(6): cube('bar', -1.2 + i * 0.48 - 0.05, -1.2 + i * 0.48 + 0.05, -0.05, 0.05, 0, 3.1, 'iron', 0)
        for i in range(5): cube('rail', -1.35, 1.35, -0.05, 0.05, 0.35 + i * 0.65, 0.45 + i * 0.65, 'iron', 0)
        finish('gate_port3')

def bridge():
    L = 16.0
    cube('deck', -3.0, 3.0, -L / 2, L / 2, 0.7, 1.1, 'stone_top', 0.05)
    for sx in (-1, 1):
        cube('parapet', sx * 2.9 - 0.25, sx * 2.9 + 0.25, -L / 2, L / 2, 1.1, 1.9, 'stone', 0.05)
        for k in range(-3, 4): cube('cap', sx * 2.9 - 0.3, sx * 2.9 + 0.3, k * 2.2 - 0.35, k * 2.2 + 0.35, 1.9, 2.15, 'stone_top', 0.03)
    for sy in (-1, 1): cube('abut', -3.1, 3.1, sy * L / 2 - sy * 2.0 - 1.0, sy * L / 2 - sy * 2.0 + 1.0, -2.5, 0.75, 'stone_dark', 0.05)
    cube('pier', -3.1, 3.1, -1.0, 1.0, -2.5, 0.75, 'stone_dark', 0.05)
    finish('bridge')

for lv in (1, 2, 3): keep(lv)
for lv in (1, 2, 3): tower('tower_bow', lv)
for lv in (1, 2): tower('tower_xbow', lv); tower('ballista', lv); tower('tower_catapult', lv)
watchtower()
for t in (1, 2, 3): gate(t)
bridge()

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
