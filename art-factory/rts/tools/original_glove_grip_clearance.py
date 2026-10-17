"""Conservative separating-face clearance for triangle/convex contact."""
import numpy as np
def triangle_clearance(points,faces,planes):
    distances=np.asarray(points)@planes[:,:3].T+planes[:,3]
    # At least one outward supporting plane must separate ALL three vertices.
    # Positive proves the whole triangle is outside the convex polyhedron.
    # Negative is conservative: edge/edge separation is deliberately not used.
    return distances[np.asarray(faces)].min(axis=1).max(axis=1)
