"""Cross-package official Electron archives without losing Unix modes or symlinks."""
from pathlib import Path,PurePosixPath
import json,plistlib,zipfile,hashlib,stat
from macos_branding import brand_main, brand_entry

root=Path.cwd();version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
electron=json.loads((root/'node_modules/electron/package.json').read_text(encoding='utf-8'))['version']
installer='''#!/bin/bash
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
app_source="$script_dir/pinwheel.app"
apps_dir="$HOME/Applications"
app_target="$apps_dir/pinwheel.app"
app_stage="$apps_dir/.Pinwheel-install-$$.app"
system_language=$(/usr/bin/defaults read -g AppleLanguages 2>/dev/null | /usr/bin/sed -n '2p' || true)
is_chinese=false
case "$system_language" in *zh-Hans*|*zh-CN*|*zh-SG*) is_chinese=true;; esac
say() { if $is_chinese; then echo "$1"; else echo "$2"; fi; }
if [[ ! -f "$app_source/Contents/Info.plist" ]]; then say "请先完整解压安装包。" "Extract the entire archive first."; exit 1; fi
mkdir -p "$apps_dir"
if [[ -e "$app_target" ]]; then
  bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_target/Contents/Info.plist" 2>/dev/null || true)
  if [[ "$bundle_id" != "org.pinwheel.notes" ]]; then say "目标文件夹不是风车笔记，请手动保留并移开它。" "The destination is not pinwheel. Keep it and move it manually."; exit 1; fi
fi
if [[ -e "$app_stage" ]]; then say "临时安装目录已存在，请稍后重试。" "The temporary installation folder already exists. Try again later."; exit 1; fi
/usr/bin/ditto "$app_source" "$app_stage"
# This development build is signed locally, without disabling Gatekeeper.
/usr/bin/codesign --force --deep --sign - --preserve-metadata=entitlements "$app_stage"
/usr/bin/codesign --verify --deep --strict "$app_stage"
if [[ -e "$app_target" ]]; then mv "$app_target" "$apps_dir/pinwheel-previous-$(date +%Y%m%d-%H%M%S)-$$.app"; fi
mv "$app_stage" "$app_target"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app_target" || true
say "风车笔记已安装到 $app_target。旧版本（如有）已保留。" "pinwheel is installed in $app_target. Any previous version is retained."
say "若系统拦截，请在系统设置 → 隐私与安全性中允许本次打开。" "If macOS blocks the app, allow it in System Settings > Privacy & Security."
open "$app_target"
'''
def regular(name,data,mode=0o644):
    info=zipfile.ZipInfo(name);info.create_system=3;info.external_attr=(stat.S_IFREG|mode)<<16;info.compress_type=zipfile.ZIP_DEFLATED
    return info,data

for arch,cpu in [('arm64',0x0100000c),('x64',0x01000007)]:
    runtime=root/'.cache/runtime'/f'electron-v{electron}-darwin-{arch}.zip'
    expected=json.loads((root/'node_modules/electron/checksums.json').read_text())[runtime.name]
    assert hashlib.sha256(runtime.read_bytes()).hexdigest()==expected
    output=root/'release'/f'Pinwheel-{version}-mac-{arch}.zip';assert not output.exists()
    prefix=f'Pinwheel-{version}-mac-{arch}/';app_prefix=prefix+'pinwheel.app/'
    with zipfile.ZipFile(runtime) as original,zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as target:
        info=plistlib.loads(original.read('Electron.app/Contents/Info.plist'))
        info.update(CFBundleIdentifier='org.pinwheel.notes',CFBundleName='pinwheel',CFBundleDisplayName='pinwheel',CFBundleDevelopmentRegion='en',CFBundleLocalizations=['en','zh-Hans'],CFBundleShortVersionString=version,CFBundleVersion=version,LSApplicationCategoryType='public.app-category.productivity',CFBundleIconFile='pinwheel.icns')
        info['CFBundleDocumentTypes']=[{'CFBundleTypeName':name,'CFBundleTypeExtensions':ext,'CFBundleTypeRole':role,'LSHandlerRank':rank} for name,ext,role,rank in [('pinwheel Markdown Document',['md','markdown'],'Editor','Alternate'),('pinwheel Encrypted Document',['pinwheel','moye'],'Editor','Owner'),('pinwheel Notebook Package',['notepack'],'Viewer','Owner')]]
        original_executable=info['CFBundleExecutable']
        main=original.read('Electron.app/Contents/MacOS/'+original_executable);assert main[:4]==b'\xcf\xfa\xed\xfe' and int.from_bytes(main[4:8],'little')==cpu
        info=brand_main(info)
        for entry in original.infolist():
            if not entry.filename.startswith('Electron.app/'):continue
            relative=entry.filename[len('Electron.app/'):]
            assert '..' not in PurePosixPath(relative).parts and not relative.startswith('/')
            if relative=='Contents/Info.plist':continue
            relative,data=brand_entry(relative,original.read(entry),original_executable)
            clone=zipfile.ZipInfo(app_prefix+relative,date_time=entry.date_time);clone.create_system=entry.create_system;clone.external_attr=entry.external_attr;clone.compress_type=zipfile.ZIP_DEFLATED
            target.writestr(clone,data)
        target.writestr(*regular(app_prefix+'Contents/Info.plist',plistlib.dumps(info)))
        # Electron's release ZIP stores these outside Electron.app. Preserve both
        # in the installed app and beside it so the install script cannot omit them.
        for legal in ['LICENSE','LICENSES.chromium.html']:
            target.writestr(*regular(app_prefix+'Contents/Resources/'+legal,original.read(legal)))
            target.writestr(*regular(prefix+legal,original.read(legal)))
        target.writestr(*regular(app_prefix+'Contents/Resources/pinwheel.icns',(root/'assets/pinwheel.icns').read_bytes()))
        target.writestr(*regular(app_prefix+'Contents/Resources/zh-Hans.lproj/InfoPlist.strings','"CFBundleDisplayName" = "风车笔记";\n"CFBundleName" = "风车笔记";\n'.encode('utf-16')))
        app_files={'package.json':json.dumps({'name':'pinwheel','version':version,'license':'MIT','type':'module','main':'desktop/main.mjs'},ensure_ascii=False).encode(),'desktop/main.mjs':(root/'.cache/main-bundle/main.mjs').read_bytes(),'desktop/preload.cjs':(root/'desktop/preload.cjs').read_bytes()}
        for file in (root/'dist').rglob('*'):
            if file.is_file():app_files['dist/'+file.relative_to(root/'dist').as_posix()]=file.read_bytes()
        for name,data in app_files.items():target.writestr(*regular(app_prefix+'Contents/Resources/app/'+name,data))
        target.writestr(*regular(prefix+'安装风车笔记.command',installer.encode(),0o755))
        for file in (root/'themes').glob('*'):
            if file.is_file():target.writestr(*regular(prefix+'示例主题/'+file.name,file.read_bytes()))
        for file in (root/'pet-examples').glob('*'):
            if file.is_file():target.writestr(*regular(prefix+'示例宠物/'+file.name,file.read_bytes()))
        target.writestr(*regular(prefix+'使用说明.md',(root/'README.md').read_text(encoding='utf-8').replace('(LICENSE)','(LICENSE-pinwheel.txt)').encode()))
        for name in ['CONTRIBUTING.md','SECURITY.md','docs/GITHUB-PUBLISH.md','docs/BRANDING.md']:
            target.writestr(*regular(prefix+name,(root/name).read_bytes()))
        for folder in ['docs/images','docs/audit-2026-10-26','docs/security-2026-10-26']:
            for file in (root/folder).rglob('*'):
                if file.is_file():target.writestr(*regular(prefix+file.relative_to(root).as_posix(),file.read_bytes()))
        target.writestr(*regular(prefix+'Mac安装说明.txt',('请完整解压，然后双击“安装风车笔记.command”，安装到 ~/Applications。\n本包为未公证开发预览版，安装脚本会在本机执行临时签名和签名校验，不关闭系统安全保护。\n若安装脚本或应用被拦截，请在“系统设置 → 隐私与安全性”中允许本次打开。\n可在 Finder 显示简介 → 打开方式 → 全部更改中关联文档。自启在应用设置中开启或关闭。\n旧版本会保留，不删除个人笔记。\n该包在 Windows 构建并校验，尚未经 macOS 实机运行验证。\n').encode()))
        notices=root/'THIRD-PARTY-NOTICES.md'
        target.writestr(*regular(prefix+'THIRD-PARTY-NOTICES.md',notices.read_bytes()))
        target.writestr(*regular(app_prefix+'Contents/Resources/THIRD-PARTY-NOTICES.md',notices.read_bytes()))
        for name,target_name in [('LICENSE','LICENSE-pinwheel.txt'),('NOTICE.md','NOTICE.md')]:
            target.writestr(*regular(prefix+target_name,(root/name).read_bytes()))
            target.writestr(*regular(app_prefix+'Contents/Resources/'+target_name,(root/name).read_bytes()))
        for file in (root/'third-party').rglob('*'):
            if file.is_file():
                relative='third-party/'+file.relative_to(root/'third-party').as_posix()
                target.writestr(*regular(prefix+relative,file.read_bytes()))
                target.writestr(*regular(app_prefix+'Contents/Resources/'+relative,file.read_bytes()))
    with zipfile.ZipFile(output) as zipped:
        assert zipped.testzip() is None
        assert stat.S_IMODE(zipped.getinfo(prefix+'安装风车笔记.command').external_attr>>16)==0o755
        links=[entry for entry in zipped.infolist() if stat.S_ISLNK(entry.external_attr>>16)]
        assert len(links)>3
        assert json.loads(zipped.read(app_prefix+'Contents/Resources/app/package.json'))['version']==version
    digest=hashlib.sha256(output.read_bytes()).hexdigest();Path(str(output)+'.sha256').write_text(digest+'  '+output.name+'\n')
    print(json.dumps({'archive':str(output),'bytes':output.stat().st_size,'symlinks':len(links),'architecture':arch,'sha256':digest,'runtimeTested':False},ensure_ascii=False),flush=True)
