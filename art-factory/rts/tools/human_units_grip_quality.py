"""Fail-closed quality checks; mechanical success is not visual approval."""
from __future__ import annotations
import math


def candidate_failures(report: dict) -> list[str]:
    failures=[]
    for key,expected in [('components',1),('open_boundary_edges',0),('nonmanifold_edges',0),
                         ('same_bone_transform_guarantees_no_detach',True),
                         ('shaft_intersection',False),('source_unchanged',True)]:
        if report.get(key) != expected: failures.append(key)
    for lod,key in [(0,'original_open_hand_trim'),(1,'original_open_hand_trim_lod1')]:
        trim=report.get(key,{})
        faces=trim.get('cap_faces')
        if not isinstance(faces,int) or faces<=0: failures.append(f'lod{lod}_wrist_uncapped')
        if trim.get('remaining_wrist_boundary_edges') != 0: failures.append(f'lod{lod}_wrist_boundary')
    triangles=report.get('exported_triangles',{})
    high,low=triangles.get('lod0'),triangles.get('lod1')
    if not isinstance(high,int) or not 0<high<20000: failures.append('lod0_triangle_budget')
    if not isinstance(low,int) or not 7000<=low<=10000: failures.append('lod1_triangle_budget')
    return failures
