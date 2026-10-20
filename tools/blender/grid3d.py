"""Orthographic front (looking +Y) and side (looking -X... from +X) views of a model with a coordinate grid, for placing joints."""
import bpy, math, sys, os
from mathutils import Vector
src, out = sys.argv[1], sys.argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.abspath(src))
for m in bpy.data.materials:
    if not m.node_tree: continue
    N = m.node_tree.nodes; L = m.node_tree.links; b = next((n for n in N if n.type == 'BSDF_PRINCIPLED'), None); o = next((n for n in N if n.type == 'OUTPUT_MATERIAL'), None)
    if b and o:
        e = N.new('ShaderNodeEmission'); bc = b.inputs['Base Color']
        if bc.links: L.new(bc.links[0].from_socket, e.inputs[0])
        e.inputs[1].default_value = 1.6; L.new(e.outputs[0], o.inputs[0])
w = bpy.data.worlds.new('w'); sc.world = w
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.1; sc.collection.objects.link(cam); sc.camera = cam
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 1100; sc.view_settings.view_transform = 'Standard'
for name, loc, rot in (('front', (0, -10, 0), (math.pi / 2, 0, 0)), ('side', (10, 0, 0), (math.pi / 2, 0, math.pi / 2))):
    cam.location = loc; cam.rotation_euler = rot; sc.render.filepath = f'{out}_{name}.png'; bpy.ops.render.render(write_still=True)
print('done')
