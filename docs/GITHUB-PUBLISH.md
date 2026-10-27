# GitHub 发布指南

项目仓库与预发布下载位于 [GitHub](https://github.com/Lyd-12138/pinwheel)。本指南用于后续版本的审阅和发布。新名称的商标核验仍未完成，见 [审计报告](audit-2026-10-26/REPORT.md)。整理完成的技术检查不代表获得无侵权保证。

当前发布版本为 0.10.4（见 [名称检查](BRANDING.md)），含 [安全复查修复](security-2026-10-26/REPORT.md)。使用对应的 `Pinwheel-0.10.4-GitHub-ready.zip`，其中有源码目录、安装文件、校验值和发布说明。旧的 0.10.1 包没有这些修复；此前的 security-source ZIP 仅有源码，不能代替完整发布准备包。

## 两类文件分别上传

准备包内的 `repository/` 是应提交到 Git 仓库根目录的源码。不要把整个准备包上传到仓库。该目录保留 `.github`、`.gitignore` 等隐藏文件；已经排除 `node_modules`、`.cache`、`dist`、测试数据、运行日志、个人配置及签名文件。

`release-assets/` 中的安装程序、便携 ZIP、Mac ZIP、鸿蒙源码包、项目源码 ZIP、校验值与发行记录应作为 **GitHub Release 附件**。不要提交安装包到 Git 历史。源码中的第三方源码归档则应保留，它们是许可说明所指向的对应材料。

GitHub 的浏览器上传有单文件 25 MiB 限制，普通 Git 有 100 MiB 文件限制；Release 附件单文件上限 2 GiB。本包会检查源码单文件大小。平台规则来源：[文件限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)、[Release 附件](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

## 上传源码

1. 在 GitHub 创建你自己的空仓库。可先使用私有仓库审阅；不要让 GitHub 自动生成另一份 LICENSE/README。
2. 进入准备包中的 `repository/`，执行下列命令。将占位地址替换为你自己的仓库地址；若未设置 Git 作者身份，先设置自己的 `user.name` 和 `user.email`。

```sh
git init
git add .
git commit -m "Prepare pinwheel 0.10.4"
git branch -M main
git remote add origin <YOUR_REPOSITORY_URL>
git push -u origin main
```

3. 检查仓库首页及 Actions。已准备只读权限的构建/单元测试工作流，使用固定提交的 GitHub 官方 Actions。工作流尚未在你的 GitHub 仓库中执行；首次运行失败时按日志处理，不要直接标记构建成功。
4. 开启 Issues；如提供安全漏洞报告，启用 GitHub Private vulnerability reporting。不要上传真实笔记或用户密码。

## 创建 Release

已发布版本不能覆盖标签或附件。下一版应使用新的版本号和全新的验证记录。完成对应版本打包和验证后，在 Releases → Draft a new release 创建新版本标签（例如 `v0.10.4`），先选择 **pre-release**。将新 `release-assets/` 内文件作为附件上传，正文可参考该版本的 `RELEASE-NOTES.md`。不要混用旧版安装程序、验证记录或许可材料。

Mac 仍缺少实机运行及 Apple 开发者签名/公证；鸿蒙是 0.2.3 工程源码，没有 HAP，不应标为“鸿蒙安装包”。避免使用“Typora 官方版/授权版/完全复刻”等可能使用户误解关系的宣传。

保持第三方声明及 `third-party/sources/` 随分发保留；项目自有代码 MIT 不会取消 ELK、字体等各自的许可义务。不要宣称已经完成商标、专利或所有组件的法律清查。

## 重新生成

从项目根目录运行 `npm ci`、`npm run build`、`npm test`、`npm run build:harmony`。完整的 Windows 验证序列为 `npm run validate:release`（会重跑隔离测试）；随后运行 `node scripts/package-harmony-source.mjs` 和 `python scripts/finalize-release.py` 生成已校验便携包与 manifest。确认许可和源码清单之后，再运行 `npm run audit:release`、`npm run package:github`。

Windows 安装器需要 `npm run prepare:tools -- --nsis`；Mac 运行时需要 `npm run prepare:tools -- --mac`，并先运行 `npm run notices`。下载项按固定 SHA-256 校验。Mac 结构包可跨平台生成，本轮是在 Windows 构建和检查，仍需在 Mac 上实机验证。
