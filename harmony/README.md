# 风车笔记 · HarmonyOS NEXT 工程

手机和平板版，版本 **0.2.3**，最低 **HarmonyOS API 18**。使用 Stage 模型、ArkTS、ArkWeb。没有云端和账号。

## 当前状态

已实现原生文件/密码桥接和移动编辑界面；已构建随工程携带的网页资源。底层互通测试、手机和平板浏览器预览操作测试与 DevEco 真机测试是不同层次，详细结果见 `验证记录.json`。

**当前开发机未安装 DevEco Studio / HarmonyOS SDK，没有连接鸿蒙设备，也没有签名证书。本次交付是工程源码，不是已签名的 HAP；尚不能声称已在鸿蒙设备上运行。**

## 语言与品牌

应用名称为「风车笔记 / pinwheel」。简体中文与英语界面默认跟随系统，不支持的系统语言使用英语；可在设置中手动选择并记忆。旧版笔记包和正文加密格式保持兼容。

## 已接入

- 默认按显示样式编辑的 Markdown，以及 CodeMirror 源码模式；代码语言高亮、表格、任务列表、LaTeX、脚注和 Mermaid。
- 手机抽屉导航、平板双栏；笔记/大纲 Tab、文件树/列表、长按菜单、新建文件/文件夹、重命名、副本、回收站与恢复。
- UTF-8、BOM/CRLF 保留、450ms 自动保存；原生临时文件 + fsync + rename，保存时校验原始哈希，避免静默覆盖。
- 笔记库在 `UIAbilityContext.filesDir/moye` 内。图片与附件自动复制到设置的库内相对文件夹，原文件保留。通过系统文件选择器导入和导出；不申请全盘访问。
- 与桌面版一致的 `.notepack` 清单、SHA-256 校验、相对链接；导出收集关联笔记与附件。导入全部验证后暂存，最后提交目录，拒绝路径穿越、符号链接、重复和未声明文件。
- 14 个主题、删除非默认主题、恢复主题、主题 JSON 导入/模板导出；枚举系统字体家族，缺字回退系统字体，不复制字体文件。
- 正文加密使用桌面 `MOYEENC v1` 格式：scrypt（N=131072、r=8、p=1，32 字节密钥）+ AES-256-GCM。盐 16 字节、IV 12 字节、标签 16 字节；头部与 `document` 用作 AAD。密码、密钥不落盘；附件、文件名不加密。
- 记录上次文档、编辑模式、目录折叠、光标与滚动位置。切到后台先保存，再锁定加密文档；原生遮罩遮挡任务截图，释放内存中的密钥引用。
- 单文件/附件 20MB；笔记包压缩前与压缩后总量均限制 32MB，最多 1000 个 ZIP 条目、500 篇关联导出笔记。

## 用 DevEco Studio 打开

1. 安装包含 API 18 或更高 HarmonyOS SDK 的 DevEco Studio。在 **Open** 中选择本目录 `harmony`，不要选择外层桌面项目目录。
2. 使用 IDE 自带的 Node、ohpm、Hvigor，同步工程；`build-profile.json5` 将最低兼容与目标版本设为 `5.1.0(18)`。选择与已安装 SDK 配套的编译版本。如果 IDE 需要升级工程模型，保留最低 API 18。
3. 原生项目不依赖第三方 OHPM 库；`entry/src/main/resources/rawfile/web` 已包含预构建编辑器。可直接进入原生构建，不必重新下载网页依赖。
4. 在 **Project Structure → Signing Configs** 中使用自己的开发者账号配置自动签名或证书；连接开启开发者调试的鸿蒙手机/平板，再运行 `entry`。签名配置、证书和设备凭据不要提交到源码包。
5. IDE 的 **Build Hap(s)/APP(s)** 产物位于 `entry/build/default/outputs/default/`。未签名 HAP 不能当作面向用户的安装包发布。

## 修改网页编辑器

源码包中 `harmony` 与 `src`、`shared`、`scripts` 是同级目录。网页编辑器复用桌面 Markdown 核心；Vite 目标 Chromium 114。

在源码包根目录执行：

```powershell
npm ci --ignore-scripts
node node_modules/typescript/bin/tsc -p harmony/tsconfig.web.json --noEmit
node scripts/build-harmony.mjs
```

`--ignore-scripts` 可避免为编辑网页资源而下载 Electron。构建会重新生成本工程的 `rawfile/web`；不会修改桌面发行包。

测试命令（在完整开发工作区）：

```powershell
node --test tests/harmony.test.mjs
node tests/harmony-ui.mjs
```

UI 测试使用隔离目录和隐藏 Edge，可设置 `PINWHEEL_BROWSER_CHANNEL=chrome`。测试中的 Node 适配器按官方 API 行为执行原生服务源文件，能验证文件格式和业务流程，**不能替代 ArkTS 编译器、ArkWeb、软键盘和真机生命周期验证**。

## 待真机验收与平台差异

首轮真机需要检查：ArkTS 编译诊断；rawfile 的 URL 与 CSP；中文输入法和键盘避让；照片/文件 URI 权限及取消选择；断电/强杀时保存完整性；真实 CryptoFramework 的 GCM 标签与 scrypt 参数；后台和任务截图；折叠屏/横屏；字体枚举；签名安装与升级保留数据。

当前鸿蒙版导出 Markdown、加密文档、笔记包及 HTML，不提供原生 PDF 打印。HTML 公式采用浏览器的 MathML 呈现；Mermaid 在编辑器中预览，HTML 导出保留图表代码。移动笔记库使用应用沙盒，不能像桌面版一样直接选任意磁盘目录作为持续监视的笔记库。桌面宠物、开机自启和桌面窗口置顶没有移植到手机。历史版本管理和桌面快捷键并非逐项照搬。

删除会进入应用回收站；卸载应用会清除沙盒，迁移或卸载前请导出笔记包。更改附件目录只影响新附件，旧附件仍保留。

## 官方接口依据

- [ArkWeb JavaScriptProxy](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/ts-basic-components-web)
- [文件选择器](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-file-picker)
- [文件操作](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-file-fs)
- [CryptoFramework（API 18 scrypt）](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-crypto-architecture-kit/js-apis-cryptoFramework.md)
- [系统字体枚举](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-arkgraphics2d/js-apis-graphics-text.md)
