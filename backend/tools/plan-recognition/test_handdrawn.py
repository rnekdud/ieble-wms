"""Procedural pen drawings, not detector templates. All image files are temporary."""
import math
import tempfile
import unittest
from pathlib import Path
from collections import Counter
import cv2
import numpy as np
from PIL import Image
from recognize import render, recognize


def drawing(count=2, doors=1, broken=False, text=True, rack_rotation=0, seed=19):
    image=np.full((800,1200,3),250,np.uint8);rng=np.random.default_rng(seed)
    def stroke(a,b,gap=0):
        a,b=np.float32(a),np.float32(b);v=b-a;n=np.array([-v[1],v[0]])/np.linalg.norm(v)
        ts=np.linspace(0 if not gap else gap/np.linalg.norm(v),1,32)
        points=np.array([a+t*v+n*rng.uniform(-2,2) for t in ts],np.int32)
        cv2.polylines(image,[points],False,(25,30,35),4,cv2.LINE_AA)
    stroke((70,70),(1130,70));stroke((70,70),(70,730));stroke((1130,70),(1130,730))
    openings=[(500,610)]+([(870,970)] if doors==2 else [])
    start=70
    for a,b in openings: stroke((start,730),(a,730));start=b
    stroke((start,730),(1130,730))
    boxes=[]
    for i in range(count):
        if count<=2: cx,cy,bw,bh=(330,260,220,100) if i==0 else (820,430,260,105)
        else: cx,cy,bw,bh=240+(i%3)*320,230+(i//3)*250,210,90
        box=((float(cx),float(cy)),(float(bw),float(bh)),float(rack_rotation));boxes.append(box)
        points=cv2.boxPoints(box)
        for j in range(4):stroke(points[j],points[(j+1)%4],8 if broken else 0)
        if text:
            cv2.putText(image,'Rack '+str(i+1),(int(cx-65),int(cy+12)),cv2.FONT_HERSHEY_SCRIPT_SIMPLEX,.65,(30,30,30),2,cv2.LINE_AA)
    if broken: cv2.line(image,(280,65),(288,75),(250,250,250),6)
    if text:cv2.putText(image,'ENTRY',(510,780),cv2.FONT_HERSHEY_SCRIPT_SIMPLEX,.7,(35,35,35),2,cv2.LINE_AA)
    return image,boxes,openings


def overlap(a,b):
    _,poly=cv2.rotatedRectangleIntersection(a,b)
    intersection=0 if poly is None else cv2.contourArea(poly)
    return intersection/(a[1][0]*a[1][1]+b[1][0]*b[1][1]-intersection)


class HanddrawnTests(unittest.TestCase):
    def analyze(self,image,rotation=0):
        with tempfile.TemporaryDirectory() as folder:
            source,out=Path(folder)/'phone.png',Path(folder)/'preview.png'
            cv2.imwrite(str(source),image);meta=render(source,out,rotation=rotation);result=recognize(out)
        return meta,result

    def assert_layout(self,result,boxes,openings,rotation=0):
        counts=Counter(o['type'] for o in result['objects'])
        self.assertEqual(counts['rack'],len(boxes),counts)
        self.assertEqual(counts['door'],len(openings),counts)
        self.assertEqual(counts['shape'],0,counts)
        w,h=result['width'],result['height'];racks=[o for o in result['objects'] if o['type']=='rack']
        for center,size,angle in boxes:
            x,y=center[0]/1200,center[1]/800
            for _ in range(rotation//90):x,y=1-y,x
            expected=((x*w,y*h),size,angle+rotation)
            best=max(overlap(expected,((r['x']*w,r['y']*h),(r['width']*w,r['height']*h),r['rotation'])) for r in racks)
            self.assertGreater(best,.78,('rack IoU',best,expected,racks))
        for a,b in openings:
            x,y=(a+b)/2/1200,730/800
            for _ in range(rotation//90):x,y=1-y,x
            door=min((o for o in result['objects'] if o['type']=='door'),key=lambda o:math.hypot(o['x']-x,o['y']-y))
            self.assertLess(math.hypot(door['x']-x,door['y']-y),.018)
            for wall in (o for o in result['objects'] if o['type']=='wall'):
                self.assertFalse(abs(wall['x']-x)<wall['width']/2 and abs(wall['y']-y)<wall['height']/2,'entrance must stay open')
        for wall in (o for o in result['objects'] if o['type']=='wall'):
            # All walls belong to the external boundary, never the racks or lettering.
            xx,yy=wall['x'],wall['y']
            for _ in range((360-rotation)%360//90):xx,yy=1-yy,xx
            self.assertLess(min(abs(xx-70/1200),abs(xx-1130/1200),abs(yy-70/800),abs(yy-730/800)),.018)

    def test_pen_and_multiple_objects(self):
        for count,doors,broken,text,angle in [(2,1,False,True,0),(1,1,True,True,0),(5,2,True,False,0),(2,1,True,True,17),(2,1,True,False,0)]:
            with self.subTest(count=count,doors=doors,broken=broken,text=text,angle=angle):
                image,boxes,gaps=drawing(count,doors,broken,text,angle);_,result=self.analyze(image);self.assert_layout(result,boxes,gaps)

    def test_quarter_turns(self):
        image,boxes,gaps=drawing(broken=True)
        for angle in [90,180,270]:
            with self.subTest(rotation=angle):
                _,result=self.analyze(image,angle);self.assert_layout(result,boxes,gaps,angle)

    def test_shadow_and_noise(self):
        image,boxes,gaps=drawing(broken=True)
        yy,xx=np.indices(image.shape[:2]);light=.48+.5*(xx/1200)+.06*np.sin(yy/100)
        noise=np.random.default_rng(38).normal(0,2,image.shape)
        photo=np.clip(image*light[:,:,None]+noise,0,255).astype(np.uint8)
        _,result=self.analyze(photo);self.assert_layout(result,boxes,gaps)

    def test_skewed_photo(self):
        image,_,_=drawing(broken=True)
        matrix=cv2.getRotationMatrix2D((600,400),7,1)
        photo=cv2.warpAffine(image,matrix,(1200,800),borderValue=(250,250,250))
        meta,result=self.analyze(photo)
        self.assertTrue(any('기울기' in w for w in meta['warnings']))
        self.assertEqual(Counter(o['type'] for o in result['objects'])['rack'],2)
        self.assertEqual(Counter(o['type'] for o in result['objects'])['door'],1)

    def test_paper_perspective(self):
        image,_,_=drawing(broken=True)
        matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[1199,0],[1199,799],[0,799]]),np.float32([[100,90],[1240,40],[1300,850],[40,900]]))
        photo=cv2.warpPerspective(image,matrix,(1400,980),borderValue=(65,65,65))
        meta,result=self.analyze(photo)
        self.assertTrue(any('원근' in w for w in meta['warnings']),meta)
        counts=Counter(o['type'] for o in result['objects']);self.assertEqual(counts['rack'],2,counts);self.assertEqual(counts['door'],1,counts)
        rs=sorted([o for o in result['objects'] if o['type']=='rack'],key=lambda o:o['x'])
        for r,(x,y) in zip(rs,[(330/1200,260/800),(820/1200,430/800)]):
            self.assertAlmostEqual(r['x'],x,delta=.025);self.assertAlmostEqual(r['y'],y,delta=.025)

    def test_exif_is_applied_before_manual_rotation(self):
        image,boxes,gaps=drawing()
        with tempfile.TemporaryDirectory() as folder:
            source,out=Path(folder)/'exif.jpg',Path(folder)/'out.png'
            exif=Image.Exif();exif[274]=6
            Image.fromarray(cv2.cvtColor(image,cv2.COLOR_BGR2RGB)).save(source,exif=exif,quality=95)
            meta=render(source,out);self.assertAlmostEqual(meta['aspectRatio'],2/3)
            self.assert_layout(recognize(out),boxes,gaps,90)

if __name__=='__main__':
    import sys, json, base64, os
    if '--png' in sys.argv or '--payload' in sys.argv:
        source=cv2.imread(os.environ['PLAN_IMPORT_REAL_IMAGE']) if os.environ.get('PLAN_IMPORT_REAL_IMAGE') else drawing(broken=True)[0]
        encoded=cv2.imencode('.png',source)[1].tobytes()
        if '--png' in sys.argv: sys.stdout.buffer.write(encoded)
        else:
            with tempfile.TemporaryDirectory() as folder:
                a,b=Path(folder)/'source.png',Path(folder)/'preview.png';a.write_bytes(encoded)
                meta=render(a,b);result=recognize(b)
                print(json.dumps(dict(source=base64.b64encode(encoded).decode(),preview=base64.b64encode(b.read_bytes()).decode(),metadata=meta,result=result)))
    else: unittest.main()
