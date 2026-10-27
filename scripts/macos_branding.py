"""Brand app-owned macOS executables while preserving framework/vendor names."""
import plistlib

def brand_main(info):
    result = dict(info)
    result['CFBundleExecutable'] = 'pinwheel'
    return result

def brand_entry(relative, data, original_executable):
    if relative == 'Contents/MacOS/' + original_executable:
        return 'Contents/MacOS/pinwheel', data
    prefix = 'Contents/Frameworks/Electron Helper'
    if relative.startswith(prefix) and '.app/' in relative:
        bundle, tail = relative[len('Contents/Frameworks/'):].split('.app/', 1)
        name = bundle.replace('Electron Helper', 'pinwheel Helper', 1)
        target = 'Contents/Frameworks/' + name + '.app/' + tail
        if tail == 'Contents/Info.plist':
            info = plistlib.loads(data)
            info['CFBundleName'] = name
            info['CFBundleDisplayName'] = name
            info['CFBundleExecutable'] = name
            identifier = info.get('CFBundleIdentifier', '')
            suffix = identifier[identifier.index('.helper'):] if '.helper' in identifier else '.helper'
            info['CFBundleIdentifier'] = 'org.pinwheel.notes' + suffix
            return target, plistlib.dumps(info)
        if tail == 'Contents/MacOS/' + bundle:
            target = 'Contents/Frameworks/' + name + '.app/Contents/MacOS/' + name
        return target, data
    return relative, data
