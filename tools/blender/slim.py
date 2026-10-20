import bpy, sys, os
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(sys.argv[1]))
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = float(sys.argv[3])
for im in bpy.data.images:
    if im.size[0] > 1024: im.scale(1024, 1024)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(sys.argv[2]), export_format='GLB', export_apply=True, export_image_format='JPEG', export_jpeg_quality=88)
print('ok')
