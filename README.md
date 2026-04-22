# agbook

小说创作 AI 工作台。围绕 **小说管理 / 设定 / 大纲 / 章节计划 / 章节生成规则 / 审核修订** 的完整创作流程，兼容 OpenAI 风格的模型接入。

## 技术栈

- 桌面壳：`Tauri v2`（Rust + WebView，跨 macOS / Windows / Linux）
- 前端：`Vite + React + TypeScript + TailwindCSS + Zustand + TanStack Query`
- 后端：`Node.js + Fastify + TypeScript`
- 存储：`SQLite (better-sqlite3) + 本地文件`
- 模型接入：OpenAI 兼容 `chat/completions`
- 打包：`esbuild` + `@yao-pkg/pkg` 将后端打成单文件二进制，通过 Tauri sidecar 嵌入安装包

## 目录结构

```
agbook/
  apps/
    server/          # 本地服务：Fastify + SQLite + 模型网关 + 工作流
      dist-bundle/   # esbuild 打出的 CJS 单文件（供 pkg 消费）
    web/             # 前端工作台：React + Vite + Tailwind
    desktop/         # Tauri 桌面壳（Rust）
      src-tauri/
        binaries/    # pkg 生成的后端二进制（按 target-triple 命名）
        icons/       # 桌面应用图标集
        capabilities/
        src/         # Rust 主进程：启动 sidecar / 回收子进程
  scripts/           # 构建辅助脚本（bundle-server / pkg-server）
  data/              # 开发模式下的数据目录（SQLite + 项目文件）
```

## 环境准备（仅首次）

1. Node.js 20+ 与 npm（推荐 22 / 24）
2. Xcode Command Line Tools：`xcode-select --install`
3. Rust 工具链：
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
   source "$HOME/.cargo/env"
   ```

> Windows 需要安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2) 和 MSVC 构建工具；Linux 需要 `webkit2gtk`、`libgtk-3` 等系统依赖。

## 安装依赖

```bash
npm install
```

首次还需要生成桌面应用的图标集（只需一次）：

```bash
npm run desktop:icons
```

## 开发模式

### 浏览器模式（最轻）

```bash
npm run dev
```

- 后端：`http://127.0.0.1:8787`
- 前端：`http://localhost:5173`
- Vite 会把 `/api` 代理到后端

### 桌面模式

一条命令拉起 `server + web + desktop`，等前端就绪后打开 Tauri 窗口：

```bash
npm run dev:desktop
```

> 开发模式下 **Tauri 不启动 sidecar**（`cfg!(debug_assertions)` 分支跳过），而是复用你本地正在运行的 `npm run dev:server`。这样改代码热重载链路最快。

## 打包安装包

一条命令出当前平台的完整安装包（`.dmg` / `.msi`）：

```bash
npm run desktop:build
```

背后做了四件事：

1. `npm -w @agbook/server run build` — tsc 编译 TS
2. `scripts/bundle-server.mjs` — esbuild 把 `apps/server` 打成单文件 `dist-bundle/server.cjs`
3. `scripts/pkg-server.mjs` — `@yao-pkg/pkg` 把 bundle 打成二进制并放到 `apps/desktop/src-tauri/binaries/agbook-server-<target-triple>`，同时用 `prebuild-install` 替换 `better-sqlite3` 原生 addon 以匹配 pkg 内嵌的 Node 20 ABI
4. `tauri build` — Tauri 把前端静态资源 + 后端二进制（sidecar）一起打进安装包

产物位置：

```
apps/desktop/src-tauri/target/release/bundle/
  ├── macos/agbook.app                  # macOS 应用包（Contents/MacOS 含 agbook-server sidecar）
  ├── dmg/agbook_<ver>_<arch>.dmg       # macOS 安装镜像
  ├── msi/agbook_<ver>_<arch>.msi       # Windows MSI 安装包
  └── nsis/agbook_<ver>_<arch>.exe      # Windows NSIS 安装程序
```

### macOS 首次打开被拦截（"已损坏，无法打开"）

未签名/未公证版本在 macOS 上可能被 Gatekeeper 拦截。按下面步骤处理：

1. 先把 `agbook.app` 拖到 `Applications`（应用程序）目录
2. 去掉隔离标记：
   ```bash
   sudo xattr -rd com.apple.quarantine "/Applications/agbook.app"
   ```
3. 再清一次扩展属性（可选，但更稳）：
   ```bash
   sudo xattr -cr "/Applications/agbook.app"
   ```
4. 在 Finder 里右键 `agbook.app` -> `打开` -> 再确认一次
5. 若仍报错，再执行：
   ```bash
   open "/Applications/agbook.app"
   ```

### 运行时行为

- Tauri 启动时在 OS 的应用数据目录（macOS：`~/Library/Application Support/com.agbook.app/`，Windows：`%APPDATA%\com.agbook.app\`）下初始化 SQLite
- Rust 主进程通过 `AGBOOK_DATA_DIR` 环境变量把这个路径注入 sidecar
- sidecar 在 `127.0.0.1:8787` 监听；前端以绝对地址访问后端（通过 `window.location.protocol` 识别 Tauri 环境）
- 应用退出时 Tauri 的 `RunEvent::Exit` 会杀掉 sidecar 子进程，避免僵尸

### 跨平台构建

本地只出当前平台的包。带 `better-sqlite3` 这类原生模块在 macOS 上交叉编译出 Windows 安装包几乎不可行，生产上一律走 **GitHub Actions** —— 完整发版流程（一次性准备、打 tag、手动触发、拉产物、Runner 矩阵）整理在 **[RELEASING.md](./RELEASING.md)**。

## 已知坑 / 踩过的雷

便于以后再碰到同类问题能快速定位。

### 1. Windows 上 Node 拒绝直接 spawn `.cmd` 文件

CVE-2024-27980（Node 20.17+）后，`child_process.spawnSync` 不再直接执行 `.cmd` / `.bat`。`scripts/pkg-server.mjs` 里对 `prebuild-install.cmd` / `npm.cmd` 的调用统一加了：

```js
const spawnOpts = { stdio: 'inherit', shell: process.platform === 'win32' };
```

以后脚本里新增任何 `spawnSync` 调用都要跟上这个习惯。

### 2. `better-sqlite3` 原生 addon ABI 必须和目标 Node 对齐

- 本地 `npm install` 装的是宿主 Node 的 ABI（如 Node 22 = `NODE_MODULE_VERSION 127`，Node 25 = `141`）
- `@yao-pkg/pkg` 内嵌的是 Node 20 = `115`
- 如果不处理，pkg 出的二进制启动就 `ERR_DLOPEN_FAILED`

`scripts/pkg-server.mjs` 的处理流程：

1. 打包前：`prebuild-install --target=20.18.0 --force` 把 `.node` 换成 Node 20 ABI
2. pkg 执行：pkg 把 Node 20 ABI 的 `.node` 嵌进二进制
3. 打包后：再 `prebuild-install --target=<宿主 Node 版本>`，失败则 `npm rebuild better-sqlite3` 从源编译，恢复本地 dev 可用

所以每次 `npm run server:binary` 后本地 `npm run dev` 还能跑，但会有一次短编译。

### 3. `.gitignore` 必须保留的文件

早期版本的 `apps/desktop/.gitignore` 把 Tauri 主图标和 `Cargo.lock` 一起 ignore 了，CI 一上去就挂（`tauri.conf.json` 里引用的图标找不到、依赖版本漂移）。现状：

- **必须提交**：`src-tauri/icons/source.png`、`src-tauri/icons/{32x32,128x128,128x128@2x,icon}.{png,icns,ico}`、`src-tauri/Cargo.lock`
- **不提交**：`src-tauri/target/`、`src-tauri/gen/`、`src-tauri/binaries/agbook-server-*`

### 4. 前端在 Tauri 窗口里不能用相对 `/api/...`

Tauri v2 的 webview 原点是 `tauri://localhost`（macOS/Linux）或 `http://tauri.localhost`（Windows），跟 sidecar 的 `127.0.0.1:8787` 不同源。`apps/web/src/api.ts` 里根据 `window.location.protocol` 自动补绝对地址，本地浏览器 dev 下继续走 Vite 代理不变。

### 5. `dev:desktop` 父进程退出后 tsx / vite 子进程会变僵尸

`npm run dev:desktop` 底下是 `npm-run-all -p dev:server dev:web desktop:wait` 并行拉三个子任务，其中一个失败或你在 IDE 里直接结束 Run 窗口时，父进程退了但 `tsx watch`（8787）和 `vite`（5173）经常会孤儿化继续驻留。表现为：

- 新加的后端路由一直 `404`（老 server 进程没重启，跑的还是旧代码）
- 端口被占，重启 `dev:desktop` 报 `EADDRINUSE`
- 改代码没热更新

#### 排查速查

```bash
# 1) 看端口上是哪个 PID，以及进程跑了多久
lsof -i :8787 -sTCP:LISTEN
lsof -i :5173 -sTCP:LISTEN
ps -o pid,etime,command -p <pid>
```

`etime` 明显比当前这次 `dev:desktop` 启动时间长的，就是僵尸。

#### 重启流程

```bash
# 2) 清理老进程（两个端口都清）
lsof -ti :8787 | xargs kill 2>/dev/null
lsof -ti :5173 | xargs kill 2>/dev/null

# 3) 如果是 better-sqlite3 报 NODE_MODULE_VERSION 不匹配（宿主 Node 升级过），顺手重建
npm rebuild better-sqlite3

# 4) 重新起桌面开发
npm run dev:desktop
```

等 server 日志出现 `agbook server ready at http://127.0.0.1:8787` 再刷页面。

## 更换应用图标

1. 准备原图，保存为 `apps/desktop/src-tauri/icons/raw-source.png`（方图即可，不必透明）。
2. 生成 `source.png` 并打圆角/平台尺寸（**流程**：裁底部水印 → 整图**等比 contain** 缩进 1024 内接框 → 居中 → 超椭圆 + Dock 可见外缘，不需要抠亮度主体）：
   ```bash
   # 需要 Python3 + Pillow + numpy
   python3 -m venv /tmp/iconvenv && /tmp/iconvenv/bin/pip install Pillow numpy
   /tmp/iconvenv/bin/python apps/desktop/scripts/make-app-icon.py
   npm -w @agbook/desktop run icon:generate
   ```
   右下「豆包」类水印需同时裁底、裁右：改 `CROP_BOTTOM_PX`、`CROP_RIGHT_PX`；把主图放大：改 `INNER_RATIO`（越大越满版）。单侧裁边会让画框中心与主体错开，脚本会在裁完后**按发光区域**再包一层正方形，把霓虹书**重新置中**。
3. 提交 `raw-source.png`、`source.png` 及 `tauri icon` 生成的 `icons/*` 全量 diff。
4. 重打安装包（`npm run desktop:build` 或推 tag）。

> 占位用蓝色渐变仍由 `make-source-icon.mjs` 生成；`source.png` 已存在时它不会覆盖。`npm run desktop:icons` 等价于 `icon:source`（可能跳过）+ `icon:generate`。

## 首次使用

1. 打开应用（桌面窗口或浏览器）
2. 进入「模型配置」，添加一个 OpenAI 兼容的 Provider（Base URL / API Key / Model）
3. 新建小说 → 填写设定 → 搭建大纲 → 建立章节计划与章节规则 → 生成正文 → 查看审核 → 修订
