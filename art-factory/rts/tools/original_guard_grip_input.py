"""Deterministic original concept crop for one bounded neural hand-shape trial."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion,label

ROOT=Path(__file__).resolve().parents[3]
RAW=ROOT/'art-factory/rts/runs/original-guard-grip-study/2026-10-05/raw/right-grip-three-views.png'
RUN=ROOT/'art-factory/rts/runs/original-guard-right-grip-shape/2026-10-05'


def main():
    assert hashlib.sha256(RAW.read_bytes()).hexdigest()=='8e0132433b5599c8361ba23cd6632376743f62e94b33ff3b23896f821ac066cc'
    crop=(650,50,1140,810)
    a=np.asarray(Image.open(RAW).convert('RGB').crop(crop)).copy();rgb=a.astype(int)
    key=(rgb[:,:,0]>190)&(rgb[:,:,2]>150)&(rgb[:,:,1]<90)&(rgb[:,:,0]>rgb[:,:,1]+110)&(rgb[:,:,2]>rgb[:,:,1]+100)
    before=~key;mask=binary_erosion(before,iterations=1)
    groups,count=label(mask);sizes=np.bincount(groups.ravel());sizes[0]=0
    major=int(sizes.argmax());mask=groups==major
    contraction=1-float(mask.sum())/int(before.sum())
    assert contraction<.03
    ys,xs=np.where(mask);bbox=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
    assert min(bbox[0],bbox[1],a.shape[1]-bbox[2],a.shape[0]-bbox[3])>=10
    output=np.dstack((a,mask.astype(np.uint8)*255));output[~mask,:3]=0
    path=RUN/'source/middle-grip-input.png';path.parent.mkdir(parents=True,exist_ok=True)
    Image.fromarray(output).save(path)
    report={'status':'single_view_shape_input_only','runtime_publish_allowed':False,'source_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),'crop_xyxy':crop,'input_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'size':[a.shape[1],a.shape[0]],'alpha_bbox':bbox,'visible_pixels_before':int(before.sum()),'visible_pixels_after':int(mask.sum()),'removed_fraction':contraction,'large_connected_components':1,'visible_key_classified_pixels':int(np.sum(mask&key)),'semi_alpha_pixels':0,'hidden_rgb_nonzero_pixels':int(np.sum(np.any(output[~mask,:3]!=0,axis=1))),'tool_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'limitation':'One-pixel boundary contraction for shape-model input only; no runtime cutout approval or hidden-anatomy acceptance.'}
    (RUN/'qa').mkdir(exist_ok=True);(RUN/'qa/input.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print(json.dumps(report))


if __name__=='__main__':main()
