"""Synthetic notebook fixtures; no customer drawing is embedded or sent off-device."""
import unittest
import tempfile
from pathlib import Path
from collections import Counter
import cv2
import numpy as np
from recognize import render, recognize, ink_mask
import test_handdrawn as handdrawn


def notebook(color=(155, 155, 155), spacing=32, thickness=2, blank=False, aligned=False):
    drawing_image, boxes, openings = handdrawn.drawing(broken=True)
    paper = np.full_like(drawing_image, 250)
    for y in range(18 if not aligned else 70, 800, spacing):
        cv2.line(paper, (0, y), (1199, y), color, thickness, cv2.LINE_AA)
    # Ink is applied after the paper rules: crossings and co-linear ink must survive.
    image = paper if blank else np.minimum(paper, drawing_image)
    return image, boxes, openings


class RuledTests(unittest.TestCase):
    analyze = handdrawn.HanddrawnTests.analyze
    assert_layout = handdrawn.HanddrawnTests.assert_layout
    # Reuse geometric assertions, without duplicating the parent's regression cases.
    def test_ruled_layout(self):
        for color, spacing, aligned in [((155,155,155),32,False),((220,170,155),28,False),((175,175,175),33,True)]:
            image,boxes,gaps=notebook(color,spacing,aligned=aligned)
            with self.subTest(color=color,spacing=spacing,aligned=aligned):
                _,result=self.analyze(image)
                self.assert_layout(result,boxes,gaps)
                self.assertTrue(any('줄무늬' in warning for warning in result['warnings']))

    def test_blank_notebook_has_no_objects(self):
        image,_,_=notebook(blank=True)
        self.assertEqual(self.analyze(image)[1]['objects'],[])

    def test_rotation_shadow_and_skew(self):
        image,boxes,gaps=notebook()
        for angle in [90,180,270]:
            with self.subTest(rotation=angle):
                _,result=self.analyze(image,angle);self.assert_layout(result,boxes,gaps,angle)
        yy,xx=np.indices(image.shape[:2])
        light=.48+.5*(xx/1200)+.06*np.sin(yy/100)
        noise=np.random.default_rng(38).normal(0,2,image.shape)
        photo=np.clip(image*light[:,:,None]+noise,0,255).astype(np.uint8)
        self.assert_layout(self.analyze(photo)[1],boxes,gaps)
        matrix=cv2.getRotationMatrix2D((600,400),7,1)
        skew=cv2.warpAffine(photo,matrix,(1200,800),borderValue=(250,250,250))
        _,result=self.analyze(skew)
        counts=Counter(o['type'] for o in result['objects'])
        self.assertEqual(counts['rack'],2,counts);self.assertEqual(counts['door'],1,counts)

    def test_perspective_notebook(self):
        image,_,_=notebook()
        matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[1199,0],[1199,799],[0,799]]),np.float32([[100,90],[1240,40],[1300,850],[40,900]]))
        photo=cv2.warpPerspective(image,matrix,(1400,980),borderValue=(65,65,65))
        meta,result=self.analyze(photo)
        self.assertTrue(any('원근' in w for w in meta['warnings']))
        counts=Counter(o['type'] for o in result['objects'])
        self.assertEqual(counts['rack'],2,counts);self.assertEqual(counts['door'],1,counts)
        for obj,(x,y) in zip(sorted([o for o in result['objects'] if o['type']=='rack'],key=lambda o:o['x']),[(330/1200,260/800),(820/1200,430/800)]):
            self.assertAlmostEqual(obj['x'],x,delta=.025);self.assertAlmostEqual(obj['y'],y,delta=.025)

    def test_strong_parallel_structures_and_irregular_lines_are_preserved(self):
        # A dark CAD grid is not classified as paper just because it is periodic.
        image,_,_=notebook(color=(25,25,25),blank=True)
        mask,rules=ink_mask(image,with_rules=True)
        self.assertEqual(rules,0);self.assertGreater(np.count_nonzero(mask),20000)
        image=np.full((800,1200,3),250,np.uint8)
        for y in [20,50,96,126,190,220,300,330,435,465,600,630]:
            cv2.line(image,(0,y),(1199,y),(155,155,155),2)
        mask,rules=ink_mask(image,with_rules=True)
        self.assertEqual(rules,0);self.assertGreater(np.count_nonzero(mask),20000)

    def test_analysis_preserves_preview_pixels_and_dark_crossings(self):
        image,_,_=notebook(blank=True)
        cv2.line(image,(200,114),(900,114),(30,30,30),4)
        cv2.line(image,(600,80),(600,600),(30,30,30),4)
        before=image.copy();mask,rules=ink_mask(image,with_rules=True)
        self.assertGreater(rules,0);self.assertTrue(np.array_equal(before,image))
        self.assertTrue(np.all(mask[114,210:890]>0));self.assertTrue(np.all(mask[90:590,600]>0))
        self.assertEqual(np.count_nonzero(mask[114,:180]),0)
        with tempfile.TemporaryDirectory() as folder:
            source,out=Path(folder)/'source.png',Path(folder)/'preview.png'
            cv2.imwrite(str(source),image);render(source,out)
            self.assertTrue(np.array_equal(cv2.imread(str(out)),image),'Preview must retain original notebook rules')
            saved=out.read_bytes();recognize(out);self.assertEqual(out.read_bytes(),saved)

if __name__=='__main__':
    import sys, json, base64
    if '--payload' in sys.argv:
        source=notebook()[0]
        with tempfile.TemporaryDirectory() as folder:
            a,b=Path(folder)/'source.png',Path(folder)/'preview.png'
            encoded=cv2.imencode('.png',source)[1].tobytes();a.write_bytes(encoded)
            meta=render(a,b);result=recognize(b)
            print(json.dumps(dict(source=base64.b64encode(encoded).decode(),preview=base64.b64encode(b.read_bytes()).decode(),metadata=meta,result=result)))
    else: unittest.main()
