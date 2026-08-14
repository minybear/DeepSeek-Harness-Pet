# @minybear/dsh-plugin-finder

一个「找插件的插件」：给 DeepSeek Harness（DSH）加一个 `find_dsh_plugin` 工具，让 Agent 直接检索 [dsh.lanshuagent.com](https://dsh.lanshuagent.com) 插件中心，按关键词 / 分类搜索插件，并拿到可直接复制的安装命令。

## 它是怎么工作的

`dsh.lanshuagent.com` 是社区维护的 DSH 插件中心（「先看证据，再决定装不装」），它自己渲染的数据源就是 [`https://awesome-dsh-plugin.com/plugins.json`](https://awesome-dsh-plugin.com/plugins.json)（站点首页 RSC payload 里的 `sources.curated.url` 指向的就是它，数据源仓库是 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)）。

本插件是一个 **host 侧工具插件**：

- 安装后通过 `cordis.patch.yml` 把自己登记进 profile 的 host 组合（`dsh.profile.bundles`）。
- 启动时在 host 的 `tools` 注册表**全局层**注册 `find_dsh_plugin`，因此对所有 Agent / 预设可见。
- 首次调用拉取目录 JSON 并**内存缓存**（默认 5 分钟），后续调用秒回。
- 每次调用返回：目录元信息、分类列表（含数量）、命中数、以及匹配插件（名称 / 作者 / 分类 / 中英文简介 / GitHub 地址 / 安装命令）。

## 目录结构

```
lib/catalog.js     纯逻辑（Node 可测）：拉取 + 归一化 + 搜索 + 格式化
lib/index.js       host 侧插件：Config / inject / apply，注册 find_dsh_plugin 工具
cordis.patch.yml   自带的 bundle patch（dsh.bundle.patch），把插件登记进 host 组合
test/              单测（catalog 纯逻辑 + schema 契约）
```

## 安装

```powershell
# 在 dsh-plugin-finder 目录内运行（本地路径安装）
dsh plugin --profile web add .

# 或从 GitHub（发布后）
dsh plugin --profile web add github:minybear/dsh-plugin-finder

# 或从 npm（发布后）
dsh plugin --profile web add @minybear/dsh-plugin-finder
```

然后重启 `dsh web` 并刷新页面。`dsh plugin add` 内部 = `pnpm add` + 自动把声明了 `dsh.bundle` 的包加入 `dsh.profile.bundles`；重启时本包自带的 `cordis.patch.yml` 会把 `plugin-finder` 行登记进 host 组合。

> 工具是 host 侧的，所以对 `web` / 其它 profile 都生效；想只给某个 profile 装就把 `--profile web` 换成对应 profile 名。

## 用法（Agent 侧）

装好后，Agent 会多一个工具 `find_dsh_plugin`，例如：

```
"帮我找一个终端 UI 插件"
→ find_dsh_plugin({ query: "tui" })

"有哪些 tools 类插件？"
→ find_dsh_plugin({ category: "tools" })

"浏览全部插件"
→ find_dsh_plugin({})
```

参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `query` | string | 关键词，匹配名称 / 作者 / 分类 / 简介（中英文都行） |
| `category` | string | 分类过滤：`ui` `theme` `session` `memory` `tools` `workflow` `notify` `model` `dev` `fun` |
| `limit` | integer | 最多返回条数（1–30，默认 10） |

返回的每条结果都带 `install:` 命令，可直接交给 `dsh plugin add` 执行。

## 配置

可在 profile 的配置里覆盖（schemassty 校验）：

```yaml
plugin-finder:
  catalogUrl: https://awesome-dsh-plugin.com/plugins.json
  cacheTtlMs: 300000      # 目录缓存时长（毫秒）
  timeoutMs: 20000        # 工具协作超时预算（毫秒）
  defaultLimit: 10        # 默认返回条数
  maxLimit: 30            # 单次返回上限
```

## 测试

```powershell
npm test                         # 跑全部（catalog 纯逻辑 + schema 契约）
node test/catalog.test.mjs      # 纯逻辑（离线，无需依赖）
node test/schema.test.mjs       # 工具 schema 契约（@deepseek-ai/dsh-tools 可解析时运行，否则自动 skip）
```

## 卸载

```powershell
dsh plugin --profile web remove @minybear/dsh-plugin-finder
```
