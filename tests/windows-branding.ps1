$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$payload=Get-Content -LiteralPath $env:PINWHEEL_BRANDING_TEST -Raw -Encoding UTF8 | ConvertFrom-Json
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class PinwheelBrandingNative {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] public static extern uint ExtractIconEx(string file,int index,IntPtr[] large,IntPtr[] small,uint count);
 [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
 [DllImport("shlwapi.dll",CharSet=CharSet.Unicode)] public static extern int SHLoadIndirectString(string input,StringBuilder output,uint length,IntPtr reserved);
 [DllImport("shlwapi.dll",CharSet=CharSet.Unicode)] public static extern int AssocQueryString(uint flags,uint value,string association,string extra,StringBuilder output,ref uint length);
 [DllImport("advapi32.dll")] public static extern int RegOverridePredefKey(IntPtr key,IntPtr replacement);
}
'@
$indirect=[Text.StringBuilder]::new(1024)
$status=[PinwheelBrandingNative]::SHLoadIndirectString('@'+$payload.executable+',-56001',$indirect,1024,[IntPtr]::Zero)
if($status -ne 0 -or $indirect.ToString() -notin @('pinwheel','风车笔记')){throw 'Localized application resource was not resolved by Windows.'}
$info=[Diagnostics.FileVersionInfo]::GetVersionInfo($payload.executable)
if($info.FileDescription -notin @('pinwheel','风车笔记') -or $info.ProductName -notin @('pinwheel','风车笔记') -or $info.OriginalFilename -ne 'pinwheel.exe'){throw 'Native Windows version identity is incorrect.'}
$actual=[Drawing.Icon]::ExtractAssociatedIcon($payload.executable)
$large=[IntPtr[]]::new(1);$small=[IntPtr[]]::new(1)
if([PinwheelBrandingNative]::ExtractIconEx($payload.icon,0,$large,$small,1) -lt 1){throw 'Could not extract the source ICO with Windows.'}
$expected=[Drawing.Icon]::FromHandle($large[0])
$bitmap=$actual.ToBitmap();$reference=$expected.ToBitmap()
try {
 $bitmap.Save($payload.preview,[Drawing.Imaging.ImageFormat]::Png)
 $reference.Save($payload.preview+'.expected.png',[Drawing.Imaging.ImageFormat]::Png)
 if($bitmap.Width -ne $reference.Width -or $bitmap.Height -ne $reference.Height){throw 'Native icon dimensions differ.'}
 for($x=0;$x -lt $bitmap.Width;$x++){for($y=0;$y -lt $bitmap.Height;$y++){if($bitmap.GetPixel($x,$y).ToArgb() -ne $reference.GetPixel($x,$y).ToArgb()){throw 'Native Windows EXE icon differs from pinwheel.ico.'}}}
 $bitmap.Save($payload.preview,[Drawing.Imaging.ImageFormat]::Png)
} finally {$bitmap.Dispose();$reference.Dispose();$actual.Dispose();$expected.Dispose();[void][PinwheelBrandingNative]::DestroyIcon($small[0]);[void][PinwheelBrandingNative]::DestroyIcon($large[0])}
$testKey='Software\Pinwheel-Tests\Branding-'+[Guid]::NewGuid().ToString('N')
$classes=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($testKey+'\Classes')
$overridden=$false
try {
 foreach($entry in $payload.entries){if(-not $entry.key.StartsWith('Software\Classes\')){continue};$key=$classes.CreateSubKey($entry.key.Substring(17));try{$kind=[Microsoft.Win32.RegistryValueKind]::String;if($entry.type -eq 'REG_EXPAND_SZ'){$kind=[Microsoft.Win32.RegistryValueKind]::ExpandString};$key.SetValue([string]$entry.name,[string]$entry.value,$kind)}finally{$key.Dispose()}}
 if([PinwheelBrandingNative]::RegOverridePredefKey([IntPtr]::new(-2147483648),$classes.Handle.DangerousGetHandle()) -ne 0){throw 'Could not isolate Windows association queries.'};$overridden=$true
 $name=[Text.StringBuilder]::new(1024);[uint32]$length=1024
 $status=[PinwheelBrandingNative]::AssocQueryString(2,4,'pinwheel.exe',$null,$name,[ref]$length)
 if($status -ne 0 -or $name.ToString() -notin @('pinwheel','风车笔记')){throw ('Windows Open With name is incorrect: '+$status+' '+$name.ToString())}
 $icon=[Text.StringBuilder]::new(4096);[uint32]$length=4096
 $status=[PinwheelBrandingNative]::AssocQueryString(0,15,'Pinwheel.Markdown',$null,$icon,[ref]$length)
 if($status -ne 0 -or $icon.ToString() -ne ('"'+$payload.executable+'",0')){throw ('Windows association icon is incorrect: '+$status+' '+$icon.ToString())}
 @{passed=$true;nativeFriendlyAppName=$name.ToString();nativeFileDescription=$info.FileDescription;nativeIconPixelsMatch=$true;associationRegistryIsolated=$true;userDefaultApplicationsChanged=$false} | ConvertTo-Json -Compress
} finally {
 if($overridden){[void][PinwheelBrandingNative]::RegOverridePredefKey([IntPtr]::new(-2147483648),[IntPtr]::Zero)}
 $classes.Dispose()
 if(-not $testKey.StartsWith('Software\Pinwheel-Tests\Branding-')){throw 'Unexpected registry cleanup target.'}
 [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($testKey,$false)
}
