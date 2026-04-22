# 发版指南

本文档只讲**正式对外发版**相关操作。日常开发、本地打包请看 [README.md](./README.md)。

`.github/workflows/release.yml` 会在推 `v*` tag 时触发，在对应平台的 runner 上各自跑 `npm run desktop:build`，把产物上传为 Artifacts 并挂到 GitHub Release。

---

## 一次性准备

1. 在 GitHub 建仓库并推代码（首次）：
   ```bash
   git init
   git add -A
   git commit -m "feat: initial commit"
   git branch -M master
   git remote add origin https://github.com/<你的用户名>/agbook.git
   git push -u origin master
   ```
2. 让本地终端能调 GitHub（推荐 `gh` CLI，一次授权走遍 `git push` / `gh release download`）：
   ```bash
   brew install gh         # 若未安装
   gh auth login           # 选 GitHub.com → HTTPS → Yes → Login with a web browser
   ```

---

## 发版操作

发版完整流程（**先把要发的代码 commit & push 到 master，再打 tag**，否则 CI 跑的还是旧代码）：

```bash
# 1. 确认工作区干净，且本地 master 已经 push 到远端
git status
git push origin master

# 2. 打 tag（语义化版本：v<MAJOR>.<MINOR>.<PATCH>）
git tag v0.1.1

# 3. 推 tag —— 推 tag 这一步才会触发 .github/workflows/release.yml
git push origin v0.1.1
```

> **关键点**：触发 CI 的是 `git push origin <tagname>`，**不是 `git push`**。后者只推分支，不推 tag。也可以一把推所有 tag：`git push origin --tags`。

之后：

- 看实时进度：<https://github.com/你的用户名/agbook/actions> 或终端 `gh run watch`
- 各 runner 用时：Mac ARM 约 2–3 分钟（Rust cache 命中后），Windows 约 5–9 分钟
- 全部成功后会自动建一个 Release，附带 dmg / msi / exe 三个安装包：
  <https://github.com/你的用户名/agbook/releases/tag/v0.1.1>

---

## 不打 tag 也能跑（手动触发）

`release.yml` 里同时声明了 `workflow_dispatch: {}`，可以不打 tag 就触发一次构建（用于试包）：

```bash
gh workflow run "Release Desktop Installers"
gh run watch                            # 看进度
gh run download                         # 把最近一次的 artifacts 拉到本地
```

或在 GitHub 网页：`Actions` → 左侧选 `Release Desktop Installers` → 右上 `Run workflow`。

> 手动触发**不会**自动建 GitHub Release，产物只在 Actions 的 Artifacts 里（保留 90 天）。需要正式 Release 还是得打 tag。

---

## tag 打错了怎么办

```bash
git tag -d v0.1.1                       # 删本地 tag
git push origin :refs/tags/v0.1.1       # 删远端 tag（这一步会让对应 Release 变 draft / 失效）
# 改完代码、重新 commit & push 后再打一次
git tag v0.1.1
git push origin v0.1.1
```

> 已经发布给用户的版本号尽量别覆盖重发，递增到下一个 patch（v0.1.2）更稳妥。

---

## 把产物拉回本地

```bash
gh release download v0.1.1 --dir installers
```

或浏览器：Release 页 → `Assets` → 逐个点下载。

产物清单：

| 文件 | 平台 | 用途 |
|---|---|---|
| `agbook_<ver>_aarch64.dmg` | macOS Apple Silicon | 双击 → 拖进 Applications |
| `agbook_<ver>_x64_en-US.msi` | Windows | MSI 静默部署 / IT 安装 |
| `agbook_<ver>_x64-setup.exe` | Windows | NSIS 向导安装 |

> 当前安装包**未做代码签名**。macOS 首次打开会提示"未知开发者"，右键 → 打开 → 同意一次即可；Windows 可能弹 SmartScreen，点"更多信息 → 仍要运行"。正式分发前需要申请 Apple Developer ID + Windows Authenticode 证书再加签。

---

## Runner 矩阵说明

```yaml
matrix:
  include:
    - name: macos-arm64    # macos-14，原生 ARM
    - name: windows-x64    # windows-latest，x86_64 MSVC
    # - name: macos-x64    # macos-13 (Intel Mac)：免费账号排队严重，默认注释掉
```

Intel Mac runner 在 GitHub 免费账号上常排队 20–60 分钟，所以默认只出 ARM Mac + Windows 两份。需要 Intel Mac 包时把 matrix 里那三行取消注释即可。

---

## CI 相关的已知坑

这些坑的成因 / 修复思路写在 [README.md 的"已知坑"章节](./README.md#已知坑--踩过的雷)，这里列一个快查索引：

| 症状 | 定位 |
|---|---|
| Windows 打包挂在 `prebuild-install` 且无明显报错 | Node 20.17+ spawn `.cmd` 需要 `shell: true` |
| 打出的二进制启动报 `NODE_MODULE_VERSION` / `ERR_DLOPEN_FAILED` | `better-sqlite3` ABI 没对齐 pkg 的 Node 20 |
| CI 找不到图标 / Cargo.lock | `.gitignore` 把关键资源 ignore 了 |
| 安装后窗口打开一片空白，DevTools 报 `fetch /api/... failed` | Tauri webview 原点不是 127.0.0.1，`apps/web/src/api.ts` 需要补绝对地址 |
