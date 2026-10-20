"""Chibi zombie built in Blender from rounded shapes on a joint hierarchy (forward kinematics), cartoon render.
usage: python zombie.py <out_dir> <pose[@yaw]> ...   poses: idle walk0..walk3 attack0..attack2 hit death0..death2"""
import bpy, math, sys, os
from mathutils import Vector
out = sys.argv[1]; jobs = sys.argv[2:] or ['idle']
PITCH = float(os.environ.get('PITCH', 30)); RES = int(os.environ.get('RES', 768))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
D = math.radians
def lin(h): h = h.lstrip('#'); return tuple((int(h[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4))
def toon(name, hexc, emit=0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    N.clear(); o = N.new('ShaderNodeOutputMaterial'); dif = N.new('ShaderNodeBsdfDiffuse'); s2r = N.new('ShaderNodeShaderToRGB'); L.new(dif.outputs[0], s2r.inputs[0])
    r = N.new('ShaderNodeValToRGB'); r.color_ramp.interpolation = 'CONSTANT'; e = r.color_ramp.elements
    e[0].color = (0.55, 0.55, 0.66, 1); e[1].position = 0.08; e[1].color = (0.9, 0.9, 0.95, 1); x = e.new(0.35); x.color = (1.25, 1.22, 1.15, 1)
    L.new(s2r.outputs[0], r.inputs[0])
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1; mul.inputs[6].default_value = (*lin(hexc), 1)
    L.new(r.outputs[0], mul.inputs[7]); em = N.new('ShaderNodeEmission'); em.inputs[1].default_value = 1 + emit
    L.new(mul.outputs[2], em.inputs[0]); L.new(em.outputs[0], o.inputs[0]); return m
INK = bpy.data.materials.new('ink'); INK.use_nodes = True; INK.use_backface_culling = True
INK.node_tree.nodes.remove(INK.node_tree.nodes['Principled BSDF']); em = INK.node_tree.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (0.03, 0.02, 0.03, 1)
INK.node_tree.links.new(em.outputs[0], INK.node_tree.nodes['Material Output'].inputs[0])
SKIN = toon('skin', '7f97a8'); SKIN2 = toon('skin2', '6a8091'); SHIRT = toon('shirt', '6a4470'); VEST = toon('vest', '5c3b2b'); PANTS = toon('pants', '4d3b27')
SHOE = toon('shoe', '4a2b1d'); CLAW = toon('claw', '3e3444'); MOUTH = toon('mouth', '3a0c12'); TOOTH = toon('tooth', 'ebe2c4'); EYE = toon('eye', 'f3f1e8', 0.2)
PUPIL = toon('pupil', '1d1b20'); HAIR = toon('hair', '3b3a2a')

def joint(name, parent, loc, rot=(0, 0, 0)):
    j = bpy.data.objects.new(name, None); sc.collection.objects.link(j); j.parent = parent; j.location = loc; j.rotation_euler = rot; return j
def finish(o, m, parent, ink=0.022, smooth=2):
    o.data.materials.append(m); o.parent = parent
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
        s = o.modifiers.new('sub', 'SUBSURF'); s.levels = s.render_levels = smooth
    if ink:
        o.data.materials.append(INK); s = o.modifiers.new('ink', 'SOLIDIFY'); s.thickness = ink; s.offset = 1; s.use_flip_normals = True; s.material_offset = 1
    return o
def blob(parent, loc, size, m, rot=(0, 0, 0), ink=0.022):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=(0, 0, 0)); o = bpy.context.object
    o.scale = size; bpy.ops.object.transform_apply(scale=True); o.location = loc; o.rotation_euler = rot; return finish(o, m, parent, ink, 2)
def limb(parent, length, r1, r2, m, ink=0.022):
    """tapered segment hanging from the joint along -z, rounded at both ends"""
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=r2, radius2=r1, depth=length, location=(0, 0, -length / 2), end_fill_type='NGON'); o = bpy.context.object
    finish(o, m, parent, ink, 1)
    blob(parent, (0, 0, 0), (r1, r1, r1), m, ink=ink)
    return o

root = joint('root', None, (0, 0, 0))
hips = joint('hips', root, (0, 0, 0.98))
blob(hips, (0, 0, 0.02), (0.3, 0.34, 0.2), PANTS)
spine = joint('spine', hips, (0, 0, 0.05))
blob(spine, (0.04, 0, 0.3), (0.34, 0.4, 0.38), SHIRT)           # chest
blob(spine, (-0.1, 0, 0.32), (0.3, 0.42, 0.36), VEST, ink=0.02)  # vest shell, sits behind the open front
for sy in (1, -1):
    blob(spine, (0.2, 0.27 * sy, 0.3), (0.14, 0.1, 0.33), VEST, ink=0.016)   # vest flaps either side of the open front
blob(spine, (0.0, 0, 0.0), (0.27, 0.32, 0.14), SHIRT, ink=0.018)   # ragged shirt hem
neck = joint('neck', spine, (0.08, 0, 0.58))
blob(neck, (0, 0, 0.05), (0.1, 0.1, 0.12), SKIN)
head = joint('head', neck, (0.02, 0, 0.12))
blob(head, (0.05, 0, 0.36), (0.42, 0.44, 0.4), SKIN)
blob(head, (0.2, 0, 0.08), (0.24, 0.3, 0.16), SKIN)                # jaw
blob(head, (0.4, 0, 0.1), (0.07, 0.19, 0.08), MOUTH, ink=0.012)    # mouth
for i, yy in enumerate((-0.12, -0.05, 0.03, 0.11)):                # jagged teeth
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.028, depth=0.08, location=(0.45, yy, 0.15 if i % 2 else 0.05), rotation=(0, math.pi if i % 2 else 0, 0))
    finish(bpy.context.object, TOOTH, head, 0.008, 0)
for sy in (1, -1):
    blob(head, (0.3, 0.19 * sy, 0.42), (0.17, 0.17, 0.18), EYE, ink=0.016)
    blob(head, (0.465, 0.19 * sy, 0.42), (0.02, 0.05, 0.05), PUPIL, ink=0)
    blob(head, (0.38, 0.19 * sy, 0.6), (0.07, 0.17, 0.04), SKIN2, rot=(D(-15 * sy), 0, 0), ink=0.012)   # heavy brow
    blob(head, (0.0, 0.44 * sy, 0.33), (0.08, 0.04, 0.11), SKIN, ink=0.014)   # ear
for i in range(6):   # tufts of hair
    a = i / 6 * math.pi - math.pi / 2
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.04, depth=0.18, location=(-0.05 + 0.12 * math.cos(a), 0.2 * math.sin(a), 0.78), rotation=(D(25) * math.sin(a), D(-20), 0))
    finish(bpy.context.object, HAIR, head, 0.01, 0)
J = {'hips': hips, 'spine': spine, 'neck': neck, 'head': head}
for side, sy in (('L', 1), ('R', -1)):
    sh = joint(f'shoulder{side}', spine, (0.0, 0.4 * sy, 0.46)); J[f'shoulder{side}'] = sh
    blob(sh, (0, 0, 0), (0.15, 0.15, 0.15), SHIRT)
    limb(sh, 0.4, 0.12, 0.1, SHIRT)
    el = joint(f'elbow{side}', sh, (0, 0, -0.4)); J[f'elbow{side}'] = el
    limb(el, 0.42, 0.09, 0.075, SKIN)
    wr = joint(f'wrist{side}', el, (0, 0, -0.42)); J[f'wrist{side}'] = wr
    blob(wr, (0.03, 0, -0.1), (0.15, 0.1, 0.15), SKIN)
    for k, a in enumerate((-30, -10, 10, 30)):   # four long clawed fingers fanning out
        f = joint(f'finger{side}{k}', wr, (0.09, math.sin(D(a)) * 0.12, -0.2), (D(a) * 0.6 * sy if False else D(a * 0.6), D(-20), 0))
        limb(f, 0.22, 0.04, 0.03, SKIN, ink=0.012)
        t = joint(f'tip{side}{k}', f, (0, 0, -0.22), (0, D(-35), 0))
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.032, depth=0.15, location=(0, 0, -0.07), rotation=(math.pi, 0, 0)); finish(bpy.context.object, CLAW, t, 0.008, 0)
    hp = joint(f'hip{side}', hips, (0, 0.17 * sy, -0.05)); J[f'hip{side}'] = hp
    limb(hp, 0.4, 0.15, 0.13, PANTS)
    kn = joint(f'knee{side}', hp, (0, 0, -0.4)); J[f'knee{side}'] = kn
    limb(kn, 0.42, 0.13, 0.11, PANTS)
    blob(kn, (0, 0, -0.38), (0.14, 0.14, 0.07), PANTS, ink=0.014)   # torn cuff
    an = joint(f'ankle{side}', kn, (0, 0, -0.44)); J[f'ankle{side}'] = an
    blob(an, (0.1, 0, -0.06), (0.25, 0.15, 0.1), SHOE)

# ---- poses: joint -> (roll about x, pitch about y, yaw about z) in degrees; pitch < 0 swings a limb forward
BASE = {'spine': (0, 22, 0), 'neck': (0, -18, 0), 'head': (0, -8, 0), 'hips': (0, 0, 0),
        'shoulderL': (35, -85, 0), 'shoulderR': (-30, -78, 0), 'elbowL': (0, 25, 0), 'elbowR': (0, 30, 0),
        'wristL': (0, 45, 0), 'wristR': (0, 50, 0), 'hipL': (0, -8, 0), 'hipR': (0, 8, 0), 'kneeL': (0, 14, 0), 'kneeR': (0, 10, 0),
        'ankleL': (0, -6, 0), 'ankleR': (0, -18, 0)}
def walk(ph):   # ph 0..1, shambling: legs swing, the body rolls side to side, arms dangle
    s, c = math.sin(ph * 2 * math.pi), math.cos(ph * 2 * math.pi)
    lift = lambda v: max(0, v)
    return {'hipL': (0, -26 * s, 0), 'hipR': (0, 26 * s, 0), 'kneeL': (0, 8 + 40 * lift(c), 0), 'kneeR': (0, 8 + 40 * lift(-c), 0),
            'ankleL': (0, -8 * s, 0), 'ankleR': (0, 8 * s, 0), 'hips': (6 * s, 0, 8 * s), 'spine': (-6 * s, 22, -10 * s),
            'shoulderL': (35, -85 + 12 * s, 0), 'shoulderR': (-30, -78 - 12 * s, 0), 'head': (8 * s, -8, 0)}, 0.05 * abs(c)
POSES = {'idle': ({}, 0)}
for i in range(4): POSES[f'walk{i}'] = walk(i / 4)
POSES['attack0'] = ({'spine': (0, 5, 0), 'shoulderL': (55, -130, 0), 'elbowL': (0, -40, 0), 'shoulderR': (-55, -120, 0), 'elbowR': (0, -45, 0), 'neck': (0, -25, 0)}, 0)   # wind-up, claws high
POSES['attack1'] = ({'spine': (0, 40, 0), 'shoulderL': (15, -70, 0), 'elbowL': (0, -10, 0), 'shoulderR': (-15, -55, 0), 'elbowR': (0, -5, 0), 'wristL': (0, 10, 0), 'neck': (0, -5, 0)}, 0)   # swipe down
POSES['attack2'] = ({'spine': (0, 45, 0), 'shoulderL': (-5, -25, 0), 'elbowL': (0, -5, 0), 'shoulderR': (5, -15, 0), 'elbowR': (0, 0, 0), 'neck': (0, 0, 0)}, 0)   # follow-through
POSES['hit'] = ({'spine': (0, -12, 0), 'neck': (0, 10, 0), 'head': (0, 15, 0), 'shoulderL': (60, -40, 0), 'shoulderR': (-60, -30, 0)}, 0)
def pose(name):
    p, bob = POSES[name]
    for k, v in BASE.items(): J[k].rotation_euler = tuple(D(a) for a in v)
    for k, v in p.items(): J[k].rotation_euler = tuple(D(a) for a in v)
    hips.location.z = 0.98 + bob

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0.3
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; sc.collection.objects.link(sun)
sun.rotation_euler = (D(50), 0, D(-35))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; cam.data.ortho_scale = 3.4; sc.collection.objects.link(cam); sc.camera = cam
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = RES; sc.view_settings.view_transform = 'Standard'
c = Vector((0, 0, 1.25)); d = 20; pr = D(PITCH)
cam.location = c + Vector((0, -d * math.cos(pr), d * math.sin(pr))); cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
os.makedirs(out, exist_ok=True)
for job in jobs:
    name, _, yaw = job.partition('@'); yaw = float(yaw or 0)
    pose(name)
    root.rotation_euler = (0, 0, D(235 + yaw))   # yaw 0: walking toward the viewer's left, like the game sprite
    sc.render.filepath = f'{out}/z_{name}_{int(yaw)}.png'; bpy.ops.render.render(write_still=True)
print('done')
