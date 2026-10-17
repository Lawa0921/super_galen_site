"""Dimensioned courtyard kit placements; authored in metres, front is -Y."""


def layout(asset):
    sizes = {'barracks': (6., 6.), 'stable': (7., 6.), 'workshop': (7., 6.)}
    if asset not in sizes:
        raise ValueError('Unreviewed courtyard: ' + asset)
    w, d = sizes[asset]
    pieces = []
    def put(part, x, y, width, depth, **extra):
        pieces.append(dict(part=part, x=x, y=y, width=width, depth=depth, **extra))
    # One metre curb sections abut fixed corner stones; the front entry is open.
    for i in range(int(w)-1):
        x = -w/2 + 1 + i
        put('dressed-edge-1m', x, d/2-.17, 1., .24, angle=0)
        if abs(x) > 1.5:
            put('dressed-edge-1m', x, -d/2+.17, 1., .24, angle=0)
    for i in range(int(d)-1):
        y = -d/2 + 1 + i
        for side in (-1, 1):
            put('dressed-edge-1m', side*(w/2-.17), y, .24, 1., angle=90)
    for x in (-w/2+.27, w/2-.27):
        for y in (-d/2+.27, d/2-.27):
            put('dressed-corner', x, y, .46, .46, angle=0)
    shoulder=.3 if w==6 else .8
    for side in (-1,1):
        put('entry-shoulder-'+('short' if w==6 else 'long'),side*(1.2+shoulder/2),-d/2+.17,shoulder,.24,angle=0)
    # Three original profiled entrance treads, with ascending tops toward the yard.
    for i in range(3):
        put('entry-step', 0., -d/2+.22+i*.28, 2.4, .28,
            angle=0, level=i, z_top=.18+i*.16)
    return dict(footprint=[w, d], earth=dict(width=w-.08, depth=d-.08, z_top=.50),
                pieces=pieces, stone_surface_area=sum(p['width']*p['depth'] for p in pieces))
