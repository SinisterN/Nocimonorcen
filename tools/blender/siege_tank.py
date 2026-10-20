"""Siege Tank v2: cartoon shading (3 flat light bands), ink outlines from an inverted shell, hazard-stripe skirts.
usage: python tank2.py <out_dir> <yaw...>   options via env: TURRET (deg), TREAD (0..3 frame), PITCH (deg)"""
import bpy, math, sys, os
from mathutils import Vector
out = sys.argv[1]; yaws = [float(a) for a in sys.argv[2:]] or [0]
TURRET = float(os.environ.get('TURRET', 0)); TREAD = int(os.environ.get('TREAD', 0)); PITCH = float(os.environ.get('PITCH', 30))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
def lin(h): h = h.lstrip('#'); return tuple((int(h[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4))

def toon(name, hexc, emit=0, stripes=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    N.clear(); outn = N.new('ShaderNodeOutputMaterial')
    dif = N.new('ShaderNodeBsdfDiffuse'); s2r = N.new('ShaderNodeShaderToRGB'); L.new(dif.outputs[0], s2r.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    e = ramp.color_ramp.elements; e[0].position = 0; e[0].color = (0.55, 0.55, 0.64, 1); e[1].position = 0.08; e[1].color = (0.9, 0.9, 0.95, 1)
    e3 = e.new(0.35); e3.color = (1.3, 1.26, 1.18, 1)
    L.new(s2r.outputs[0], ramp.inputs[0])
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
    if stripes:   # diagonal yellow/black bands
        tc = N.new('ShaderNodeTexCoord'); wave = N.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'DIAGONAL'
        wave.inputs['Scale'].default_value = stripes; wave.inputs['Distortion'].default_value = 0
        L.new(tc.outputs['Object'], wave.inputs['Vector'])
        sr = N.new('ShaderNodeValToRGB'); sr.color_ramp.interpolation = 'CONSTANT'
        sr.color_ramp.elements[0].color = (*lin('1c1c1e'), 1); sr.color_ramp.elements[1].position = 0.5; sr.color_ramp.elements[1].color = (*lin('e6b81e'), 1)
        L.new(wave.outputs['Fac'], sr.inputs[0]); L.new(sr.outputs[0], mul.inputs[6])
    else:
        mul.inputs[6].default_value = (*lin(hexc), 1)
    L.new(ramp.outputs[0], mul.inputs[7])
    em = N.new('ShaderNodeEmission'); L.new(mul.outputs[2], em.inputs[0])
    em.inputs[1].default_value = 1 + emit
    L.new(em.outputs[0], outn.inputs[0])
    return m
INK = bpy.data.materials.new('ink'); INK.use_nodes = True; INK.use_backface_culling = True
b = INK.node_tree.nodes['Principled BSDF']; INK.node_tree.nodes.remove(b)
em = INK.node_tree.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (0.02, 0.015, 0.02, 1)
INK.node_tree.links.new(em.outputs[0], INK.node_tree.nodes['Material Output'].inputs[0])

HULL = toon('hull', '6d747e'); DARK = toon('dark', '474b55'); GUN = toon('gun', '5a6069'); RUST = toon('rust', '7a3f22')
TRK = toon('track', '3e2c22'); WHEEL = toon('wheel', '2c2e33'); HUB = toon('hub', '8a8f96'); RED = toon('red', 'ff3020', emit=2.5)
CYAN = toon('cyan', '50e8ff', emit=2); STRIPE = toon('stripe', '000000', stripes=2.2); TIP = toon('tip', 'd8342a')

root = bpy.data.objects.new('tank', None); sc.collection.objects.link(root)
def finish(o, m, parent, bevel, ink=0.035):
    o.data.materials.append(m); o.parent = parent
    if bevel:
        bv = o.modifiers.new('bev', 'BEVEL'); bv.width = bevel; bv.segments = 2
    if ink:   # inverted shell = outline
        o.data.materials.append(INK); s = o.modifiers.new('ink', 'SOLIDIFY'); s.thickness = ink; s.offset = 1
        s.use_flip_normals = True; s.material_offset = 1
    return o
def box(name, size, loc, m, parent=root, bevel=0.05, rot=(0, 0, 0), ink=0.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True); return finish(o, m, parent, bevel, ink)
def cyl(name, r, depth, loc, rot, m, parent=root, bevel=0.03, verts=24, ink=0.035):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot); o = bpy.context.object; o.name = name
    return finish(o, m, parent, bevel, ink)
X = (0, math.pi / 2, 0); Y = (math.pi / 2, 0, 0)
# x forward, y left, z up
# tracks: a closed belt of links wrapping two end sprockets and the road wheels.
# The belt moves one quarter of a link spacing per TREAD frame, so 4 frames loop seamlessly; the wheels turn by the same distance.
HALF, R, ZC, NL = 1.7, 0.46, 0.47, 50
PER = 4 * HALF + 2 * math.pi * R; SP = PER / NL; SHIFT = TREAD / 4 * SP
def belt(t):   # point and tangent angle on the loop, t = distance travelled (forward along the top run)
    t %= PER
    if t < 2 * HALF: return (-HALF + t, ZC + R), 0
    t -= 2 * HALF
    if t < math.pi * R: a = t / R; return (HALF + R * math.sin(a), ZC + R * math.cos(a)), a
    t -= math.pi * R
    if t < 2 * HALF: return (HALF - t, ZC - R), math.pi
    t -= 2 * HALF; a = t / R; return (-HALF - R * math.sin(a), ZC - R * math.cos(a)), math.pi + a
for side, sy in (('L', 1), ('R', -1)):
    y = 1.12 * sy
    box(f'inner{side}', (3.5, 0.08, 0.75), (0, y - 0.36 * sy, 0.5), WHEEL, bevel=0.02, ink=0)   # backing plate so you can't see through
    for i in range(NL):
        (px, pz), ang = belt(i * SP + SHIFT)
        lk = box(f'link{side}{i}', (SP * 0.86, 0.82, 0.08), (px, y, pz), TRK, bevel=0.015, rot=(0, -ang, 0), ink=0.018)
        # grouser bar sticking out of each link
        ox, oz = -math.sin(-ang) * 0.06, math.cos(-ang) * 0.06
        n = (math.sin(ang) * 0.06, math.cos(ang) * 0.06)
        box(f'grouser{side}{i}', (SP * 0.3, 0.84, 0.06), (px + n[0], y, pz + n[1]), WHEEL, bevel=0.01, rot=(0, -ang, 0), ink=0.012)
    rot = -SHIFT / 0.36
    for i, (x, r) in enumerate([(-HALF, 0.4), (-1.02, 0.34), (-0.34, 0.34), (0.34, 0.34), (1.02, 0.34), (HALF, 0.4)]):
        z = ZC if r == 0.4 else ZC - R + 0.04 + r
        cyl(f'wheel{side}{i}', r, 0.6, (x, y, z), Y, WHEEL, bevel=0.03, ink=0.02)
        cyl(f'rim{side}{i}', r * 0.72, 0.64, (x, y, z), Y, GUN, bevel=0.02, ink=0.015)
        cyl(f'hub{side}{i}', r * 0.3, 0.68, (x, y, z), Y, HUB, bevel=0.01, verts=12, ink=0.012)
        teeth = 8 if r == 0.4 else 5
        for k in range(teeth):
            a = rot * (0.36 / r) + k * 2 * math.pi / teeth
            cyl(f'bolt{side}{i}{k}', 0.04, 0.7, (x + r * 0.5 * math.cos(a), y, z + r * 0.5 * math.sin(a)), Y, HUB, bevel=0, verts=8, ink=0.01)
    box(f'fender{side}', (3.9, 0.9, 0.07), (0, y, ZC + R + 0.2), DARK, bevel=0.03)
    box(f'skirt{side}', (3.8, 0.07, 0.2), (0.05, y + 0.44 * sy, ZC + R + 0.12), STRIPE, bevel=0.02)
    for x in (-1.4, 0, 1.4): box(f'hanger{side}{x}', (0.12, 0.6, 0.12), (x, y - 0.1 * sy, ZC + R + 0.13), WHEEL, bevel=0.01, ink=0.012)
box('hull', (3.2, 1.55, 0.6), (-0.15, 0, 1.1), HULL, bevel=0.14)
box('glacis', (0.9, 1.45, 0.42), (1.5, 0, 0.98), DARK, bevel=0.08, rot=(0, math.radians(28), 0))
box('engine', (0.8, 1.3, 0.35), (-1.45, 0, 1.5), DARK, bevel=0.08)
for i in range(3): box(f'vent{i}', (0.08, 1.1, 0.06), (-1.65 + i * 0.2, 0, 1.69), WHEEL, bevel=0.01, ink=0.015)
cyl('exhaust', 0.1, 0.5, (-1.7, 0.55, 1.75), (0, 0, 0), RUST, bevel=0.02, verts=12)
for x in (-0.9, 0.9): box(f'rust{x}', (0.5, 1.57, 0.1), (x - 0.15, 0, 1.15), RUST, bevel=0.03, ink=0)

tur = bpy.data.objects.new('turret', None); tur.location = (0.05, 0, 1.4); tur.rotation_euler = (0, 0, math.radians(TURRET)); tur.parent = root; sc.collection.objects.link(tur)
box('turretBody', (1.7, 1.35, 0.72), (0, 0, 0.36), DARK, parent=tur, bevel=0.2)
box('turretFront', (0.5, 1.1, 0.5), (0.85, 0, 0.33), GUN, parent=tur, bevel=0.12, rot=(0, math.radians(20), 0))
box('visor', (0.06, 0.7, 0.12), (1.08, 0, 0.52), RED, parent=tur, bevel=0.02, ink=0.02)
cyl('lamp', 0.08, 0.06, (0.9, -0.62, 0.2), Y, CYAN, parent=tur, verts=12, ink=0.02)
gun = bpy.data.objects.new('barrel', None); gun.location = (0.95, 0, 0.3); gun.parent = tur; sc.collection.objects.link(gun)
cyl('mantlet', 0.32, 0.45, (0.12, 0, 0), X, GUN, parent=gun)
cyl('tube', 0.19, 2.4, (1.45, 0, 0), X, GUN, parent=gun)
cyl('brake', 0.27, 0.5, (2.6, 0, 0), X, DARK, parent=gun)
cyl('bore', 0.13, 0.52, (2.62, 0, 0), X, WHEEL, parent=gun, ink=0)
for sd, y in (('L', 0.5), ('R', -0.5)):   # rocket pods, parallel to the cannon
    box(f'post{sd}', (0.3, 0.16, 0.3), (-0.1, y, 0.82), WHEEL, parent=tur, bevel=0.03)
    cyl(f'pod{sd}', 0.24, 1.9, (0.1, y, 1.12), X, GUN, parent=tur)
    cyl(f'podcap{sd}', 0.25, 0.08, (1.06, y, 1.12), X, DARK, parent=tur, bevel=0.01)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.17, depth=0.32, location=(1.2, y, 1.12), rotation=X); finish(bpy.context.object, TIP, tur, 0.0)
    for bx in (-0.55, 0.55): cyl(f'band{sd}{bx}', 0.255, 0.1, (bx, y, 1.12), X, RUST, parent=tur, bevel=0.01, ink=0.02)

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0.3
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; cam.data.ortho_scale = 7.6; sc.collection.objects.link(cam); sc.camera = cam
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 768; sc.view_settings.view_transform = 'Standard'
os.makedirs(out, exist_ok=True)
pitch = math.radians(PITCH); d = 20; c = Vector((0, 0, 1.0))
cam.location = c + Vector((0, -d * math.cos(pitch), d * math.sin(pitch))); cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
sun.rotation_euler = (math.radians(50), 0, math.radians(-35))   # light from upper-left of screen, fixed to camera
for yaw in yaws:
    root.rotation_euler = (0, 0, math.radians(-20 - yaw))
    sc.render.filepath = f'{out}/tank_{int(yaw)}_t{int(TURRET)}_f{TREAD}.png'; bpy.ops.render.render(write_still=True)
print('done')
