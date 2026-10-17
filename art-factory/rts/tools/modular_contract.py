"""Versioned, engine-independent contracts for original RTS prefab assembly."""
import hashlib
from pathlib import Path
import numpy as np

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def projected_uv(position,normal):
    nx,ny,nz=map(abs,normal)
    axes=(0,1) if nz>=max(nx,ny) else ((1,2) if nx>ny else (0,2))
    return [position[axes[0]]*.5,position[axes[1]]*.5]

def safe_path(root,relative):
    path=Path(relative)
    if path.is_absolute() or path.drive:raise ValueError('Expected factory-relative path')
    root=Path(root).resolve();target=(root/path).resolve()
    if not target.is_relative_to(root):raise ValueError('Path escapes factory root')
    return target

def verify_sources(root,entries):
    for entry in entries:
        path=safe_path(root,entry['path'])
        if not path.is_file() or sha(path)!=entry['sha256']:raise ValueError('Source lock mismatch: '+entry['path'])

def rigid_matrix(values):
    try:m=np.asarray(values,dtype=float).reshape((4,4))
    except (ValueError,TypeError):raise ValueError('Expected 4x4 matrix') from None
    if not np.isfinite(m).all() or not np.allclose(m[3],[0,0,0,1],atol=1e-7):raise ValueError('Invalid affine matrix')
    if not np.allclose(m[:3,:3].T@m[:3,:3],np.eye(3),atol=1e-5) or not np.isclose(np.linalg.det(m[:3,:3]),1,atol=1e-5):raise ValueError('Parts require rotation/translation only; bake a dimensioned variant')
    return m

def unique_by_id(rows,label):
    result={}
    for row in rows:
        ident=row.get('id')
        if not isinstance(ident,str) or not ident or ident in result:raise ValueError('Invalid/duplicate '+label)
        result[ident]=row
    return result

def resolve_recipe(recipe,parts):
    if recipe.get('version')!=1:raise ValueError('Unsupported recipe version')
    footprint=recipe.get('footprint',[])
    if len(footprint)!=2 or any(not isinstance(n,(int,float)) or not np.isfinite(n) or n<=0 for n in footprint):raise ValueError('Invalid navigation footprint')
    instances=unique_by_id(recipe.get('instances',[]),'instance');sockets=unique_by_id(recipe.get('sockets',[]),'socket')
    for socket in sockets.values():
        if socket.get('host') not in instances:raise ValueError('Missing socket host')
        actual=rigid_matrix(socket['matrix']);host=parts.get(instances[socket['host']].get('part'),{})
        registered=host.get('sockets',{}).get(socket['id'])
        if not registered or registered.get('interface')!=socket.get('interface'):raise ValueError('Missing registered host opening')
        expected=rigid_matrix(registered['matrix']);tolerance=registered.get('toleranceMeters',.00002)
        if not np.isfinite(tolerance) or tolerance<=0 or tolerance>.0001:raise ValueError('Invalid socket tolerance')
        if np.linalg.norm(actual[:3,3]-expected[:3,3])>tolerance or not np.allclose(actual[:3,:3],expected[:3,:3],atol=1e-6,rtol=0):raise ValueError('Socket differs from registered host opening')
    result={};visiting=set()
    def resolve(ident):
        if ident in result:return result[ident]
        if ident in visiting:raise ValueError('Cyclic socket graph')
        visiting.add(ident);item=instances[ident];part=parts.get(item.get('part'))
        if not part or not part.get('collection'):raise ValueError('Missing part '+str(item.get('part')))
        mount=rigid_matrix(part['mount'])
        if 'socket' in item:
            if 'matrix' in item:raise ValueError('Socket placement cannot also specify matrix')
            socket=sockets.get(item['socket'])
            if not socket or socket.get('interface')!=part.get('interface'):raise ValueError('Incompatible attachment socket')
            parent=np.array(resolve(socket['host'])['matrix']).reshape((4,4))
            matrix=parent@rigid_matrix(socket['matrix'])@np.linalg.inv(mount)
        else:matrix=rigid_matrix(item.get('matrix',[]))
        result[ident]={'id':ident,'part':item['part'],'collection':part['collection'],'matrix':matrix.flatten().tolist()}
        visiting.remove(ident);return result[ident]
    return [resolve(ident) for ident in instances]
