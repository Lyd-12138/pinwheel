import sys, unittest, plistlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from macos_branding import brand_main, brand_entry

class BrandingTest(unittest.TestCase):
    def test_main_and_helpers_keep_executable_names_consistent(self):
        self.assertEqual(brand_main({'CFBundleExecutable':'Electron'})['CFBundleExecutable'], 'pinwheel')
        self.assertEqual(brand_entry('Contents/MacOS/Electron', b'code', 'Electron'), ('Contents/MacOS/pinwheel', b'code'))
        for suffix in ('', ' (GPU)', ' (Renderer)', ' (Plugin)'):
            old = 'Electron Helper' + suffix
            new = 'pinwheel Helper' + suffix
            prefix = 'Contents/Frameworks/' + old + '.app/'
            raw = plistlib.dumps({'CFBundleExecutable': old, 'CFBundleIdentifier': 'com.github.Electron.helper' + suffix})
            name, data = brand_entry(prefix + 'Contents/Info.plist', raw, 'Electron')
            info = plistlib.loads(data)
            binary, code = brand_entry(prefix + 'Contents/MacOS/' + old, b'code', 'Electron')
            self.assertEqual(binary, name.removesuffix('Info.plist') + 'MacOS/' + info['CFBundleExecutable'])
            self.assertEqual(info['CFBundleName'], new)
            self.assertEqual(info['CFBundleIdentifier'], 'org.pinwheel.notes.helper' + suffix)
            self.assertEqual(code, b'code')
        vendor = 'Contents/Frameworks/Electron Framework.framework/Electron Framework'
        self.assertEqual(brand_entry(vendor, b'vendor', 'Electron'), (vendor, b'vendor'))

if __name__ == '__main__': unittest.main()
