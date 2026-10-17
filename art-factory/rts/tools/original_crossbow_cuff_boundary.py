"""Read actual topological sleeve boundaries instead of historical witness points."""
from collections import defaultdict

def complete_boundary(mesh,seeds,require_closed=True):
    counts=defaultdict(int)
    for polygon in mesh.polygons:
        for edge in polygon.edge_keys:counts[tuple(sorted(edge))]+=1
    graph=defaultdict(set)
    for (i,j),count in counts.items():
        if count==1:graph[i].add(j);graph[j].add(i)
    remaining=set(seeds);components=[]
    while remaining:
        start=min(remaining)
        assert start in graph,('Historical wrist witness is not a boundary vertex',start)
        pending=[start];visited=set()
        while pending:
            index=pending.pop()
            if index in visited:continue
            visited.add(index);pending.extend(graph[index]-visited)
        if require_closed:assert all(len(graph[i])==2 for i in visited),'Cuff boundary branches or is open'
        components.append(visited);remaining-=visited
    vertices=set().union(*components)
    edges=[(i,j) for i in vertices for j in graph[i] if i<j]
    return vertices,edges,components
