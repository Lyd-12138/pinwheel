Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
Name "$(ProductName)"
OutFile "${PINWHEEL_OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Pinwheel"
InstallDirRegKey HKCU "Software\Pinwheel" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Var TestMode
!define MUI_ABORTWARNING
!define MUI_ICON "${PINWHEEL_ICON}"
!define MUI_UNICON "${PINWHEEL_ICON}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
LangString ProductName 1033 "pinwheel"
LangString ProductName 2052 "风车笔记"
LangString UnsafeFolder 1033 "Choose a separate empty folder or an existing pinwheel installation folder."
LangString UnsafeFolder 2052 "请选择单独的空文件夹，或已安装风车笔记的文件夹。"
LangString MarkdownType 1033 "pinwheel Markdown document"
LangString MarkdownType 2052 "风车笔记 Markdown 文档"
LangString EncryptedType 1033 "pinwheel encrypted document"
LangString EncryptedType 2052 "风车笔记加密文档"
LangString PackageType 1033 "pinwheel notebook package"
LangString PackageType 2052 "风车笔记笔记包"
Function .onInit
  System::Call 'kernel32::GetUserDefaultUILanguage() i.r0'
  StrCpy $LANGUAGE 1033
  ${If} $0 == 2052
  ${OrIf} $0 == 4100
    StrCpy $LANGUAGE 2052
  ${EndIf}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/TEST=" $TestMode
FunctionEnd
Section "$(ProductName)" Main
  StrCmp $INSTDIR "$LOCALAPPDATA" unsafe
  StrCmp $INSTDIR "$PROFILE" unsafe
  StrCmp $INSTDIR "$DOCUMENTS" unsafe
  StrCmp $INSTDIR "$DESKTOP" unsafe
  StrCmp $INSTDIR "$WINDIR" unsafe
  IfFileExists "$INSTDIR\.pinwheel-install" install
  IfFileExists "$INSTDIR\.moye-install" install
  IfFileExists "$INSTDIR\*.*" unsafe install
  unsafe:
    MessageBox MB_ICONSTOP "$(UnsafeFolder)"
    SetErrorLevel 2
    Abort
  install:
  SetOutPath "$INSTDIR"
  File /r "${PINWHEEL_SOURCE}\*.*"
  FileOpen $0 "$INSTDIR\.pinwheel-install" w
  FileWrite $0 "org.pinwheel.notes"
  FileClose $0
  WriteUninstaller "$INSTDIR\uninstall-pinwheel.exe"
  StrCmp $TestMode "1" done
  WriteRegStr HKCU "Software\Pinwheel" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pinwheel" "DisplayName" "$(ProductName)"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pinwheel" "DisplayVersion" "${PINWHEEL_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pinwheel" "Publisher" "pinwheel"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pinwheel" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pinwheel" "UninstallString" '$\"$INSTDIR\uninstall-pinwheel.exe$\"'
  !include "${PINWHEEL_ASSOCIATIONS}"
  CreateDirectory "$SMPROGRAMS\pinwheel"
  CreateShortcut "$SMPROGRAMS\pinwheel\pinwheel.lnk" "$INSTDIR\pinwheel.exe" "" "$INSTDIR\pinwheel.ico" 0
  CreateShortcut "$SMPROGRAMS\pinwheel\Uninstall pinwheel.lnk" "$INSTDIR\uninstall-pinwheel.exe"
  CreateShortcut "$DESKTOP\pinwheel.lnk" "$INSTDIR\pinwheel.exe" "" "$INSTDIR\pinwheel.ico" 0
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  done:
SectionEnd
Function un.onInit
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/TEST=" $TestMode
FunctionEnd
Section "Uninstall"
  IfFileExists "$INSTDIR\.pinwheel-install" uninstall
  IfFileExists "$INSTDIR\.moye-install" uninstall
  SetErrorLevel 2
  Abort
  uninstall:
  StrCmp $TestMode "1" files
  Delete "$DESKTOP\pinwheel.lnk"
  Delete "$SMPROGRAMS\pinwheel\pinwheel.lnk"
  Delete "$SMPROGRAMS\pinwheel\Uninstall pinwheel.lnk"
  RMDir "$SMPROGRAMS\pinwheel"
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "Pinwheel.Markdown"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "Pinwheel.Markdown"
  DeleteRegValue HKCU "Software\Classes\.pinwheel\OpenWithProgids" "Pinwheel.Encrypted"
  DeleteRegValue HKCU "Software\Classes\.moye\OpenWithProgids" "Pinwheel.Encrypted"
  DeleteRegValue HKCU "Software\Classes\.notepack\OpenWithProgids" "Pinwheel.Package"
  DeleteRegKey HKCU "Software\Classes\Pinwheel.Markdown"
  DeleteRegKey HKCU "Software\Classes\Pinwheel.Encrypted"
  DeleteRegKey HKCU "Software\Classes\Pinwheel.Package"
  DeleteRegKey HKCU "Software\Classes\Applications\pinwheel.exe"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Pinwheel"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\pinwheel.exe"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pinwheel"
  DeleteRegKey HKCU "Software\Pinwheel"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pinwheel"
  files:
  ; Only known application files are removed. User files never get recursive deletion.
  !include "${PINWHEEL_UNINSTALL_LIST}"
  Delete "$INSTDIR\.pinwheel-install"
  Delete "$INSTDIR\.moye-install"
  Delete "$INSTDIR\uninstall-pinwheel.exe"
  RMDir "$INSTDIR"
SectionEnd
