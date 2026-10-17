"""Correct original open pitched panels, retaining explicit corner provenance."""


def oriented_roof_faces(vertices, faces, paired_drip):
    if paired_drip and len(faces)%2:
        raise ValueError('Shingles require one exposed face and one drip face')
    result=[];corners=[];flip=False
    for i,face in enumerate(faces):
        if not paired_drip or i%2==0:
            a,b,c=[vertices[j] for j in face[:3]]
            nz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
            if abs(nz)<1e-10:raise ValueError('Expected a sloped roof surface')
            flip=nz<0
        order=list(reversed(range(len(face)))) if flip else list(range(len(face)))
        result.append(tuple(face[j] for j in order));corners.append(order)
    return result,corners
