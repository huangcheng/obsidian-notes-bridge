# <img src="assets/icon.png" alt="" width="32"> Notes Bridge

[English](README.md) · [简体中文](README.zh-CN.md)

一款 [Obsidian](https://obsidian.md) 插件，把笔记导出为可移植的纯 Markdown，并把你的库与 Bear、WPS 云笔记、有道云笔记、Flomo、印象笔记、WeKnora、腾讯 IMA 打通。每个集成都是一个独立启用、独立配置的一等公民客户端。

> 仅桌面端（`isDesktopOnly: true`）—— 多个 Provider 会调用 CLI 子进程。

![文件管理器右键子菜单：Notes Bridge 各项动作](docs/screenshots/context-menu.png)

## 为什么是一个插件

这些集成共用同一条流水线 —— 选择 → Markdown 变换 → Provider 派发 —— 而真正在意 Markdown 可移植性的人，往往同时用其中好几款应用。打包在一起避免了变换层重复实现，也让右键菜单只有一个统一入口。每个 Provider 都可以在设置里独立启用、配置与信任，没配置的就不会出现。

插件刻意只为这几款应用提供**一等公民客户端**，而不是一个"添加任意 MCP 服务器"的通用入口。新的 Provider 会以一等公民的方式逐步加入。

## 功能

### 导出为纯 Markdown

把 Obsidian 特有语法转成在哪里都能用的纯 Markdown：

- **Copy as pure Markdown** —— 把当前笔记变换后复制到剪贴板。
- **导出到文件夹** —— 把变换后的笔记写到可配置的导出目录。

#### 变换选项

| 选项 | 说明 | 默认 |
|--------|-------------|---------|
| 解析 `[[wikilinks]]` | 把双链转成标准 Markdown 链接 | 开 |
| 嵌入处理 | 如何处理 `![[embeds]]` | 替换为链接 |
| 拍平 callout | 把 `> [!note]` callout 转成普通块引用 | 开 |
| 去掉 frontmatter | 输出中删除 YAML frontmatter | 关 |
| 改写附件路径 | 图片 / 附件路径如何处理 | 相对于库 |

### 支持的应用

下列每个 Provider 都可以在 **Settings → Community plugins → Notes Bridge** 里独立启用与配置。

- **Bear** —— 通过 `bear://` x-callback-url 协议导出与导入（本地 IPC，不走网络）。
- **WPS 云笔记** —— 通过 WPS Note CLI 或你配置的 MCP 服务端导出。
- **有道云笔记** —— 通过官方 `youdaonote` CLI 导出与导入，CLI 用你的 API Key 调用有道 API。
- **Flomo** —— 通过 Flomo 官方的 streamable-HTTP MCP 服务导出（仅推送）。
- **印象笔记（Yinxiang）** —— 通过印象笔记 REST API 导出与导入。
- **WeKnora** —— 通过 REST API 导出到自托管或云端的 WeKnora 实例（仅推送）。
- **腾讯 IMA** —— 通过腾讯 IMA 官方 OpenAPI 导出（仅推送）。

### 统一的目标选择器

IMA、印象笔记、WeKnora、有道云笔记共用同一个 `FuzzySuggestModal` 选择器，用来挑选目标笔记本 / 文件夹 / 知识库 —— 不再需要粘贴原始 ID。点击 **Choose…** 从服务端或 CLI 加载列表，选中目标后插件会同时保存其 ID 与显示名称。点击 **Clear** 可回到默认位置。

### 设置里的体验优化

- **卡片头部开关** —— 不用展开卡片，直接在头部启用 / 禁用某个 Provider。
- **"配置不完整"徽标** —— 已启用但未配置完整的 Provider 会显示一条提示，说明它为何不出现在导出菜单；打开一个未配置的 Provider 时，卡片会自动展开并给出引导提示。
- **防溢出布局** —— 过长的目标名会截断并显示 tooltip，操作按钮在窄面板上也不会被裁切。

## 右键菜单与命令

在文件管理器里右键任意文件（或先多选再右键），就能在 **Notes Bridge** 子菜单里找到所有可用动作。只有已启用且配置完整的 Provider 才会出现。

| 命令 | 说明 |
|---------|-------------|
| Copy as pure Markdown | 变换当前笔记并复制到剪贴板 |
| Export current note as pure Markdown | 把当前笔记导出到文件夹 |
| Send active note to Bear | 把当前笔记派发到 Bear |
| Import from Bear | 通过 UUID 或链接从 Bear 导入笔记 |
| Send active note to WPS Cloud Note | 把当前笔记派发到已配置的 WPS Provider |
| Send active note to Youdao Note | 把当前笔记派发到已配置的有道 Provider |
| Send active note to Flomo | 把当前笔记作为 memo 派发到已配置的 Flomo Provider |
| Send active note to Yinxiang | 把当前笔记派发到已配置的印象笔记 Provider |
| Send active note to WeKnora | 把当前笔记派发到已配置的 WeKnora Provider |
| Send active note to IMA | 把当前笔记派发到已配置的 IMA Provider |

## 设置

入口：**Settings → Community plugins → Notes Bridge**。

- **导出文件夹** —— 导出笔记的目录（默认：`Exports`）。
- **导入文件夹** —— 导入笔记的目录（默认：`Imports`）。
- **并发数** —— 并行导出 worker 数量（默认：4）。
- **变换选项** —— 配置 Markdown 输出格式。
- **Providers** —— 在各自的可折叠卡片上启用、配置并测试每个 Provider。卡片头部带有启用开关；当某个 Provider 已启用但尚未满足菜单条件时，标题下方会出现"配置不完整"提示。

## 安装

### 通过 BRAT 安装（推荐，便于跟随 Beta 更新）

插件目前还没进官方社区市场。最方便的安装与持续更新方式是用 [BRAT（Beta Reviewers Auto-update Tool）](https://github.com/TfTHacker/obsidian42-brat)：

1. 在 **Settings → Community plugins → Browse** 安装 **BRAT** 并启用。
2. 打开 **Settings → BRAT → Add Beta plugin**，粘贴 `huangcheng/obsidian-notes-bridge`。
3. BRAT 会把最新 Release 下载到你的库里，并自动跟随后续版本更新。

关于自动更新和锁定到特定版本，见 [BRAT 插件文档](https://tfthacker.com/brat-plugins)。

### 从 GitHub Release 安装

1. 从 [最新 Release](https://github.com/huangcheng/obsidian-notes-bridge/releases) 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 把它们放进 `<你的库>/.obsidian/plugins/advanced-import-export/`。
3. 在 **Settings → Community plugins** 里启用插件。

### 从源码构建

```bash
git clone https://github.com/huangcheng/obsidian-notes-bridge.git
cd obsidian-notes-bridge
npm install
npm run build
```

把构建产物（`main.js`、`manifest.json`、`styles.css`）拷到你库里的插件目录即可。

## 隐私

- **零遥测。** 插件不会调用任何统计、追踪或"回家上报"接口。
- **凭据全部留在本地。** API Key 和 Provider 配置存在库内的插件数据文件（`.obsidian/plugins/advanced-import-export/data.json`），除非你主动触发了到所配置 Provider 的调用，否则不会离开你的机器。
- **网络调用范围严格随 Provider 配置而定。** 禁用某个 Provider，会停掉它所有的网络调用。
- **不会上传库内容**，除非是你主动导出到某个 Provider 的笔记。

### 出站地址

| Provider | 方向 | 数据去向 |
|---|---|---|
| Bear | 导出 + 导入 | `bear://` URL Scheme —— 本地 IPC，不走网络 |
| WPS 云笔记 | 导出 | 你配置的服务端 URL 或 CLI 二进制 |
| 有道云笔记 | 导出 + 导入 | 本地 `youdaonote` CLI → 有道 API（`mopen.163.com`），使用你的 API Key |
| Flomo | 导出（仅推送） | `https://flomoapp.com/mcp`，带 `Authorization: Bearer <你的 Token>` |
| 印象笔记 | 导出 + 导入 | `https://app.yinxiang.com`，带 `auth: <你的 Token>` |
| WeKnora | 导出（仅推送） | 你配置的 base URL，带 `X-API-Key` 头 |
| 腾讯 IMA | 导出（仅推送） | `https://ima.qq.com`，带 `ima-openapi-clientid` + `ima-openapi-apikey` 头 |

## 开发

```bash
npm install        # 安装依赖
npm run dev        # watch 模式，改动自动重新构建
npm run build      # 类型检查 + 生产构建
npm run lint       # 跑 ESLint
npm run test       # 跑测试套件
```

项目结构与如何新增 Provider，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，并遵守我们的 [行为准则](CODE_OF_CONDUCT.md)。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

采用 [0-BSD License](LICENSE) 授权。
