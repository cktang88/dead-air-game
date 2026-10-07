import bpy, math, os, json
from mathutils import Vector, Matrix, Euler, Quaternion

Q = os.environ.get("QUATERNIUS_DIR", "refs/dl/FreeModels by Quaternius[Patreon]") + "/"   # CC0 packs, see README.md
OUT = os.environ.get("REFS_OUT", "refs/out") + "/"
os.makedirs(OUT, exist_ok=True)
CHAR = "Characters and Animals/Animated Men Characters - Feb 2019/FBX/Male_Casual.fbx"
TILT = math.atan(0.72)   # STACK_TILT: screen lift per unit of height / ground foreshortening 1 -> 35.8 deg from vertical, looking from the south
LIGHT = (0.62, 0.78)     # sprites2d.js LIGHT: light comes from the upper-left of the screen (shadows fall toward +x,+y)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    return bpy.context.scene


def setup_render(sc, res=512, samples=24, ortho=12.0):
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.62, 0.66, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    sc.world = w
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = ortho; cam.clip_start = 0.1; cam.clip_end = 200
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    # camera looks from the south, TILT off vertical: rotation x = TILT (looking down, up vector toward +y)
    d = 60.0
    co.rotation_euler = (TILT, 0, 0)
    co.location = (0, -d * math.sin(TILT), d * math.cos(TILT))
    # light from upper-left of the screen: screen up = +Y world, screen left = -X; light comes from (-x, +y) and above
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.2; sun.angle = math.radians(25)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    lv = Vector((-LIGHT[0], LIGHT[1], 1.15)).normalized()   # direction TO the light
    so.rotation_euler = lv.to_track_quat('Z', 'Y').to_euler()
    return co


def import_char(sc):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=Q + CHAR)
    new = [o for o in bpy.data.objects if o not in before]
    arm = [o for o in new if o.type == 'ARMATURE'][0]
    mesh = [o for o in new if o.type == 'MESH'][0]
    return arm, mesh


def mat_color(o):
    return [(m.name, tuple(round(c, 2) for c in m.diffuse_color)) for m in o.data.materials]


def load_gun_mesh(spec):
    """spec: {'file': rel path, 'objs': optional names} -> joined mesh object at its natural placement"""
    before = set(bpy.data.objects)
    rel = spec['file']
    if rel.endswith('.blend'):
        with bpy.data.libraries.load(Q + rel, link=False) as (src, dst):
            dst.objects = [n for n in src.objects if not spec.get('objs') or n in spec['objs']]
        for o in dst.objects:
            if o is not None: bpy.context.scene.collection.objects.link(o)
    else:
        bpy.ops.import_scene.fbx(filepath=Q + rel)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type != 'MESH': o.hide_render = True
    meshes = [o for o in new if o.type == 'MESH']
    return meshes, [o for o in new if o.type != 'MESH']


def world_bbox(objs):
    vs = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = [min(v[k] for v in vs) for k in range(3)]; hi = [max(v[k] for v in vs) for k in range(3)]
    return lo, hi
