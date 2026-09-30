# 糖糖笔记

使用 Electron + React + TypeScript 编写的本地桌面笔记客户端。保留双栏界面、浅色/深色主题，支持新增、编辑、切换、标题和正文搜索、删除确认、自动保存、Unicode 字数统计及 JSON 导入/导出。笔记仅保存在此电脑，无需联网，不含云同步。

## 开发与运行

需要 Node.js 24 和 pnpm 11.19.0。可通过 `npm install -g pnpm@11.19.0` 安装 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm dev                  # Electron 窗口 + React 热更新
pnpm build                # TypeScript 检查和生产构建
pnpm start                # 启动生产构建
```

Electron 44 首次启动会下载对应系统的运行程序，需要能访问 npm 与 GitHub Releases；也可提前执行 `pnpm exec install-electron`。下载失败时可重试，该步骤不操作笔记。

新安装首次启动时创建欢迎笔记；主动删空后重启仍保持空列表。使用系统窗口标题栏及标准编辑菜单，支持 `⌘/Ctrl+N` 新建、`⌘/Ctrl+F` 搜索以及系统复制、粘贴和撤销快捷键。macOS 关闭窗口后可从 Dock 重新打开，`⌘+Q` 完全退出。

## 测试

```sh
pnpm typecheck
pnpm test                 # 单元、React 组件、临时目录存储集成测试
pnpm test:e2e             # 构建后启动真实 Electron 测试
pnpm pack                 # 当前平台的应用目录，不生成安装程序
pnpm test:packaged        # 启动 dist 下打包后的应用进行冒烟测试
```

Linux 无显示服务环境下使用 `xvfb-run --auto-servernum pnpm test:e2e` 和 `xvfb-run --auto-servernum pnpm test:packaged`。Electron 的 Linux 沙箱需要系统支持非特权用户命名空间；请保留沙箱，避免通过 `--no-sandbox` 绕过。

Ubuntu 24+ 的 AppArmor 可能限制 AppImage 使用沙箱。需要管理员为提取后的固定可执行文件路径配置允许 `userns` 的应用专用 profile，格式见 `.github/scripts/linux-sandbox.sh`；CI 仅对自己的两个测试程序授权，不关闭全局 AppArmor。[electron-builder Linux 说明](https://www.electron.build/v26/docs/linux/#apparmor-profile-ubuntu-24)

所有自动化测试使用临时目录，通过 `TANGTANG_TEST_USER_DATA` 隔离数据，不接触真实笔记。真实窗口测试覆盖增删改查、字数、主题、纯文本处理、导入合并、导出、重启恢复、连续输入立即关闭、保存失败后返回编辑和损坏文件保护。测试在主进程替换原生文件对话框的选择结果，后续校验和读写均使用真实代码。报告、日志和布局截图位于 `playwright-report/`、`test-results/`。

`TANGTANG_PACKAGED_EXECUTABLE` 可指定已打包的可执行文件。测试构建使用 `out/`，安装包使用 `dist/`，均不提交到 Git。

## 打包和安装

```sh
pnpm dist:mac             # arm64 和 x64 DMG；在 macOS 构建
pnpm dist:win             # x64 NSIS；建议在 Windows 构建与验证
pnpm dist:linux           # x64 AppImage；建议在 Linux 构建与验证
```

安装包输出到 `dist/`，文件名包含版本、系统和架构。macOS arm64 对应 Apple Silicon，x64 对应 Intel；Electron 44 要求 macOS 13 或更新版本。Windows 使用当前 Electron 支持的 Windows 10/11；Linux 使用支持当前 Electron/Chromium 的 x64 发行版。

本次安装包未进行正式签名、公证或发布。macOS 将 `.app` 拖入 Applications，系统可能需要在“系统设置 → 隐私与安全性”允许打开；Windows 运行安装程序，未签名版本可能显示来源提示；Linux 为 AppImage 增加执行权限后启动。若系统缺少 FUSE，可执行 `./tangtang-notes-…AppImage --appimage-extract`，再运行 `squashfs-root/AppRun`。

`.github/workflows/desktop.yml` 配置 macOS arm64/x64、Windows x64、Linux x64 的类型检查、单元测试、真实 Electron 测试、安装包构建和打包后冒烟测试；失败上传日志及截图，成功上传安装包。将仓库推送至 GitHub 后可自动或手动运行。当前仓库没有远程地址，未运行的系统不会标记为已验证；本次结果见 `VALIDATION.md`。

## 数据与恢复

笔记和主题统一保存在 Electron `userData` 下的 `notebook-v1.json`。默认目录：

| 系统 | 数据目录 |
| --- | --- |
| macOS | `~/Library/Application Support/糖糖笔记/` |
| Windows | `%APPDATA%\糖糖笔记\` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/糖糖笔记/` |

保存请求按顺序写入，先写临时文件并同步，再替换主文件；`notebook-v1.json.bak` 保留上一份有效数据。界面仅在最新保存成功后显示“已保存”。保存失败时仍可继续编辑、重试或导出内存中的最新内容；关闭时等待保存，失败时可返回编辑、重试、导出备份或明确放弃后退出。

数据损坏时禁止自动覆盖，界面禁用修改并提示重新读取。恢复步骤：完全退出客户端，先将损坏文件复制到别处保留，再将有效 `.bak` 复制为 `notebook-v1.json`，最后重新启动。备份是上一份保存的内容，不等同于长期备份，建议定期通过“导出备份”保存到其他目录。

## 从原网页迁移

在**原来记录笔记的浏览器和网页地址**打开旧版应用，打开浏览器开发者工具的控制台，执行以下代码下载 JSON 文件。桌面客户端无法自动访问原浏览器 localStorage；不要清除旧站点数据。

```js
(() => {
  const raw = localStorage.getItem('tangtang-notes-v1');
  if (raw === null) throw new Error('此网页地址没有旧笔记，请检查浏览器和地址');
  const notes = JSON.parse(raw);
  if (!Array.isArray(notes)) throw new Error('旧笔记格式错误，请先备份原始数据');
  const backup = {
    version: 1, notes,
    theme: localStorage.getItem('tangtang-theme-v1') === 'dark' ? 'dark' : 'light'
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = '糖糖笔记网页备份.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})();
```

在桌面客户端点击“导入笔记”选择文件。也接受直接导出的旧笔记数组。导入保留当前客户端主题和已有笔记，相同 ID 且标题/正文相同的跳过；相同 ID 但内容不同的生成新 ID 保留两份，导入笔记时间不变。整个文件校验成功后才合并，取消或格式错误不修改当前笔记。导出包含所有笔记与当前主题。

## 工程结构

- `src/main`：窗口生命周期、受限 IPC、文件对话框与串行文件存储。
- `src/preload`：通过 contextBridge 暴露逐项定义的桌面 API。
- `src/renderer`：React 界面及编辑状态。
- `src/shared`：数据类型、校验、搜索、字数与合并规则。
- `tests`：单元、组件、存储和真实 Electron 测试。

生产窗口关闭 Node 集成，启用上下文隔离、沙箱、CSP；拒绝外部导航、新窗口和权限申请。仅开发模式允许 Vite 注入的刷新脚本与样式。按 AGENTS.md，每个完成的代码修改批次经检查后提交 git commit。
