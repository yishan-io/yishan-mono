<p align="center">
  <img src="apps/desktop/src/assets/images/yishan-transparent.png" alt="Yishan logo" width="100" height="100" />
</p>

<h1 align="center">移山</h1>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Elastic--2.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/yishan-io/yishan-mono/actions/workflows/pr-unit-tests.yml"><img src="https://github.com/yishan-io/yishan-mono/actions/workflows/pr-unit-tests.yml/badge.svg" alt="PR Unit Tests" /></a>
  <a href="https://github.com/yishan-io/yishan-mono/actions/workflows/desktop-release.yml"><img src="https://github.com/yishan-io/yishan-mono/actions/workflows/desktop-release.yml/badge.svg" alt="Desktop Release" /></a>
  <a href="https://github.com/yishan-io/yishan-mono/stargazers"><img src="https://img.shields.io/github/stars/yishan-io/yishan-mono?style=social" alt="GitHub stars" /></a>
</p>

**专为并行开发打造的工作空间。**

AI 让并行开发变得前所未有的简单。但管理多条工作流仍然繁琐，这份负担最终还在你身上。移山改变了这一切。

<p align="center">
  <img src="https://raw.githubusercontent.com/yishan-io/yishan-mono/main/apps/landing/public/app.png" alt="移山：从零到多任务并行" width="100%" />
</p>

## 为什么需要移山？

工具还停留在串行时代，你的工作早已并行。

AI 助手让你能同时推进多件事，修 bug、重构模块、审查代码，全部并发进行。但每个任务分散在不同的终端、仓库或聊天窗口里。监控进度、来回切换、恢复上下文，这些负担全压在你身上。

移山为每个任务提供一个始终在线的工作空间。在它们之间随意切换，状态永不丢失。

## 核心功能

- **工作空间彼此隔离**：每个任务拥有独立的分支、终端和文件状态。并行工作互不干扰。
- **实时状态一目了然**：一个界面看尽所有任务状态：运行中、等待输入、已完成，无需逐个切终端。
- **随时暂停，随时续上**：开启一个任务后，中途随时切去处理更急的事，回来接着做，不用重来，一切原样保留。
- **跨工作空间共享上下文**：`.my-context` 将笔记、计划和交接记录附着在项目上，所有工作空间可见。拾起任何任务都无需从零重建上下文。
- **AI 会话内嵌在工作空间里**：AI 助手直接在工作空间内运行，紧挨着代码仓库和终端，而不是关掉上下文就消失的独立聊天窗口。

## 更多功能

- **团队协同**：团队成员间共享工作空间状态和主机资源。谁在跑什么、什么卡住了、谁负责哪块，不用去 Slack 里问。
- **自动驾驶**：按计划定时触发 AI 任务。代码审查、健康检查、周报汇总，在你专注其他事情时自动运转。
- **PR 状态不跳出**：在工作区内直接查看 Pull Request 的状态、CI 检查和 Review 进度。
- **语音输入**：免动手，直接口述指令和提示词。离开键盘时同样能用。

## 兼容你熟悉的工具

移山与你已在使用的 AI 命令行工具协同运作，OpenCode、Codex、Claude、Gemini、Cursor Agent、Pi 和 Copilot。

## 路线图

- 远程主机工作空间：在远程机器上启动工作流 *(开发中)*
- CLI + AI 工作流整合：从聊天或命令行创建多个工作空间 *(开发中)*
- 开发生命周期管理：从 Issue 到工作空间再到 PR 的完整流程 *(规划中)*
- 移动端远程控制：通过手机监控和操控工作空间 *(规划中)*

## 快速开始

**下载 macOS 版**请访问 [yishan.io](https://yishan.io)。

如需从源码构建和参与贡献，请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 链接

- [官网](https://yishan.io)
- [更新日志](https://github.com/yishan-io/yishan-mono/releases)
- [贡献指南](CONTRIBUTING.md)
- [许可证](LICENSE)
