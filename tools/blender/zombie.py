"""Chibi zombie v2: one continuous skinned body grown from a skeleton (skin modifier), a head sculpted from fused shapes
(voxel remesh + boolean sockets and mouth), clothes shaped over the body with torn hems, rigged on a real armature.
usage: python zombie2.py <out_dir> <pose[@yaw]> ...      env CLAY=1 renders the bare body in grey"""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix, Euler
out = sys.argv[1]; jobs = sys.argv[2:] or ['idle']
PITCH = float(os.environ.get('PITCH', 30)); RES = int(os.environ.get('RES', 768)); CLAY = os.environ.get('CLAY') == '1'
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; D = math.radians; rnd = random.Random(7)
def lin(h): h = h.lstrip('#'); return tuple((int(h[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4))

# ---------- materials: 3-band cartoon shading, optional blotches (noise) for rot and dirt
def toon(name, hexc, emit=0, blotch=None, bscale=6.0):
    if CLAY and emit == 0: hexc, blotch = 'a8a8a8', None
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    N.clear(); o = N.new('ShaderNodeOutputMaterial'); dif = N.new('ShaderNodeBsdfDiffuse'); s2r = N.new('ShaderNodeShaderToRGB'); L.new(dif.outputs[0], s2r.inputs[0])
    r = N.new('ShaderNodeValToRGB'); r.color_ramp.interpolation = 'CONSTANT'; e = r.color_ramp.elements
    e[0].color = (0.55, 0.55, 0.66, 1); e[1].position = 0.08; e[1].color = (0.88, 0.88, 0.94, 1); x = e.new(0.38); x.color = (1.22, 1.2, 1.12, 1)
    L.new(s2r.outputs[0], r.inputs[0])
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
    if blotch:
        tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = bscale; nz.inputs['Detail'].default_value = 3
        L.new(tc.outputs['Object'], nz.inputs['Vector'])
        cr = N.new('ShaderNodeValToRGB'); cr.color_ramp.interpolation = 'CONSTANT'; ce = cr.color_ramp.elements
        ce[0].color = (*lin(hexc), 1); ce[1].position = 0.62; ce[1].color = (*lin(blotch), 1)
        L.new(nz.outputs['Fac'], cr.inputs[0]); L.new(cr.outputs[0], mul.inputs[6])
    else: mul.inputs[6].default_value = (*lin(hexc), 1)
    L.new(r.outputs[0], mul.inputs[7]); em = N.new('ShaderNodeEmission'); em.inputs[1].default_value = 1 + emit
    L.new(mul.outputs[2], em.inputs[0]); L.new(em.outputs[0], o.inputs[0]); return m
INK = bpy.data.materials.new('ink'); INK.use_nodes = True; INK.use_backface_culling = True
INK.node_tree.nodes.remove(INK.node_tree.nodes['Principled BSDF']); _e = INK.node_tree.nodes.new('ShaderNodeEmission'); _e.inputs[0].default_value = (0.03, 0.02, 0.03, 1)
INK.node_tree.links.new(_e.outputs[0], INK.node_tree.nodes['Material Output'].inputs[0])
SKIN = toon('skin', '86a0b2', blotch='6c8396', bscale=5); SHIRT = toon('shirt', '6d4573', blotch='5a3660', bscale=9); VEST = toon('vest', '5e3d2c', blotch='4c2f22', bscale=8)
PANTS = toon('pants', '57432b', blotch='46351f', bscale=8); PATCH = toon('patch', '6b5476'); SHOE = toon('shoe', '5a3423', blotch='472619', bscale=10)
CLAW = toon('claw', '35303d'); MOUTH = toon('mouth', '3a0c12'); GUM = toon('gum', '7a3a44'); TOOTH = toon('tooth', 'e9dfbd'); EYE = toon('eye', 'f2f0e6', 0.15)
PUPIL = toon('pupil', '1d1b20'); HAIR = toon('hair', '3d3c2b'); STITCH = toon('stitch', '2a2228')

def link(o): sc.collection.objects.link(o) if o.name not in sc.collection.objects else None; return o
def activate(o):
    for x in bpy.context.selected_objects: x.select_set(False)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
def apply_mods(o):
    activate(o)
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
def ellipsoid(loc, size, rot=(0, 0, 0), seg=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=(0, 0, 0)); o = bpy.context.object
    o.scale = size; o.rotation_euler = rot; o.location = loc; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); return o
def fuse(parts, voxel):
    activate(parts[0])
    for p in parts[1:]: p.select_set(True)
    bpy.ops.object.join(); o = bpy.context.object
    rm = o.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = voxel
    sm = o.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.6; sm.iterations = 4
    apply_mods(o); return o
def carve(o, cutter):
    b = o.modifiers.new('cut', 'BOOLEAN'); b.operation = 'DIFFERENCE'; b.object = cutter
    apply_mods(o); bpy.data.objects.remove(cutter)
def smooth_shade(o):
    for p in o.data.polygons: p.use_smooth = True
def dress(o, mats, ink=0.012, sub=1):
    o.data.materials.clear()
    for m in mats: o.data.materials.append(m)
    smooth_shade(o)
    if sub: s = o.modifiers.new('sub', 'SUBSURF'); s.levels = s.render_levels = sub
    if ink:
        o.data.materials.append(INK); s = o.modifiers.new('ink', 'SOLIDIFY'); s.thickness = ink; s.offset = 1; s.use_flip_normals = True
        s.material_offset = len(mats)
    return o

# ---------- skeleton (rest pose: standing, arms hanging slightly forward and out). x forward, y left, z up.
P = {'pelvis': (0, 0, 0.9), 'waist': (0.0, 0, 1.04), 'chest': (0.01, 0, 1.2), 'upchest': (0.01, 0, 1.34), 'neck': (0.03, 0, 1.44), 'headbase': (0.04, 0, 1.52)}
for s, sy in (('L', 1), ('R', -1)):
    P[f'clav{s}'] = (0.0, 0.1 * sy, 1.36); P[f'shoulder{s}'] = (0.0, 0.25 * sy, 1.35)
    P[f'elbow{s}'] = (0.03, 0.33 * sy, 1.03); P[f'wrist{s}'] = (0.06, 0.37 * sy, 0.75)
    P[f'palm{s}'] = (0.07, 0.385 * sy, 0.67)
    # four fingers along the hand's front-back axis (palm faces the thigh), plus a thumb pointing forward
    for k, dx in enumerate((0.075, 0.027, -0.02, -0.066)):
        base = Vector((0.07 + dx, 0.39 * sy, 0.62)); ln = (0.075, 0.06, 0.05) if k in (1, 2) else (0.065, 0.05, 0.045)
        cur = base
        P[f'f{k}a{s}'] = tuple(cur)
        for j, l in enumerate(ln):   # each knuckle curls the finger a bit toward the palm and forward
            ang = D(12 + 14 * j)
            cur = cur + Vector((math.sin(ang) * l * 0.5 + dx * 0.3, -math.sin(ang) * l * 0.35 * sy, -math.cos(ang) * l))
            P[f'f{k}{"bcd"[j]}{s}'] = tuple(cur)
    P[f'th0{s}'] = (0.11, 0.37 * sy, 0.7); P[f'th1{s}'] = (0.16, 0.36 * sy, 0.65); P[f'th2{s}'] = (0.19, 0.35 * sy, 0.6)
    P[f'hip{s}'] = (0.0, 0.11 * sy, 0.86); P[f'knee{s}'] = (0.04, 0.14 * sy, 0.5); P[f'ankle{s}'] = (0.0, 0.14 * sy, 0.14); P[f'toe{s}'] = (0.16, 0.15 * sy, 0.06)
# shorter legs: everything above the hips sits lower, knees move up
LEG = ('hip', 'knee', 'ankle', 'toe')
for n in list(P):
    if not n.startswith(LEG): P[n] = (P[n][0], P[n][1], P[n][2] - 0.08)
for s in 'LR':
    P[f'hip{s}'] = (0.0, P[f'hip{s}'][1], 0.79); P[f'knee{s}'] = (0.04, P[f'knee{s}'][1], 0.46)
# hands are drawn big in this style: scale everything past the wrist up around the wrist
for s in 'LR':
    w = Vector(P[f'wrist{s}'])
    for n in list(P):
        if n.endswith(s) and (n.startswith(('palm', 'th')) or (n[0] == 'f' and n[1].isdigit())): P[n] = tuple(w + (Vector(P[n]) - w) * 1.55)
RAD = {'pelvis': 0.2, 'waist': 0.19, 'chest': 0.24, 'upchest': 0.23, 'neck': 0.09, 'headbase': 0.1}
for s in 'LR':
    RAD.update({f'clav{s}': 0.13, f'shoulder{s}': 0.1, f'elbow{s}': 0.078, f'wrist{s}': 0.06, f'palm{s}': 0.085,
                f'th0{s}': 0.042, f'th1{s}': 0.034, f'th2{s}': 0.026, f'hip{s}': 0.12, f'knee{s}': 0.085, f'ankle{s}': 0.06, f'toe{s}': 0.05})
    for k in range(4):
        for j, r in zip('abcd', (0.03, 0.026, 0.021, 0.016)): RAD[f'f{k}{j}{s}'] = r
EDGES = [('pelvis', 'waist'), ('waist', 'chest'), ('chest', 'upchest'), ('upchest', 'neck'), ('neck', 'headbase')]
for s in 'LR':
    EDGES += [('upchest', f'clav{s}'), (f'clav{s}', f'shoulder{s}'), (f'shoulder{s}', f'elbow{s}'), (f'elbow{s}', f'wrist{s}'), (f'wrist{s}', f'palm{s}'),
              (f'palm{s}', f'th0{s}'), (f'th0{s}', f'th1{s}'), (f'th1{s}', f'th2{s}'), ('pelvis', f'hip{s}'), (f'hip{s}', f'knee{s}'), (f'knee{s}', f'ankle{s}'), (f'ankle{s}', f'toe{s}')]
    for k in range(4): EDGES += [(f'palm{s}', f'f{k}a{s}'), (f'f{k}a{s}', f'f{k}b{s}'), (f'f{k}b{s}', f'f{k}c{s}'), (f'f{k}c{s}', f'f{k}d{s}')]

# ---------- body: skin modifier over the skeleton graph
names = list(P); idx = {n: i for i, n in enumerate(names)}
me = bpy.data.meshes.new('body'); me.from_pydata([P[n] for n in names], [(idx[a], idx[b]) for a, b in EDGES], []); body = link(bpy.data.objects.new('body', me))
sk = body.modifiers.new('skin', 'SKIN'); sk.branch_smoothing = 0.6; sk.use_smooth_shade = True
for n, i in idx.items():
    v = me.skin_vertices[0].data[i]; r = RAD[n]; v.radius = (r, r)
    if n in ('chest', 'upchest', 'pelvis', 'waist'): v.radius = (r * 0.88, r * 1.32)   # wider than deep
    if n.startswith('palm'): v.radius = (r * 1.1, r * 0.55)                          # flat palm
me.skin_vertices[0].data[idx['pelvis']].use_root = True
sub = body.modifiers.new('sub', 'SUBSURF'); sub.levels = 2
apply_mods(body)

# ---------- head: cranium, cheeks, heavy jaw, brow, ears fused; eye sockets and mouth carved
HC = Vector((0.06, 0, 1.84))
def H(x, y, z): return tuple(HC + Vector((x, y, z)))
hp = [ellipsoid(H(0, 0, 0.04), (0.4, 0.42, 0.38)), ellipsoid(H(0.12, 0, -0.17), (0.28, 0.32, 0.22)),
      ellipsoid(H(0.18, 0, -0.26), (0.22, 0.26, 0.13)),                             # jaw
      ellipsoid(H(0.3, 0.15, 0.07), (0.1, 0.17, 0.07), rot=(D(-10), 0, 0)), ellipsoid(H(0.3, -0.15, 0.07), (0.1, 0.17, 0.07), rot=(D(10), 0, 0)),   # brow
      ellipsoid(H(0.41, 0, -0.06), (0.06, 0.05, 0.07)),                               # flat nose
      ellipsoid(H(0.27, 0.22, -0.12), (0.12, 0.09, 0.1)), ellipsoid(H(0.27, -0.22, -0.12), (0.12, 0.09, 0.1)),   # cheekbones
      ellipsoid(H(-0.02, 0.41, -0.02), (0.07, 0.05, 0.11), rot=(D(-15), 0, 0)), ellipsoid(H(-0.02, -0.41, -0.02), (0.07, 0.05, 0.11), rot=(D(15), 0, 0)),
      ellipsoid(H(-0.07, 0, -0.33), (0.09, 0.09, 0.14))]                              # neck stump
head = fuse(hp, 0.012)
for sy in (1, -1): carve(head, ellipsoid(H(0.33, 0.165 * sy, 0.0), (0.14, 0.14, 0.14)))
carve(head, ellipsoid(H(0.38, 0, -0.2), (0.17, 0.2, 0.085), rot=(0, D(-8), 0)))
dec = head.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.35; apply_mods(head)
dress(head, [SKIN], ink=0.014, sub=0)
hparts = []
mouth = ellipsoid(H(0.3, 0, -0.2), (0.1, 0.18, 0.075)); dress(mouth, [MOUTH], ink=0, sub=0); hparts.append(mouth)
tongue = ellipsoid(H(0.33, 0.03, -0.25), (0.08, 0.08, 0.03)); dress(tongue, [GUM], ink=0.006, sub=0); hparts.append(tongue)
def lip_edge(y, z0, z1, steps=60):
    """cast rays backward from in front of the face, stepping from z0 toward the mouth; the lip edge is the last
    step where the ray still hits the face front, before it falls through the opening onto the mouth's back wall"""
    front, last = None, None
    for k in range(steps + 1):
        z = z0 + (z1 - z0) * k / steps
        ok, loc, _, _ = head.ray_cast(Vector((HC.x + 0.9, y, HC.z + z)), Vector((-1, 0, 0)))
        if not ok: continue
        if front is None: front = loc.x
        if loc.x < front - 0.05: return last
        front = max(front - 0.02, min(front, loc.x)) if False else front
        last = (loc.x, z)
    return None
for i in range(12):   # crooked fangs hanging from the upper lip and rising from the lower lip, rooted just inside the lip edge
    y = -0.14 + (i // 2) * 0.056 + (0.02 if i % 2 else 0) + rnd.uniform(-0.006, 0.006); up = i % 2 == 0
    e = lip_edge(y, -0.06, -0.22) if up else lip_edge(y, -0.34, -0.18)
    if not e: continue
    ln = 0.085 + 0.035 * (i in (2, 9)) - 0.02 * (i in (0, 11)); r = 0.028 + 0.008 * (i in (2, 9))
    root = Vector((e[0] - 0.012, y, HC.z + e[1] + (0.02 if up else -0.02)))
    tip_dir = Vector((0.15, 0, -1 if up else 1)).normalized()
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r, depth=ln, location=tuple(root + tip_dir * ln / 2))
    t = bpy.context.object; t.rotation_euler = tip_dir.to_track_quat('Z', 'Y').to_euler(); t.rotation_euler.z += rnd.uniform(-0.2, 0.2)
    dress(t, [TOOTH], ink=0.006, sub=0); hparts.append(t)
for sy in (1, -1):
    ey = ellipsoid(H(0.28, 0.165 * sy, 0.0), (0.14, 0.14, 0.145)); dress(ey, [EYE], ink=0.014, sub=0); hparts.append(ey)
    pu = ellipsoid(H(0.418, 0.15 * sy, -0.01), (0.012, 0.035, 0.035)); dress(pu, [PUPIL], ink=0, sub=0); hparts.append(pu)
for i in range(9):   # scraggly hair tufts
    a = rnd.uniform(-1.4, 1.4); r = rnd.uniform(0.15, 0.3)
    p = H(-0.05 + r * math.cos(a) * 0.6, r * math.sin(a), 0.36 + 0.05 * math.cos(a))
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.05, depth=rnd.uniform(0.16, 0.26), location=p, rotation=(rnd.uniform(-0.6, 0.6), rnd.uniform(-0.7, 0.1), 0))
    t = bpy.context.object; dress(t, [HAIR], ink=0.008, sub=0); hparts.append(t)
for x0, y0 in ((0.05, 0.25), (-0.15, -0.2)):   # stitched scars on the scalp
    for k in range(4):
        bpy.ops.mesh.primitive_cube_add(size=1, location=H(x0 + 0.04 * k, y0 - 0.02 * k, 0.4 - 0.03 * k - 0.02 * abs(y0)), rotation=(0, D(-30), D(20)))
        t = bpy.context.object; t.scale = (0.006, 0.05, 0.006); dress(t, [STITCH], ink=0, sub=0); hparts.append(t)

# head 10% smaller, shrunk toward the neck
piv = HC + Vector((-0.04, 0, -0.32))
for o in [head] + hparts:
    o.data.transform(o.matrix_basis); o.matrix_basis = Matrix.Identity(4)
    o.data.transform(Matrix.Translation(piv) @ Matrix.Scale(0.9, 4) @ Matrix.Translation(-piv))
# ---------- armature
arm = bpy.data.armatures.new('rig'); rig = link(bpy.data.objects.new('rig', arm)); activate(rig); bpy.ops.object.mode_set(mode='EDIT')
BONES = {}   # name -> (head point, tail point, parent)
BONES['spine'] = ('pelvis', 'waist', None); BONES['chest'] = ('waist', 'upchest', 'spine'); BONES['neck'] = ('upchest', 'headbase', 'chest')
BONES['head'] = ('headbase', None, 'neck')
for s in 'LR':
    BONES[f'clav{s}'] = ('upchest', f'shoulder{s}', 'chest'); BONES[f'shoulder{s}'] = (f'shoulder{s}', f'elbow{s}', f'clav{s}')
    BONES[f'elbow{s}'] = (f'elbow{s}', f'wrist{s}', f'shoulder{s}'); BONES[f'wrist{s}'] = (f'wrist{s}', f'palm{s}', f'elbow{s}')
    BONES[f'th0{s}'] = (f'th0{s}', f'th1{s}', f'wrist{s}'); BONES[f'th1{s}'] = (f'th1{s}', f'th2{s}', f'th0{s}')
    for k in range(4):
        BONES[f'f{k}a{s}'] = (f'f{k}a{s}', f'f{k}b{s}', f'wrist{s}'); BONES[f'f{k}b{s}'] = (f'f{k}b{s}', f'f{k}c{s}', f'f{k}a{s}'); BONES[f'f{k}c{s}'] = (f'f{k}c{s}', f'f{k}d{s}', f'f{k}b{s}')
    BONES[f'hip{s}'] = (f'hip{s}', f'knee{s}', 'spine'); BONES[f'knee{s}'] = (f'knee{s}', f'ankle{s}', f'hip{s}'); BONES[f'ankle{s}'] = (f'ankle{s}', f'toe{s}', f'knee{s}')
eb = {}
for n, (h, t, par) in BONES.items():
    b = arm.edit_bones.new(n); b.head = P[h]; b.tail = P[t] if t else Vector(P[h]) + Vector((0, 0, 0.4))
    if par: b.parent = eb[par]
    eb[n] = b
SEG = {n: (Vector(P[h]), Vector(P[t]) if t else Vector(P[h]) + Vector((0, 0, 0.4))) for n, (h, t, _) in BONES.items()}
bpy.ops.object.mode_set(mode='OBJECT')
def segdist(p, a, b):
    ab = b - a; t = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * t)).length, t
def skin_weights(o, allowed=None, sharp=6.0):
    """weights from distance to each bone segment: nearest bones share the vertex, falling off fast"""
    groups = {n: o.vertex_groups.new(name=n) for n in BONES}
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        ds = sorted((segdist(p, *SEG[n])[0], n) for n in (allowed or BONES))
        d0 = ds[0][0] + 1e-4; ws = [(n, (d0 / (d + 1e-4)) ** (sharp * 2)) for d, n in ds[:3]]
        tot = sum(w for _, w in ws)
        for n, w in ws:
            if w / tot > 0.02: groups[n].add([v.index], w / tot, 'REPLACE')
def rig_to(o, bone=None, allowed=None):
    if bone:
        g = o.vertex_groups.new(name=bone); g.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    else: skin_weights(o, allowed)
    m = o.modifiers.new('arm', 'ARMATURE'); m.object = rig
    while o.modifiers[0].name != 'arm': bpy.ops.object.modifier_move_up({'object': o} if False else None, modifier='arm') if False else o.modifiers.move(len(o.modifiers) - 1, 0)
    o.parent = rig
def label(o):
    """nearest bone for every vertex (used to cut clothes out of the body)"""
    L = []
    for v in o.data.vertices:
        p = o.matrix_world @ v.co; d, n = min((segdist(p, *SEG[n])[0], n) for n in BONES); L.append((n, segdist(p, *SEG[n])[1]))
    return L

# ---------- clothes: copied from the body surface by region, puffed out, hems torn
def garment(name, keep, push, mats, tear=0.05, drop_front=None):
    lab = label(body); bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
    gone = [v for v in bm.verts if not keep(*lab[v.index], v.co) or (drop_front and drop_front(v.co))]
    bmesh.ops.delete(bm, geom=gone, context='VERTS')
    bm.normal_update()
    for v in bm.verts: v.co += v.normal * push
    for v in bm.verts:   # ragged hem: boundary vertices pulled out and down by random amounts
        if v.is_boundary:
            v.co += v.normal * rnd.uniform(0, push * 0.8) + Vector((0, 0, -rnd.uniform(0, tear)))
    me2 = bpy.data.meshes.new(name); bm.to_mesh(me2); bm.free(); o = link(bpy.data.objects.new(name, me2))
    so = o.modifiers.new('thick', 'SOLIDIFY'); so.thickness = 0.012; so.offset = -1
    dress(o, mats, ink=0.012, sub=1); return o
cloth = []
if not CLAY:
    torso = ('spine', 'chest', 'clavL', 'clavR', 'neck')
    cloth.append(garment('shirt', lambda n, t, co: (n in torso and co.z > 0.86 and co.z < 1.36) or (n.startswith('shoulder') and t < 0.55), 0.022, [SHIRT], 0.06))
    cloth.append(garment('vest', lambda n, t, co: n in torso and co.z > 0.9 and co.z < 1.33, 0.05, [VEST], 0.05,
                         drop_front=lambda co: co.x > 0.08 and abs(co.y) < 0.06 + (co.z - 0.92) * 0.12))
    cloth.append(garment('pants', lambda n, t, co: (n == 'spine' and co.z < 0.94) or n.startswith('hip') or (n.startswith('knee') and t < 0.78), 0.024, [PANTS], 0.06))
    for sy in (1, -1):   # knee patches
        pa = ellipsoid((0.148, 0.14 * sy, 0.48), (0.012, 0.06, 0.065), rot=(0, D(-6), 0)); dress(pa, [PATCH], ink=0.008, sub=0); rig_to(pa, f'knee{"L" if sy > 0 else "R"}')
# shoes: chunky toe cap + heel + ankle cuff, fused
for s, sy in (('L', 1), ('R', -1)):
    sh = fuse([ellipsoid((0.12, 0.15 * sy, 0.07), (0.17, 0.11, 0.08)), ellipsoid((0.0, 0.14 * sy, 0.08), (0.1, 0.095, 0.08)),
               ellipsoid((0.0, 0.14 * sy, 0.15), (0.075, 0.075, 0.06))], 0.01)
    dec = sh.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.3; apply_mods(sh)
    dress(sh, [SHOE], ink=0.013, sub=0); rig_to(sh, f'ankle{s}')
    for k in range(4):   # claws on the finger tips
        a, b = SEG[f'f{k}c{s}']; d = (b - a).normalized()
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.022, depth=0.1, location=tuple(b + d * 0.035))
        c = bpy.context.object; c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); dress(c, [CLAW], ink=0.006, sub=0); rig_to(c, f'f{k}c{s}')
    a, b = SEG[f'th1{s}']; d = (b - a).normalized()
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.02, depth=0.085, location=tuple(b + d * 0.03)); c = bpy.context.object
    c.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); dress(c, [CLAW], ink=0.006, sub=0); rig_to(c, f'th1{s}')
dress(body, [SKIN], ink=0.013, sub=0); rig_to(body)
rig_to(head, 'head')
for o in hparts: rig_to(o, 'head')
for o in cloth: rig_to(o, allowed=[n for n in BONES if not n.startswith(('f', 'th'))])

# ---------- poses: bone -> (roll x, pitch y, yaw z) degrees in the parent's rest axes; pitch < 0 swings forward
BASE = {'spine': (0, 14, 0), 'chest': (0, 12, 0), 'neck': (0, -14, 0), 'head': (0, -10, 0),
        'shoulderL': (48, -45, 0), 'shoulderR': (-45, -40, 0), 'elbowL': (-15, -30, -25), 'elbowR': (15, -34, 25), 'wristL': (0, 40, 0), 'wristR': (0, 45, 0),
        'hipL': (0, -6, 0), 'hipR': (0, 10, 0), 'kneeL': (0, 14, 0), 'kneeR': (0, 10, 0), 'ankleL': (0, -6, 0), 'ankleR': (0, -16, 0)}
for s in 'LR':
    cs = -1 if s == 'L' else 1   # fingers hook toward the palm, which faces the body
    for k in range(4): BASE[f'f{k}a{s}'] = (22 * cs, 0, 0); BASE[f'f{k}b{s}'] = (30 * cs, 0, 0); BASE[f'f{k}c{s}'] = (28 * cs, 0, 0)
    BASE[f'th0{s}'] = (12 * cs, 0, 0); BASE[f'th1{s}'] = (20 * cs, 0, 0)
def walk(ph):
    s, c = math.sin(ph * 2 * math.pi), math.cos(ph * 2 * math.pi); up = lambda v: max(0, v)
    return {'hipL': (0, -24 * s, 0), 'hipR': (0, 24 * s, 0), 'kneeL': (0, 8 + 38 * up(c), 0), 'kneeR': (0, 8 + 38 * up(-c), 0),
            'ankleL': (0, -8 * s, 0), 'ankleR': (0, 8 * s, 0), 'spine': (5 * s, 14, 8 * s), 'chest': (-4 * s, 12, -6 * s),
            'shoulderL': (48, -45 + 10 * s, 0), 'shoulderR': (-45, -40 - 10 * s, 0), 'head': (7 * s, -10, 0)}, 0.035 * abs(c)
POSES = {'idle': ({}, 0)}
for i in range(4): POSES[f'walk{i}'] = walk(i / 4)
POSES['attack0'] = ({'chest': (0, 0, 0), 'shoulderL': (40, -140, 0), 'elbowL': (0, -45, 0), 'shoulderR': (-40, -130, 0), 'elbowR': (0, -40, 0), 'neck': (0, -22, 0)}, 0)
POSES['attack1'] = ({'chest': (0, 30, 0), 'shoulderL': (15, -75, 0), 'elbowL': (0, -10, 0), 'shoulderR': (-15, -60, 0), 'elbowR': (0, -5, 0), 'neck': (0, -5, 0)}, 0)
POSES['attack2'] = ({'chest': (0, 34, 0), 'shoulderL': (0, -25, 0), 'elbowL': (0, -5, 0), 'shoulderR': (0, -15, 0), 'elbowR': (0, 0, 0), 'neck': (0, 0, 0)}, 0)
POSES['hit'] = ({'chest': (0, -10, 0), 'neck': (0, 10, 0), 'head': (0, 14, 0), 'shoulderL': (55, -40, 0), 'shoulderR': (-55, -30, 0)}, 0)
if CLAY: POSES['tpose'] = ({**{k: (0, 0, 0) for k in BASE}}, 0)
def pose(name):
    p, bob = POSES[name]; spec = {**BASE, **p}
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        r = spec.get(pb.name, (0, 0, 0))
        R = Euler(tuple(D(a) for a in r), 'XYZ').to_matrix()
        M = pb.bone.matrix_local.to_3x3()
        pb.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()
    rig.location.z = -bob * 0.3
    bpy.context.view_layer.update()

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0.3
sun = link(bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))); sun.data.energy = 4; sun.data.use_shadow = False; sun.rotation_euler = (D(50), 0, D(-35))
cam = link(bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))); cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.9; sc.camera = cam
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = RES; sc.view_settings.view_transform = 'Standard'
c = Vector((0, 0, 1.1)); d = 20; pr = D(PITCH)
cam.location = c + Vector((0, -d * math.cos(pr), d * math.sin(pr))); cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
os.makedirs(out, exist_ok=True)
if os.environ.get('GLB'):
    rig.animation_data_create()
    for name in POSES:
        pose(name); act = bpy.data.actions.new(name); act.use_fake_user = True; rig.animation_data.action = act
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=1)
        tr = rig.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, act)
        if hasattr(st, 'action_slot') and len(getattr(act, 'slots', [])): st.action_slot = act.slots[0]   # Blender 5: a strip plays nothing without its slot
        rig.animation_data.action = None
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(os.environ['GLB']), export_format='GLB' if os.environ['GLB'].endswith('.glb') else 'GLTF_EMBEDDED', export_apply=True, export_animations=True,
                              export_animation_mode='NLA_TRACKS', export_skins=True, export_yup=True, export_materials='EXPORT', export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7)
    print('glb written'); sys.exit(0)
if os.environ.get('SAVE'): bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.environ['SAVE']))
for job in jobs:
    name, _, yaw = job.partition('@'); yaw = float(yaw or 0)
    pose(name); rig.rotation_euler = (0, 0, D(235 + yaw))
    if os.environ.get('FOCUS'):
        bpy.context.view_layer.update(); f = rig.matrix_world @ rig.pose.bones[os.environ['FOCUS']].head
        cam.data.ortho_scale = float(os.environ.get('ORTHO', 0.7)); cam.location = f + Vector((0, -d * math.cos(pr), d * math.sin(pr)))
    sc.render.filepath = f'{out}/z_{name}_{int(yaw)}.png'; bpy.ops.render.render(write_still=True)
print('done')
