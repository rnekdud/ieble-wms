"""Engine-only regressions; fixtures are explicit synthetic geometry, never runtime templates."""
import tempfile
import unittest
from pathlib import Path
from collections import Counter
import numpy as np
from PIL import Image
from recognize import render, recognize

FIXTURES = Path(__file__).resolve().parents[2] / 'IebleWms.Api.Tests/Fixtures/PlanImport'

class RecognitionTests(unittest.TestCase):
    def test_all_formats_and_pdf_pages(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / 'preview.png'
            for name in ['structured.png', 'structured.jpg', 'structured.webp', 'vector.pdf', 'multipage.pdf']:
                with self.subTest(name=name):
                    metadata = render(FIXTURES/name, out, 1 if name=='multipage.pdf' else 0)
                    self.assertAlmostEqual(metadata['aspectRatio'], 1.5)
                    counts=Counter(o['type'] for o in recognize(out)['objects'])
                    self.assertEqual(counts['rack'], 6)
                    for kind in ['wall','aisle','door','zone']: self.assertGreater(counts[kind], 0)
    def test_blank_and_continuous_tone_do_not_invent_objects(self):
        self.assertEqual(recognize(FIXTURES/'blank.png')['objects'], [])
        with tempfile.TemporaryDirectory() as folder:
            photo=Path(folder)/'continuous.png'
            Image.fromarray(np.random.default_rng(17).integers(0,256,(800,1200,3),dtype=np.uint8)).save(photo)
            result=recognize(photo)
            self.assertEqual(result['objects'], [])
            self.assertIn('사진', result['warnings'][0])
    def test_rotation_preserves_aspect_and_individual_rectangle_stays_unclassified(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'preview.png'
            meta=render(FIXTURES/'structured.png',out,rotation=90)
            self.assertAlmostEqual(meta['aspectRatio'],2/3)
            result=recognize(out)
            self.assertEqual(sum(o['type']=='rack' for o in result['objects']),6)
            self.assertEqual(sum(o['type']=='shape' for o in result['objects']),1)
            self.assertTrue(all(o['reviewRequired'] for o in result['objects']))
    def test_invalid_page_or_image_format_fails(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'preview.png'
            with self.assertRaises(ValueError): render(FIXTURES/'multipage.pdf',out,page=3)
            bad=Path(folder)/'fake.png';bad.write_bytes((FIXTURES/'structured.jpg').read_bytes())
            with self.assertRaises(ValueError):render(bad,out)

if __name__ == '__main__': unittest.main()
