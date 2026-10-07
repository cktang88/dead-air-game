"""Builds a posed Quaternius man holding a Quaternius gun and renders 8 yaws with the DEAD AIR 2.5D camera.
usage: python -I posed.py <pose-name|all> [res] [samples]
Writes out/ref_<pose>_<deg>.png (RGBA, already y-stretched) and out/ref_<pose>.json (projected joints, game units, y down, origin = body centre at anchor height)."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dalib import *
from poses import POSES, GUNFILES

S_P = 12.0      # game units per Blender unit in plan (shoulder joint width 0.92 BU -> 11 units; ours is 14.8)
S_Z = 5.0       # game units per Blender unit of height (4.8 BU man -> 24 unit actor)
Z0 = 9.4 / S_Z  # anchor plane height in BU
PHI = math.atan(0.72 * S_Z / S_P)
SC_RES = 512
CELL_UNITS = 56.0

def v3(a): return Vector(a)

def build(pose, yaw_deg, res, samples):
    sc = reset()
    co = setup_render(sc, res, samples, CELL_UNITS / S_P)
    # camera: tilt PHI, looking at (0,0,Z0)
    d = 60.0
    co.rotation_euler = (PHI, 0, 0)
    co.location = Vector((0, 0, Z0)) + Vector((0, -d * math.sin(PHI), d * math.cos(PHI)))
    root = bpy.data.objects.new('root', None); sc.collection.objects.link(root)
    arm, mesh = import_char(sc)
    arm.animation_data_clear()
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    # simple colours
    cols = {'Skin': (0.60, 0.40, 0.28), 'Eyes': (0.02, 0.02, 0.02), 'Hair': (0.05, 0.04, 0.04), 'Shirt': pose.get('shirt', (0.22, 0.34, 0.40)), 'Pants': (0.11, 0.13, 0.17), 'Socks': (0.2, 0.2, 0.22), 'Shoes': (0.05, 0.05, 0.06)}
    for i, m in enumerate(mesh.data.materials):
        nm = bpy.data.materials.new('m_' + m.name); nm.use_nodes = True
        b = nm.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*cols.get(m.name, (0.3, 0.3, 0.3)), 1); b.inputs['Roughness'].default_value = 0.9
        mesh.data.materials[i] = nm
    arm.parent = root
    arm.rotation_euler.z = math.radians(90)
    bpy.context.view_layer.update()
    hips = arm.matrix_world @ arm.pose.bones['Hips'].head
    arm.location = Vector((-hips.x, -hips.y, 0))
    bpy.context.view_layer.update()

    def bone_world(name, tail=False):
        b = arm.pose.bones[name]; return arm.matrix_world @ (b.tail if tail else b.head)
    def twist(name, ang, about=None):
        """rotate a pose bone about the world vertical through its head (or `about`), ang radians CCW seen from above"""
        bpy.context.view_layer.update()
        pb = arm.pose.bones[name]
        h = about if about is not None else (arm.matrix_world @ pb.head)
        M = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Translation(-h)
        pb.matrix = arm.matrix_world.inverted() @ M @ arm.matrix_world @ pb.matrix
        bpy.context.view_layer.update()

    blade = math.radians(pose.get('blade', 0))     # chest turns right of the aim (CW seen from above) -> negative Blender angle
    twist('Abdomen', -blade)
    head_turn = pose.get('head_turn', 0.85)
    twist('Neck', blade * head_turn)
    if pose.get('hips', 0): twist('Hips', -blade * pose['hips'])
    bpy.context.view_layer.update()
    # feet: stagger (right foot back) and open stance
    st = pose.get('stance', {})
    for nm, (dx, dy) in {'Foot.R': st.get('R', (0, 0)), 'Foot.L': st.get('L', (0, 0))}.items():
        pb = arm.pose.bones[nm]
        pb.matrix = pb.matrix @ Matrix.Translation(pb.matrix.inverted().to_3x3() @ arm.matrix_world.inverted().to_3x3() @ Vector((dx, dy, 0)))
    bpy.context.view_layer.update()

    shR = bone_world('UpperArm.R'); shL = bone_world('UpperArm.L')
    fwd_t = Vector((math.cos(-blade), math.sin(-blade), 0)); left_t = Vector((-fwd_t.y, fwd_t.x, 0))   # torso frame
    G = pose['gun']
    gf = GUNFILES[G['model']]
    # ---- gun
    gmeshes, extras = load_gun_mesh(gf)
    gun = bpy.data.objects.new('gun', None); sc.collection.objects.link(gun); gun.parent = root
    for o in gmeshes:
        o.data.transform(o.matrix_world); o.parent = None; o.matrix_world = Matrix.Identity(4)
        o.data.transform(Matrix.Rotation(math.radians(gf.get('rotz', 0)), 4, 'Z'))
        if gf.get('rotx'): o.data.transform(Matrix.Rotation(math.radians(gf['rotx']), 4, 'X'))
    for o in extras:
        if o.type == 'ARMATURE': bpy.data.objects.remove(o)
    lo, hi = world_bbox(gmeshes)
    L0 = hi[0] - lo[0]; Lg = G['len']; k = Lg / L0
    axz = lo[2] + (hi[2] - lo[2]) * gf.get('axis', 0.6)
    for o in gmeshes:
        o.data.transform(Matrix.Translation((-lo[0], -(lo[1] + hi[1]) / 2, -axz))); o.data.transform(Matrix.Scale(k, 4))
        o.parent = gun
        gm = bpy.data.materials.new('gm'); gm.use_nodes = True
        b = gm.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.13, 0.14, 0.17, 1); b.inputs['Roughness'].default_value = 0.6
        o.data.materials.clear(); o.data.materials.append(gm)
    # ---- gun frame placement (aim = +X)
    aimpt = Vector((60, 0, 0))
    if G['mount'] == 'shoulder':
        B = shR + fwd_t * G.get('bx', 0.20) + left_t * G.get('by', 0.20)
        B.z = shR.z + G.get('bz', -0.28)
        tgt = Vector((aimpt.x, G.get('tgt_y', 0), B.z + G.get('pitch_z', 0)))
        gx = (tgt - B).normalized()
        gorg = B
    else:   # extended in front (pistol): centred on the aim line, arms out
        gorg = Vector((G.get('x0', 1.15), G.get('y0', -0.05), shR.z + G.get('bz', -0.1)))
        gx = Vector((1, 0, 0))
    gz0 = Vector((0, 0, 1)); gy = gz0.cross(gx).normalized(); gz = gx.cross(gy).normalized()
    Mg = Matrix(((gx.x, gy.x, gz.x, gorg.x), (gx.y, gy.y, gz.y, gorg.y), (gx.z, gy.z, gz.z, gorg.z), (0, 0, 0, 1)))
    gun.matrix_world = Mg
    def gp(p): return Mg @ Vector((p[0] * Lg, p[1], p[2]))     # gun point: x as fraction of length, y,z in BU
    tH = gp(G['trig']); sH = gp(G['sup'])
    # ---- arms: IK to hand targets (wrist target is back along the forearm from the grip centre)
    def ik(side, grip, pole_off):
        sh = shR if side == 'R' else shL
        fdir = (grip - sh).normalized()
        wrist = grip - fdir * 0.27
        e = bpy.data.objects.new('ikt' + side, None); sc.collection.objects.link(e); e.parent = None; e.location = wrist
        mid = (sh + wrist) / 2
        pole = bpy.data.objects.new('pole' + side, None); sc.collection.objects.link(pole)
        pole.location = mid + left_t * pole_off[0] + fwd_t * pole_off[1] + Vector((0, 0, pole_off[2]))
        pb = arm.pose.bones['LowerArm.' + side]
        c = pb.constraints.new('IK'); c.target = e; c.chain_count = 2; c.pole_target = pole; c.use_tail = True
        best = None
        for ang in (0, 90, 180, -90):
            c.pole_angle = math.radians(ang); bpy.context.view_layer.update()
            el = bone_world('LowerArm.' + side); err = (el - pole.location).length
            if best is None or err < best[0]: best = (err, ang)
        c.pole_angle = math.radians(best[1]); bpy.context.view_layer.update()
        e.parent = root; pole.parent = root
        return e, pole
    ik('R', tH, G.get('poleR', (-0.9, -0.1, -0.9)))
    ik('L', sH, G.get('poleL', (0.5, -0.2, -1.1)))
    bpy.context.view_layer.update()
    # hands: orient palms along the forearm already (IK); done
    # ---- gather joints (before rotating the root)
    J = {}
    def addj(n, w): J[n] = [round(w.x, 4), round(w.y, 4), round(w.z, 4)]
    for n in ('R', 'L'):
        addj('shoulder' + n, bone_world('UpperArm.' + n)); addj('elbow' + n, bone_world('LowerArm.' + n)); addj('wrist' + n, bone_world('Palm.' + n))
    addj('head', (bone_world('Head') + bone_world('Head', True)) / 2); addj('chest', (bone_world('Torso') + bone_world('Torso', True)) / 2)
    addj('hips', bone_world('Hips')); addj('gunRear', Mg @ Vector((0, 0, 0))); addj('gunMuzzle', Mg @ Vector((Lg, 0, 0)))
    addj('trig', tH); addj('sup', sH)
    addj('footL', bone_world('Foot.L')); addj('footR', bone_world('Foot.R'))
    # ---- render each yaw (game yaw theta clockwise on screen == Blender root rotation -theta)
    res_files = []; PROJ = {}
    for deg in yaw_deg:
        root.rotation_euler.z = -math.radians(deg)
        bpy.context.view_layer.update()
        path = OUT + 'raw_%s_%03d.png' % (pose['name'], deg)
        sc.render.filepath = path; bpy.ops.render.render(write_still=True)
        res_files.append(path)
        # projected joints for this yaw in game units: x right, y down, relative to the anchor point
        Rz = Matrix.Rotation(-math.radians(deg), 3, 'Z')
        pj = {}
        for n, w in J.items():
            p = Rz @ Vector(w)
            pj[n] = [round(p.x * S_P, 2), round(-p.y * S_P - 0.72 * S_Z * (p.z - Z0), 2)]
        PROJ[str(deg)] = pj
    J['_proj'] = PROJ
    return J, res_files

if __name__ == '__main__':
    from PIL import Image
    which = sys.argv[1]; res = int(sys.argv[2]) if len(sys.argv) > 2 else 384; samples = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    yaws = [int(v) for v in sys.argv[4].split(',')] if len(sys.argv) > 4 else [i * 45 for i in range(8)]
    names = list(POSES) if which == 'all' else which.split(',')
    for n in names:
        p = dict(POSES[n]); p['name'] = n
        J, files = build(p, yaws, res, samples)
        proj = J.pop('_proj')
        json.dump({'pose': n, 'S_P': S_P, 'S_Z': S_Z, 'cell_units': CELL_UNITS, 'res': res, 'joints3d': J, 'proj': proj}, open(OUT + 'ref_%s.json' % n, 'w'))
        for deg, f in zip(yaws, files):
            im = Image.open(f).convert('RGBA'); w, h = im.size
            im = im.resize((w, round(h / math.cos(PHI))), Image.BICUBIC)   # undo the vertical foreshortening of the tilted camera
            top = (im.size[1] - h) // 2
            im = im.crop((0, top, w, top + h)); im.save(OUT + 'ref_%s_%03d.png' % (n, deg)); os.remove(f)
        print('done', n, flush=True)
