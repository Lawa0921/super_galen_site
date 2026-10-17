import io,unittest
from copy import deepcopy
from PIL import Image
from visual_texture_pack import optimize_image,pack_document,pixel_signature

def png(mode='RGBA'):
    im=Image.new(mode,(64,64));im.putdata([((x*7)%256,(x*3)%256,128,x%256) if mode=='RGBA' else ((x*7)%256,(x*3)%256,128) for x in range(4096)])
    out=io.BytesIO();im.save(out,format='PNG');return out.getvalue()

class PackTests(unittest.TestCase):
    def test_exact_rgba_including_transparent_rgb(self):
        source=png();result,mime=optimize_image(source)
        self.assertEqual(pixel_signature(source),pixel_signature(result));self.assertLessEqual(len(result),len(source))
    def test_jpeg_is_retained_byte_for_byte(self):
        out=io.BytesIO();Image.new('RGB',(32,32),(23,64,103)).save(out,format='JPEG');source=out.getvalue()
        self.assertEqual(optimize_image(source),(source,'image/jpeg'))
    def test_webp_uses_required_texture_extension_without_geometry_changes(self):
        source=png();doc={'asset':{'version':'2.0'},'images':[{'uri':'source.png','name':'source','extras':{'author':'retained'}}],'textures':[{'source':0,'sampler':0,'extras':{'keep':True}}],'nodes':[{'name':'bone'}],'buffers':[{'byteLength':4}],'bufferViews':[{'buffer':0,'byteLength':4}],'accessors':[{'bufferView':0}]};before=deepcopy(doc)
        packed,binary,files,report=pack_document(doc,b'abcd',lambda uri:source,{})
        self.assertEqual(doc,before);self.assertEqual(binary,b'abcd');self.assertEqual(packed['nodes'],doc['nodes']);self.assertEqual(packed['accessors'],doc['accessors']);self.assertEqual(packed['images'][0]['extras'],doc['images'][0]['extras'])
        self.assertEqual(packed['textures'][0]['sampler'],0);self.assertEqual(packed['textures'][0]['extras'],{'keep':True});self.assertEqual(report[0]['rgba_unchanged'],True)
        self.assertEqual(packed['images'][0]['mimeType'],'image/webp');self.assertIn('EXT_texture_webp',packed['extensionsRequired']);self.assertNotIn('source',packed['textures'][0]);self.assertEqual(packed['textures'][0]['extensions']['EXT_texture_webp']['source'],0)
        self.assertEqual(pixel_signature(source),pixel_signature(next(iter(files.values()))))
    def test_same_pixels_are_not_assumed_from_a_filename(self):
        a=png();out=io.BytesIO();Image.new('RGB',(64,64),'red').save(out,format='PNG');b=out.getvalue();cache={}
        doc={'images':[{'uri':'oak-normal.png'}]}
        x=pack_document(doc,b'',lambda uri:a,cache);y=pack_document(doc,b'',lambda uri:b,cache)
        self.assertNotEqual(x[0]['images'][0]['uri'],y[0]['images'][0]['uri'])
    def test_invalid_image_fails_closed(self):
        with self.assertRaises(Exception):optimize_image(b'not an image')
if __name__=='__main__':unittest.main()
