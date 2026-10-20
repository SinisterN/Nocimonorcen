"""Rigs the TRELLIS zombie mesh (3D from the original art): skeleton placed from measured joints, mesh bound by bone heat
(falls back to distance weights), poses as rotations in the parent's rest axes. Exports the bench model and renders frames.
usage: python rig3d.py <mesh.glb> <out_dir> [pose[@yaw] ...]      env GLB=out.glb exports all poses and exits; SKEL=1 draws bones"""
import bpy, math, sys, os
from mathutils import Vector, Matrix, Euler
src, out = sys.argv[1], sys.argv[2]; jobs = sys.argv[3:]
D = math.radians
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.abspath(src))
meshes = [o for o in sc.objects if o.type == 'MESH']
for o in bpy.context.selected_objects: o.select_set(False)
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
body = bpy.context.object
for o in list(sc.objects):
    if o is not body and o.type != 'MESH': bpy.data.objects.remove(o)
body.parent = None
# measured model faces -Y, 1 unit tall, centred; turn it to face +X (left side at +Y), 2.3 tall, feet at z = 0
S = 2.3; Z0 = 0.497
FIX = Matrix.Translation((0, 0, Z0 * S)) @ Matrix.Rotation(D(90), 4, 'Z') @ Matrix.Scale(S, 4)
body.data.transform(FIX @ body.matrix_world); body.matrix_world = Matrix.Identity(4)
def T(x, y, z): return tuple(FIX @ Vector((x, y, z)))
# joints measured on the front and side views (model's own right side is at -x there)
J = {'pelvis': T(0, 0.12, -0.24), 'waist': T(0, 0.11, -0.1), 'upchest': T(0, 0.07, 0.15), 'headbase': T(0, 0.03, 0.19), 'top': T(0, -0.04, 0.5),
     'clavL': T(0.06, 0.07, 0.17), 'shoulderL': T(0.16, 0.05, 0.16), 'elbowL': T(0.25, -0.02, 0.01), 'wristL': T(0.31, -0.12, -0.08), 'tipL': T(0.38, -0.18, -0.22),
     'clavR': T(-0.06, 0.07, 0.17), 'shoulderR': T(-0.16, 0.05, 0.17), 'elbowR': T(-0.27, -0.05, 0.13), 'wristR': T(-0.33, -0.15, 0.07), 'tipR': T(-0.38, -0.2, -0.03),
     'hipL': T(0.1, 0.13, -0.27), 'kneeL': T(0.12, 0.12, -0.36), 'ankleL': T(0.15, 0.12, -0.44), 'toeL': T(0.16, -0.06, -0.46),
     'hipR': T(-0.1, 0.13, -0.27), 'kneeR': T(-0.12, 0.12, -0.36), 'ankleR': T(-0.14, 0.12, -0.44), 'toeR': T(-0.15, -0.06, -0.46)}
BONES = {'spine': ('pelvis', 'waist', None), 'chest': ('waist', 'upchest', 'spine'), 'neck': ('upchest', 'headbase', 'chest'), 'head': ('headbase', 'top', 'neck')}
for s in 'LR':
    BONES.update({f'clav{s}': (f'clav{s}', f'shoulder{s}', 'chest'), f'shoulder{s}': (f'shoulder{s}', f'elbow{s}', f'clav{s}'),
                  f'elbow{s}': (f'elbow{s}', f'wrist{s}', f'shoulder{s}'), f'wrist{s}': (f'wrist{s}', f'tip{s}', f'elbow{s}'),
                  f'hip{s}': (f'hip{s}', f'knee{s}', 'spine'), f'knee{s}': (f'knee{s}', f'ankle{s}', f'hip{s}'), f'ankle{s}': (f'ankle{s}', f'toe{s}', f'knee{s}')})
arm = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm); sc.collection.objects.link(rig)
for o in bpy.context.selected_objects: o.select_set(False)
bpy.context.view_layer.objects.active = rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for n, (h, t, p) in BONES.items():
    b = arm.edit_bones.new(n); b.head = J[h]; b.tail = J[t]
    if p: b.parent = eb[p]; b.use_connect = False
    eb[n] = b
bpy.ops.object.mode_set(mode='OBJECT')
SEG = {n: (Vector(J[h]), Vector(J[t])) for n, (h, t, _) in BONES.items()}
def segdist(p, a, b):
    ab = b - a; t = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * t)).length
def distance_weights(o, sharp=6.0):
    groups = {n: o.vertex_groups.new(name=n) for n in BONES}
    for v in o.data.vertices:
        ds = sorted((segdist(v.co, *SEG[n]), n) for n in BONES); d0 = ds[0][0] + 1e-4
        ws = [(n, (d0 / (d + 1e-4)) ** (sharp * 2)) for d, n in ds[:3]]; tot = sum(w for _, w in ws)
        for n, w in ws:
            if w / tot > 0.02: groups[n].add([v.index], w / tot, 'REPLACE')
# bind: bone heat first; if it leaves vertices unweighted, use distance weights instead
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
unweighted = sum(1 for v in body.data.vertices if not any(g.weight > 0.01 for g in v.groups))
print('bone heat unweighted vertices:', unweighted, 'of', len(body.data.vertices))
if unweighted > len(body.data.vertices) * 0.02:
    body.vertex_groups.clear(); distance_weights(body); print('using distance weights')
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = body; body.select_set(True)
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT'); bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=3); bpy.ops.object.mode_set(mode='OBJECT')
# the big head sits right on the shoulders: everything inside the skull follows only the head (blending into the neck at its rim)
HCEN = Vector(T(0.02, -0.04, 0.31)); HR = Vector((0.23, 0.22, 0.215)) * S
idx = {g.name: g.index for g in body.vertex_groups}; ghead = body.vertex_groups['head']
for v in body.data.vertices:
    q = v.co - HCEN; q = Vector((q.y / HR.x, q.x / HR.y, q.z / HR.z))   # model's x/y were swapped by the turn
    r = q.length
    if r > 1.12: continue
    k = 1.0 if r < 0.95 else (1.12 - r) / 0.17
    for g in list(v.groups):
        if g.group != ghead.index: body.vertex_groups[g.group].add([v.index], g.weight * (1 - k), 'REPLACE')
    ghead.add([v.index], k + (1 - k) * next((g.weight for g in v.groups if g.group == ghead.index), 0), 'REPLACE')

# poses relative to the sculpted rest pose: bone -> (roll x, pitch y, yaw z) deg; pitch < 0 swings a limb forward, +roll swings the left arm out
def walk(ph):
    s, c = math.sin(ph * 2 * math.pi), math.cos(ph * 2 * math.pi); up = lambda v: max(0, v)
    return {'hipL': (0, -24 * s, 0), 'hipR': (0, 24 * s, 0), 'kneeL': (0, 34 * up(c), 0), 'kneeR': (0, 34 * up(-c), 0),
            'ankleL': (0, -10 * s, 0), 'ankleR': (0, 10 * s, 0), 'spine': (4 * s, 0, 7 * s), 'chest': (-3 * s, 0, -6 * s), 'head': (6 * s, 0, -4 * s),
            'shoulderL': (0, 10 * s, 0), 'shoulderR': (0, -10 * s, 0), 'elbowL': (0, -6 * s, 0), 'elbowR': (0, 6 * s, 0)}, 0.03 * abs(c)
POSES = {'idle': ({}, 0)}
for i in range(4): POSES[f'walk{i}'] = walk(i / 4)
POSES['attack0'] = ({'chest': (0, -10, 0), 'neck': (0, -6, 0), 'shoulderL': (30, -55, 0), 'elbowL': (0, -20, 0), 'shoulderR': (-30, -45, 0), 'elbowR': (0, -20, 0)}, 0)   # claws raised
POSES['attack1'] = ({'chest': (0, 22, 0), 'spine': (0, 8, 0), 'shoulderL': (0, -20, 0), 'shoulderR': (0, -10, 0), 'elbowL': (0, 10, 0), 'elbowR': (0, 10, 0)}, 0)        # swipe down
POSES['attack2'] = ({'chest': (0, 28, 0), 'spine': (0, 10, 0), 'shoulderL': (0, 25, 0), 'shoulderR': (0, 30, 0), 'elbowL': (0, 15, 0), 'elbowR': (0, 15, 0), 'neck': (0, 8, 0)}, 0)   # follow-through
POSES['hit'] = ({'spine': (0, -10, 0), 'chest': (0, -14, 0), 'neck': (0, 12, 0), 'head': (0, 14, 0), 'shoulderL': (30, 15, 0), 'shoulderR': (-30, 20, 0)}, 0)
def pose(name):
    p, bob = POSES[name]
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'; R = Euler(tuple(D(a) for a in p.get(pb.name, (0, 0, 0))), 'XYZ').to_matrix(); M = pb.bone.matrix_local.to_3x3()
        pb.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()
    rig.location.z = bob; bpy.context.view_layer.update()

if os.environ.get('GLB'):
    # every pose on one timeline, 10 frames apart, held (constant): the bench jumps to a pose by its time
    rig.animation_data_create(); act = bpy.data.actions.new('poses'); rig.animation_data.action = act
    for i, name in enumerate(POSES):
        pose(name)
        for pb in rig.pose.bones: pb.keyframe_insert('rotation_quaternion', frame=1 + 10 * i)
        rig.keyframe_insert('location', frame=1 + 10 * i)
    for fc in (act.layers[0].strips[0].channelbags[0].fcurves if hasattr(act, 'layers') and act.layers else act.fcurves):
        for k in fc.keyframe_points: k.interpolation = 'CONSTANT'
    sc.frame_start, sc.frame_end = 1, 1 + 10 * (len(POSES) - 1)
    print('POSE_ORDER', list(POSES))
    for im in bpy.data.images:
        if im.size[0] > 1024: im.scale(1024, 1024)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.environ['GLB']), export_format='GLB', export_apply=True, export_animations=True, export_animation_mode='ACTIVE_ACTIONS',
                              export_skins=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=88)
    print('glb written'); sys.exit(0)

# renders: painted texture shown flat (emission), game camera
for m in bpy.data.materials:
    if not m.node_tree: continue
    N = m.node_tree.nodes; L = m.node_tree.links; b = next((n for n in N if n.type == 'BSDF_PRINCIPLED'), None); o = next((n for n in N if n.type == 'OUTPUT_MATERIAL'), None)
    if b and o:
        e = N.new('ShaderNodeEmission'); bc = b.inputs['Base Color']
        if bc.links: L.new(bc.links[0].from_socket, e.inputs[0])
        e.inputs[1].default_value = 1.5; L.new(e.outputs[0], o.inputs[0])
if os.environ.get('SKEL'):
    arm.display_type = 'STICK'; rig.show_in_front = True
w = bpy.data.worlds.new('w'); sc.world = w
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(os.environ.get('ORTHO', 2.9)); sc.collection.objects.link(cam); sc.camera = cam
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = int(os.environ.get('RES', 640)); sc.view_settings.view_transform = 'Standard'
c = Vector((0, 0, 1.15)); d = 20; pr = D(float(os.environ.get('PITCH', 30)))
cam.location = c + Vector((0, -d * math.cos(pr), d * math.sin(pr))); cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
os.makedirs(out, exist_ok=True)
for job in jobs:
    name, _, yaw = job.partition('@'); yaw = float(yaw or 0); pose(name)
    for o in (rig,): o.rotation_euler = (0, 0, D(235 + yaw))
    sc.render.filepath = os.path.abspath(f'{out}/{name}_{int(yaw)}.png'); bpy.ops.render.render(write_still=True)
print('done')
