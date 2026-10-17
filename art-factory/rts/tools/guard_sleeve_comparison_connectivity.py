"""Classify sampled background connectivity without assuming topology."""
from collections import deque
def exterior_connected(misses,roi,step):
    connected={p for p in misses if p[0] in (roi[0],roi[2]) or p[1] in (roi[1],roi[3])}
    queue=deque(connected)
    while queue:
        x,y=queue.popleft()
        for point in [(x-step,y),(x+step,y),(x,y-step),(x,y+step)]:
            if point in misses and point not in connected:connected.add(point);queue.append(point)
    return connected
