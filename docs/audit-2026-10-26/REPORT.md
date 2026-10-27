# 风车笔记 / pinwheel 0.10.1 发布前核查

核查日期：2026-10-26。对象为本工作区的 0.10.1 源码、第三方材料、拟上传 GitHub 的源码快照与相应发行物。此报告记录技术事实、公开来源及边界，不是法院认定或完整的商标、专利法律意见。

## 当前判断

现有核查没有发现直接引入 Typora 私有代码、官方默认主题或官方图标的证据。功能类似本身不足以证明复制；本次也没有取得 Typora 私有源码，不能作完整逐行鉴定或保证不存在改写后的实质相似。

目前最明确的未确认事项是 **新名称的权利状态**。已发现其他人在软件领域使用 Pinwheel，不能将“更名”或搜索未发现中文同名当作商标许可。源码及发行物可以整理、校验和供审阅，不能据此宣称已经排除全部侵权风险。

## 方法与证据

| 项目 | 核查方法及结论范围 |
| --- | --- |
| 应用源码 | 枚举 `src/shared/desktop/scripts/themes` 和鸿蒙源码的文件、导入与 SHA-256；筛查 Typora 品牌、私有界面标记和打包路径。命中需人工解释，扫描无命中不代表能排除所有复制。结果见 `scan-summary.json`、`source-hashes.json`、`source-imports.json`。 |
| 公开主题 | 固定 Typora 官方主题仓库提交 `cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2`，10 份公开 CSS 与本项目主题/CSS 对比。去除空白和注释，检查至少连续 160 字符的相同片段。结果见 `theme-comparison.json`；短片段、结构重写与整体实质相似不在此算法结论内。官方主题文件未复制到发布源码。 |
| 图标和宠物 | 当前风车图标由 `scripts/create-icons.py` 用几何图形绘制；宠物、像素画板及示例包由本项目代码生成，未在这些生成流程中读取第三方角色图。来源说明不等于对通用风车图形获得商标独占权。 |
| 依赖 | 按 lock 与实际安装包元数据核对 382 个唯一名称/版本、许可类型及许可文件；包含运行与构建依赖，不能将清单全部解释为实际捆绑组件。声明保留各组件原许可。结果见 `dependency-inventory.json`。 |
| 发行物 | 检查项目 MIT、Electron/Chromium 原声明、数学字体 OFL、ELK 来源材料、ZIP 完整性、Mac 符号链接与版本。实际结果和文件摘要见发行 manifest。Windows 安装与界面使用隔离数据测试。 |
| 拟上传源码 | 使用允许列表，不打包缓存、个人笔记、真实配置、签名、环境文件和 node_modules；筛查高置信度密钥特征、凭据 URL、个人用户目录及单文件大小。未做能发现所有秘密形式的取证。结果见 `release-checks.json` 与源码文件清单。 |

## 名称与品牌：未完成权利清查

- 已弃用旧的“墨页”品牌；旧文档扩展名、内部兼容协议和迁移路径继续保留，不用于宣称与原同名应用有关。
- 本次公开搜索包含“风车笔记”“風車筆記”“pinwheel notes”和 Pinwheel 软件使用线索。中文名称没有获得足以确认可注册、可使用的证据。
- 确认存在 [Pinwheel 截图整理应用](https://pinwheel.build/)，其 [服务条款](https://pinwheel.build/screenshots/terms) 声明对软件、品牌和商标的权利；另有 [Pinwheel 手机及应用服务](https://www.pinwheel.com/)。这是现实的同名软件使用线索，不等于已证明其权利必然覆盖本项目或本项目已侵权。
- 中国商标查询入口 `https://wcjs.sbj.cnipa.gov.cn/` 在本次工具访问中返回 403，未取得完整的注册、申请、类别、地域及使用状态数据。未绕过访问限制。
- 未完成中国第 9/42 类等相关商品服务及目标发行地区的注册检索，也未取得图形商标的近似检索结果。类别只是检索入口，不能仅按大类号码判定侵权。

正式使用该品牌前，应结合实际目标市场核对在先权利和混淆可能性。本报告不提供“名称已可放心使用”的结论。[国家知识产权局判断标准](https://www.cnipa.gov.cn/art/2020/6/17/art_75_126939.html)。

## 本次补正

1. 用户明确选择 MIT；根目录增加 `LICENSE`，项目和鸿蒙模块元数据相应更新。它适用于自有部分，不覆盖第三方版权。新增 `NOTICE.md` 说明范围和独立关系。
2. 保留 Electron 官方 `LICENSE` 与 `LICENSES.chromium.html`。项目许可单独命名为 `LICENSE-pinwheel.txt` 放入发行目录；Mac 安装后的 app 内也保留，避免覆盖 Electron 的 LICENSE。
3. 补充并保留 KaTeX 数学字体的 OFL 1.1 全文、版权及保留字体名。普通正文调用系统字体，没有把用户系统商业字体库打进项目。
4. 保留 `remark-math`、`rehype-katex`、`isarray`、`format`、`pako` 的上游许可补充及获取方式；新增匹配 Rolldown 版本的绑定许可。原文位置和方法见 `third-party/license-sources.json`，没有把所有依赖改署项目作者。
5. 增加第三方源码归档、源码获取声明与可核对的哈希。新增源码材料涉及 EPL-1.0、EPL-2.0、Apache-2.0，均保留原版权与条款，不统一标为 MIT。

## ELK 的具体核对结果与限制

官方 npm 元数据指定 elkjs 0.9.3 的 gitHead 为 `a8304cf79fde75bc2ab1a89d28320f53f8637436`。安装包中全部 9 个 `lib/` 文件与这个提交的 Git blob SHA-1 一致，另记录 SHA-256。见 `elkjs-installed-match.json`。Mermaid 的 ELK 布局模块实际引用 `elkjs/lib/elk.bundled.js`，该模块进入发行资源，不能按“没用到”忽略许可。

[上游发布说明](https://github.com/kieler/elkjs/releases/tag/0.9.3)明确指出 ELK 0.9.1 以及 [#955 补丁](https://github.com/eclipse-elk/elk/pull/955)。随包提供固定提交的 elkjs 完整归档、11 个官方 ELK 0.9.1 源码模块和补丁；Java 构建声明所列的 GWT/Guava/EMF/Xtext/Xtend 版本源码也保留。17 个 Maven 源码包已对照官方 SHA-1 校验，并分别记录 SHA-256。完整 Java 仓库归档下载超时，改为官方 Maven 模块源码，没有把下载失败记成成功。

**仍有历史构建追溯限制**：构建使用外部 ELK checkout、melk `0.10.0-SNAPSHOT` 和跟随 master 的历史 CI；没有查明不可变的编译器快照和完整的历史 Java 输入记录，也没有独立重建并逐字节比对官方 GWT 生成引擎。现在已提供明确来源、许可与源码获取材料；不能进一步承诺完整复现或给出全部上游分发义务的法律认证。[EPL 2.0 第 3 节](https://www.eclipse.org/legal/epl/epl-v20.html)。

## 尚未覆盖及不应作出的推论

另外，对允许列表生成的独立源码快照做了构建检查：TypeScript、桌面前端、主进程和鸿蒙 Web 构建均通过。此次复制了现有锁定依赖，没有执行全新联网 `npm ci`，也未在 GitHub 托管环境运行 CI；详见 `source-build-smoke.json`。Windows 实际程序的验证记录与二进制摘要绑定，摘要见 `windows-validation.json`。

- 没有反编译 Typora，没有完整私有实现比对、全球代码库相似性鉴定、专利权利要求对照或完整商业外观鉴定。
- 没有逐个独立核验 Electron/Chromium 全部底层组件的权利和专利；官方运行时许可保留并不等于对所有供应链作保证。
- `@electron-internal/extract-zip@1.0.5` 声明 BSD-2-Clause，但已安装包和固定提交根目录缺独立许可文件。它是安装工具，本次不再分发其 node_modules 代码。不要将整个开发依赖目录作为已清查材料另行分发。
- AI 辅助生成和用户提出要求，都不能自动证明所有输出独创或自动免除责任；本报告以能核对的代码与素材来源为依据。
- 免费、公开源码和选择 MIT 都不会使别人的版权、商标或专利失效。[计算机软件保护条例](https://ipc.court.gov.cn/zh-cn/news/view-407.html)。
- 本包不是鸿蒙安装包；Mac 未经实机验证与开发者公证；功能测试通过也不代表获得法律授权。

审计输出为本次快照的证据，后续修改依赖、素材或发布地区时应重新核对。报告、来源清单和未确认事项应与发布材料一起保留。
