"""Fragmented outlines and a framed opening. Optional private image never enters fixtures."""
import os
import tempfile
import unittest
from pathlib import Path
from collections import Counter
import cv2
import numpy as np
from recognize import render, recognize
from test_handdrawn import overlap


def fragmented():
    im=np.full((800,1500,3),245,np.uint8)
    def line(points):cv2.polylines(im,[np.array(points,np.int32)],False,(30,35,40),4,cv2.LINE_AA)
    line([(300,580),(300,180),(1130,160)])
    line([(1130,175),(1134,440)])
    line([(300,580),(495,550)])
    line([(875,505),(1115,462)])
    for x,y,w,h in [(370,220,250,165),(750,215,210,145)]:
        line([(x,y+12),(x+3,y+h),(x+w-12,y+h-28)])
        line([(x-6,y),(x+w-8,y-15),(x+w,y+20),(x+w-4,y+h-38)])
        cv2.putText(im,'Rack',(x+35,y+85),cv2.FONT_HERSHEY_SCRIPT_SIMPLEX,.8,(30,30,30),2)
    line([(515,515),(835,465),(850,548)])
    line([(515,530),(520,585),(830,550)])
    cv2.putText(im,'ENTRY',(590,550),cv2.FONT_HERSHEY_SCRIPT_SIMPLEX,.7,(30,30,30),2)
    return im


class FragmentedTests(unittest.TestCase):
    def test_fragmented_boundary_is_not_a_prerequisite_for_racks(self):
        with tempfile.TemporaryDirectory() as folder:
            source,out=Path(folder)/'drawing.png',Path(folder)/'preview.png';cv2.imwrite(str(source),fragmented())
            for angle in [0,90,180,270]:
                with self.subTest(angle=angle):
                    render(source,out,rotation=angle);result=recognize(out);counts=Counter(o['type'] for o in result['objects'])
                    self.assertEqual(counts['rack'],2,counts);self.assertEqual(counts['door'],1,counts);self.assertEqual(counts['wall'],5,counts);self.assertEqual(counts['shape'],0,counts)

    @unittest.skipUnless(os.environ.get('PLAN_IMPORT_REAL_IMAGE'),'Private upload supplied only for local verification')
    def test_private_upload_against_independent_annotations(self):
        # Manually marked boundaries in the reported 1536 x 799 photo, not algorithm inputs.
        polygons=[[(389,223),(632,205),(647,365),(394,399)],[(775,221),(977,195),(988,328),(767,358)]]
        entrance=[(530,512),(858,464),(878,550),(540,588)]
        segments=[((319,181),(1170,163)),((319,181),(316,583)),((1168,165),(1169,437)),((316,583),(520,551)),((890,506),(1159,461))]
        source=Path(os.environ['PLAN_IMPORT_REAL_IMAGE'])
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'preview.png'
            for angle in [0,90,180,270]:
                with self.subTest(angle=angle):
                    meta=render(source,out,rotation=angle);result=recognize(out);counts=Counter(o['type'] for o in result['objects'])
                    self.assertEqual(counts,Counter(wall=5,rack=2,door=1),counts)
                    w,h=result['width'],result['height']
                    def point(p):
                        x,y=p[0]/1536,p[1]/799
                        for _ in range(angle//90):x,y=1-y,x
                        return x*w,y*h
                    def rect(o):return ((o['x']*w,o['y']*h),(o['width']*w,o['height']*h),o['rotation'])
                    ious=[]
                    for poly in polygons:
                        expected=cv2.minAreaRect(np.float32([point(p) for p in poly]));iou=max(overlap(expected,rect(o)) for o in result['objects'] if o['type']=='rack');ious.append(iou);self.assertGreater(iou,.8)
                    door=next(o for o in result['objects'] if o['type']=='door');diou=overlap(cv2.minAreaRect(np.float32([point(p) for p in entrance])),rect(door));self.assertGreater(diou,.72)
                    walls=[o for o in result['objects'] if o['type']=='wall'];errors=[]
                    for a,b in segments:
                        a,b=np.array(point(a)),np.array(point(b));center=(a+b)/2
                        wall=min(walls,key=lambda o:np.linalg.norm(np.array([o['x']*w,o['y']*h])-center));rr=rect(wall);theta=np.deg2rad(rr[2]+(90 if rr[1][1]>rr[1][0] else 0));u=np.array([np.cos(theta),np.sin(theta)]);length=max(rr[1]);ends=[np.array(rr[0])-u*length/2,np.array(rr[0])+u*length/2]
                        error=min(max(np.linalg.norm(a-ends[0]),np.linalg.norm(b-ends[1])),max(np.linalg.norm(a-ends[1]),np.linalg.norm(b-ends[0])));errors.append(error);self.assertLess(error,32)
                    for wall in walls:
                        inter,_=cv2.rotatedRectangleIntersection(rect(wall),rect(door));self.assertNotEqual(inter,cv2.INTERSECT_FULL)
                    print(f'PRIVATE {angle}: wall=5 rack=2 door=1 extra=0; rack IoU={min(ious):.3f}, door IoU={diou:.3f}, maximum wall endpoint error={max(errors):.1f}px')

if __name__=='__main__':unittest.main()
