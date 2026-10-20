"""Import a GLB and render it from several yaws at the game pitch, lit softly so its own painted texture shows.
usage: python look3d.py in.glb out_dir yaw..."""
import bpy, math, sys, os
from mathutils import Vector
src, out = sys.argv[1], sys.argv[2]; yaws = [float(a) for a in sys.argv[3:]]
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.abspath(src))
objs = [o for o in sc.objects if o.type == 'MESH']
if os.environ.get('FLAT', '1') == '1':   # show the painted texture as is: base colour straight to an emission shader
    for m in bpy.data.materials:
        if not m.node_tree: continue
        N = m.node_tree.nodes; L = m.node_tree.links; bsdf = next((n for n in N if n.type == 'BSDF_PRINCIPLED'), None); outn = next((n for n in N if n.type == 'OUTPUT_MATERIAL'), None)
        if not bsdf or not outn: continue
        em = N.new('ShaderNodeEmission'); bc = bsdf.inputs['Base Color']
        if bc.links: L.new(bc.links[0].from_socket, em.inputs[0])
        else: em.inputs[0].default_value = bc.default_value
        L.new(em.outputs[0], outn.inputs[0])
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
print('bounds', [round(v, 3) for v in lo], [round(v, 3) for v in hi], 'faces', sum(len(o.data.polygons) for o in objs))
piv = bpy.data.objects.new('piv', None); sc.collection.objects.link(piv); piv.location = (lo + hi) / 2
for o in sc.objects:
    if o.parent is None and o is not piv: o.parent = piv; o.matrix_parent_inverse = piv.matrix_world.inverted()
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 1.6
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 2; sun.rotation_euler = (math.radians(50), 0, math.radians(-35)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(hi - lo) * 1.25; sc.collection.objects.link(cam); sc.camera = cam
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 640; sc.view_settings.view_transform = 'Standard'
c = (lo + hi) / 2; pitch = math.radians(float(os.environ.get('PITCH', 20))); d = 20
os.makedirs(out, exist_ok=True)
for y in yaws:
    piv.rotation_euler = (0, 0, math.radians(y))
    cam.location = c + Vector((0, -d * math.cos(pitch), d * math.sin(pitch))); cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}/y{int(y)}.png'; bpy.ops.render.render(write_still=True)
print('done')
