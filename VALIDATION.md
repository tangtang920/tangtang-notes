# 桌面改造验证记录

日期：2026-09-30。环境：macOS 26.4、Apple Silicon arm64、Node.js 24.19.0、pnpm 11.19.0、Electron 44.5.1。

## 本机已验证

- TypeScript 严格类型检查及生产构建通过。
- 冻结锁文件离线安装通过；CI YAML 可解析，包含 4 个系统/架构任务。
- Vitest：22 项单元、React 组件和真实临时目录存储测试全部通过。
- Playwright：10 项真实 Electron 功能测试全部通过，覆盖增删改查、字数、纯文本、主题、菜单与快捷键、JSON 合并与导出、重启、连续输入后关闭、保存失败重试、损坏文件保护、非法保存输入、弹窗阻止、单实例、macOS 窗口重新激活以及明确放弃后退出。
- 打包后的 macOS arm64 应用：离线启动、新建编辑、主题保存和重新启动恢复通过。
- 已生成 `dist/tangtang-notes-1.0.0-mac-arm64.dmg` 与 `dist/tangtang-notes-1.0.0-mac-x64.dmg`；两者均通过 `hdiutil verify` 的磁盘镜像完整性校验。
- 检查两架构 `app.asar` 内的主进程、preload、入口 HTML、CSS 和 JavaScript，与本次生产构建逐字节一致。
- 已查看真实 Electron 的浅色、深色及窄窗口截图；自动化验证无水平溢出，并生成打包界面截图。
- 依赖首次下载出现网络中断，改用可重试下载并对照 Electron npm 包中的官方 SHA-256 校验。未关闭 TLS 或跳过校验。
- Linux CI 辅助脚本通过 `bash -n` 语法检查。

## 当前环境无法完成的验证

- macOS x64 的启动测试已尝试，但本机缺少 Rosetta，进程启动返回系统错误 -86。Intel DMG 已生成并通过完整性校验，运行验证交由 Intel macOS CI。
- Windows x64 NSIS 和 Linux x64 AppImage 的打包及运行测试未在本机执行；已提供对应系统的 CI 任务及打包命令。仓库没有 Git 远程地址，本次没有提交到 GitHub 或触发 CI。
- 已验证中文文本连续输入及组合输入事件处理；原生拼音候选窗和系统输入法切换尚未实测，因为 Computer Use 返回未授予界面控制权限。未使用其他技术绕过该权限。
- 原生文件对话框的自动化测试替换其选择结果，真实文件读写和错误处理均有验证；人工选择对话框路径尚未实测。
- 未执行签名、公证、正式发布或各系统安装器的实际安装流程。Apple Silicon 冒烟测试启动的是安装包对应的已打包应用目录。

## 复验入口

见 README 的测试与打包命令。真实窗口报告分别保存在 `playwright-report/electron/`、`playwright-report/packaged/`，日志和截图保存在对应的 `test-results` 子目录。所有自动化测试均使用隔离数据目录，不读取或改写用户真实笔记。
