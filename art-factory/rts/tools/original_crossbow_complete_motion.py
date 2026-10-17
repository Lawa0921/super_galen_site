"""Original 40-frame shot/load control, authored for the existing 24 fps rig."""
DURATION_FRAMES=40
RELEASE_FRAME=12

def smooth(value):
    t=max(0.,min(1.,value));return t*t*(3-2*t)

def mechanism(frame):
    f=max(0.,min(DURATION_FRAMES,float(frame)))
    draw=1-smooth((f-RELEASE_FRAME)/.5) if f<22 else smooth((f-24)/5)
    visible=1. if f<=RELEASE_FRAME else 0. if f<32 else 1.
    on_rail=1. if f<=RELEASE_FRAME or f>=36 else 0.
    return {'draw':draw,'bolt_visible':visible,'bolt_on_rail':on_rail}

def finger_opening(f):
    keys={20:0.,22:1.,24:.35,29:.35,30:.8,32:.45,36:.45,38:0.,40:0.}
    f=max(20.,min(40.,float(f)));lo=max(k for k in keys if k<=f);hi=min(k for k in keys if k>=f)
    return keys[lo] if lo==hi else keys[lo]+(keys[hi]-keys[lo])*smooth((f-lo)/(hi-lo))
