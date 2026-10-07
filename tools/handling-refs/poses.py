AF = "FPS/Animated FPS Guns - Jun 2018/FBX/"
GP = "FPS/Gun Pack Vol.1 - Apr 2016/Blends/"
GUNFILES = {
    'pistol': {'file': AF + 'Pistol.fbx', 'rotz': 0, 'axis': 0.78},
    'p90': {'file': AF + 'P90.fbx', 'rotz': -90, 'axis': 0.62},
    'shotgun': {'file': AF + 'Shotgun.fbx', 'rotz': -90, 'axis': 0.8},
    'rifle': {'file': AF + 'Rifle.fbx', 'rotz': -90, 'axis': 0.8},
    'sniper': {'file': AF + 'SniperRifle.fbx', 'rotz': -90, 'axis': 0.7},
    'rpg': {'file': GP + 'RocketLauncher.blend', 'rotz': 180, 'axis': 0.5},
    'ak': {'file': GP + 'ak47.blend', 'rotz': 0, 'axis': 0.75},
}
STAG = {'R': (-0.28, -0.05), 'L': (0.3, 0.08)}   # right foot back, left forward (shooter frame offsets before the torso twist; world axes)
POSES = {
    'pistol': {'blade': 0, 'head_turn': 1.0,
               'gun': {'model': 'pistol', 'mount': 'front', 'len': 0.58, 'x0': 1.15, 'y0': -0.04, 'bz': -0.12, 'trig': (0.30, 0.0, -0.16), 'sup': (0.34, 0.06, -0.2),
                       'poleR': (-0.7, 0, -0.8), 'poleL': (0.7, 0, -0.8)}},
    'smg': {'blade': 18,
            'gun': {'model': 'p90', 'mount': 'shoulder', 'len': 1.5, 'bx': 0.45, 'by': 0.22, 'bz': -0.40, 'trig': (0.50, 0.0, -0.40), 'sup': (0.80, 0.0, -0.32)}},
    'rifle': {'blade': 32,
              'gun': {'model': 'rifle', 'mount': 'shoulder', 'len': 2.6, 'trig': (0.40, 0.0, -0.32), 'sup': (0.66, 0.0, -0.24)}},
    'shotgun': {'blade': 28,
                'gun': {'model': 'shotgun', 'mount': 'shoulder', 'len': 2.7, 'trig': (0.34, 0.0, -0.32), 'sup': (0.68, 0.0, -0.22)}},
    'sniper': {'blade': 38,
               'gun': {'model': 'sniper', 'mount': 'shoulder', 'len': 3.2, 'trig': (0.37, 0.0, -0.34), 'sup': (0.54, 0.0, -0.3)}},
    'launcher': {'blade': 36,
                 'gun': {'model': 'rpg', 'mount': 'shoulder', 'len': 2.6, 'bx': 0.1, 'by': 0.1, 'bz': 0.15, 'trig': (0.45, 0.0, -0.42), 'sup': (0.66, 0.0, -0.38)}},
}

import copy
def _v(base, name, **kw):
    d = copy.deepcopy(POSES[base]); g = d['gun']
    for k, v in kw.items():
        if k in ('blade', 'head_turn'): d[k] = v
        else: g[k] = v
    POSES[name] = d
# sprint low-ready: squared up, muzzle dipped and canted toward the support side, stock still at the shoulder
_v('rifle', 'rifle_sprint', blade=6, bz=-0.62, tgt_y=20, pitch_z=-26, bx=0.08, by=0.28, trig=(0.40, 0.0, -0.32), sup=(0.64, 0.0, -0.26))
_v('pistol', 'pistol_sprint', blade=0, x0=0.55, y0=-0.5, bz=-0.7, trig=(0.30, 0.0, -0.16), sup=(0.34, 0.06, -0.2))
# reload: gun canted toward the actor's right, support hand down at the magwell (below the receiver, ahead of the grip)
_v('rifle', 'rifle_reload', blade=34, tgt_y=-18, pitch_z=-6, trig=(0.40, 0.0, -0.32), sup=(0.36, 0.0, -0.78))
_v('sniper', 'amr', blade=42, len=3.8, trig=(0.36, 0.0, -0.36), sup=(0.50, 0.0, -0.34), bx=0.24, by=0.18)
