import {Vector3} from 'three';
export class TwoSphereReach {
 private readonly projected = new Vector3();
 private readonly axis = new Vector3();
 private readonly center = new Vector3();
 private readonly radial = new Vector3();
 /** Nearest point in the intersection of two closed balls. False is atomic.
  * Reach radii must already include the caller's bend/singularity margin.
  */
 project(point:Vector3,a:Vector3,ra:number,b:Vector3,rb:number,out:Vector3){
  if (![point.lengthSq(),a.lengthSq(),b.lengthSq(),ra,rb].every(Number.isFinite) || ra<=0 || rb<=0) throw new Error('Invalid reach spheres');
  const da=point.distanceTo(a),db=point.distanceTo(b),distance=a.distanceTo(b);
  if(distance>ra+rb)return false;
  if(da<=ra&&db<=rb){out.copy(point);return true;}
  if(da>ra){this.projected.copy(point).sub(a).multiplyScalar(ra/da).add(a);if(this.projected.distanceTo(b)<=rb){out.copy(this.projected);return true;}}
  if(db>rb){this.projected.copy(point).sub(b).multiplyScalar(rb/db).add(b);if(this.projected.distanceTo(a)<=ra){out.copy(this.projected);return true;}}
  // When neither individual projection is feasible, both surfaces are active.
  // Nested/coincident balls were handled above by the smaller-ball projection.
  if(distance<1e-12 || distance<Math.abs(ra-rb))return false;
  this.axis.copy(b).sub(a).multiplyScalar(1/distance);
  const along=(ra*ra-rb*rb+distance*distance)/(2*distance),radius=Math.sqrt(Math.max(0,ra*ra-along*along));
  this.center.copy(a).addScaledVector(this.axis,along);
  this.radial.copy(point).sub(this.center);this.radial.addScaledVector(this.axis,-this.radial.dot(this.axis));
  if(this.radial.lengthSq()<1e-20){
   this.radial.set(Math.abs(this.axis.x)<.9?1:0,Math.abs(this.axis.x)<.9?0:1,0);
   this.radial.addScaledVector(this.axis,-this.radial.dot(this.axis));
  }
  out.copy(this.center).addScaledVector(this.radial.normalize(),radius);return true;
 }
}
