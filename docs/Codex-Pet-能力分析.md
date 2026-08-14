# Codex「Pets」能力与格式 — 复刻调研（定稿）

> 目的：为复刻一个 Codex pet 插件做前置调研。本文整合三个调研线程（功能能力 / 包技术格式 / 加载方式与生态），所有结论附来源；权威性分级：**官方** = openai/skills 或 openai/codex 源码，**社区** = codexpet.xyz / codex-pet.org / 各宠物仓库，**提案** = 未合入的 GitHub issue。无法确认处标注「待确认」。

---

## 1. 一句话理解

Codex Pets 是 OpenAI 在 **Codex 桌面版** 中加入的「桌面电子宠物」：一只常驻窗口的小动画精灵，**由 agent 运行状态实时驱动**（思考/执行/等待/报错/完成），本质是一个「任务状态可视化组件（real-time task overlay）」，把盯日志的负担人格化为看一只宠物在干什么。

- 管理命令：`/pet`（唤起/管理宠物，[issue #20836](https://github.com/openai/codex/issues/20836) 标题即证据）、`/goal`（设定目标）。
- CLI 官方无内置宠物；社区用第三方「状态镜像」工具给 CLI 加宠物。
- 时间：2026 年 5 月前后上线。

---

## 2. 能力清单

### 2.1 形态（forms / species）
- 内置约 **8 种官方宠物**（[aihot.virxact.com](https://aihot.virxact.com/items/cmonlffqk0h1msll9kwoy6lps)），支持自定义。
- 具体 8 个官方名单「待确认」（调研中的能力子任务未返回前先标注；常见被提及物种：cat/dog/axolotl/duck/robot/capybara/otter/dragon）。
- **孵化机制**：据称「依使用语言孵化」——按你使用的编程语言/使用习惯孵化出对应形态。

### 2.2 状态（states）— 权威：9 个动画状态行
来源：[openai/skills `animation-rows.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md)

| 行 | 状态 | 语义 | 帧数 |
| --- | --- | --- | --- |
| 0 | `idle` | 平静呼吸/眨眼循环（低干扰） | 6 |
| 1 | `running-right` | 向右移动 | 8 |
| 2 | `running-left` | 向左移动 | 8 |
| 3 | `waving` | 打招呼/引起注意 | 4 |
| 4 | `jumping` | 蓄力→上升→顶点→下降→落稳（庆祝） | 5 |
| 5 | `failed` | 错误/沮丧/泄气 | 8 |
| 6 | `waiting` | **阻塞等待用户输入/审批/帮助** | 6 |
| 7 | `running` | **工作中**（专注处理/思考/扫描，非跑步） | 6 |
| 8 | `review` | 专注/检查/审查 | 6 |

### 2.3 与 agent 状态的联动（核心价值）
来源：[openai/codex `ambient.rs`](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/ambient.rs)

- 通知种类 `PetNotificationKind` 直接映射动画：`Running→"running"`、`Waiting→"waiting"`、`Review→"review"`、`Failed→"failed"`；无通知时 `idle`。
- 状态标签：Running="Running"、Waiting="Needs input"、Review="Ready"、Failed="Blocked"。
- 状态存活期（超时回退 idle）：Running 3min / Failed 1h / Waiting 24h / Review 7d。
- 移动方向驱动 `running-right`/`running-left`（拖动时）；`waving`/`jumping` 由交互（打招呼/庆祝）驱动。
- 减少动态模式：固定显示 idle 第一帧。

> 社区对「活动→状态」的更细映射（Claude Code 事件）见 [clawdex `state-mapping.md`](https://github.com/danielkempe/clawdex/blob/main/docs/state-mapping.md)：UserPromptSubmit→review、编辑/执行→running、读/搜→review、权限通知→waiting、Stop→waving；`transient`/`sticky`/`release` 三种模式。官方 [issue #20863](https://github.com/openai/codex/issues/20863) 提议更细活动态（thinking/editing/ran 等）但**未合入**。

---

## 3. 包技术格式（权威，可复刻）

### 3.1 目录结构（仅 2 个必需文件，**无独立 atlas JSON**）
来源：[`codex-pet-contract.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md)

```text
${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>/
├── pet.json            # manifest
└── spritesheet.webp    # 透明动画图集
```

- 目录名即宠物标识；应用按文件夹名加载。

### 3.2 pet.json 字段 schema
来源：[openai/codex `pets/model.rs`](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/model.rs)（serde 结构体逐字段还原，比社区文档更权威）

| 字段 | 类型 | 必填 | 默认/回退 |
| --- | --- | --- | --- |
| `id` | string | 否 | 目录名 |
| `displayName` | string | 否 | `id` → 目录名 |
| `description` | string | 否 | 空 |
| `spritesheetPath` | string | 否 | `"spritesheet.webp"`（必须目录内相对路径，越界拒绝） |
| `frame` | {width,height,columns,rows} | 否 | 默认 192×208、8 列 9 行；须精确铺满图 |
| `animations` | {名称: AnimationSpec} | 否 | 缺省用内置 9 状态默认表 |
| `spriteVersionNumber` | integer | 否 | V2 声明（=2）；**官方 TUI 源码未实现，待确认** |

**AnimationSpec**（`animations.<name>`）：
| 字段 | 类型 | 必填 | 默认 |
| --- | --- | --- | --- |
| `frames` | number[]（全局帧索引，行优先） | 是 | — |
| `fps` | number | 否 | 8.0（0<fps≤60） |
| `loop` | boolean | 否 | true |
| `fallback` | string | 否 | "idle" |

最小示例（官方契约原文）：
```json
{ "id": "pet-name", "displayName": "Pet Name",
  "description": "One short sentence.", "spritesheetPath": "spritesheet.webp" }
```
带自定义帧网格/动画（源码测试用例原文）：
```json
{ "displayName": "Tall", "spritesheetPath": "spritesheet.webp",
  "frame": { "width": 384, "height": 104, "columns": 4, "rows": 18 } }
{ "displayName": "Custom", "spritesheetPath": "spritesheet.webp",
  "animations": { "idle": { "frames": [0], "fps": 2.0, "loop": false, "fallback": "idle" } } }
```

### 3.3 spritesheet 规格（V1 官方）
| 属性 | 值 |
| --- | --- |
| 尺寸 | **1536×1872**（=192×8 × 208×9） |
| 网格 | 8 列 × 9 行，单格 192×208 |
| 格式 | WebP 或 PNG，透明背景（RGBA） |
| 约束 | 不得有标签/网格线/阴影/额外帧；透明像素 RGB 残留须为 0 |

- 帧坐标**由固定网格隐式推导**：`sprite_index = row × columns + column`（行优先），帧矩形 = `(col×W, row×H, W, H)`。
- 每行从第 0 列起连续非空帧播放，行尾空格忽略；每行至少 1 帧。
- V2（社区记载）：1536×2288、8×11 行（第 9–10 行为 16 个顺时针注视方向），需 `spriteVersionNumber: 2` → **官方支持度待确认**。

### 3.4 各状态官方逐帧时长（`animation-rows.md`，单位 ms/帧，末帧另计）
idle: 280/110/110/140/140/320 · running-right/left: 120×7+220 · waving: 140×3+280 · jumping: 140×4+280 · failed: 140×7+240 · waiting: 150×5+260 · running: 120×5+220 · review: 150×5+280

---

## 4. 加载/安装

1. 官方生成器：`openai/skills` 的 **hatch-pet** skill（[SKILL.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md)）程序化生成 spritesheet + pet.json。
2. 手动：放入 `${CODEX_HOME:-$HOME/.codex}/pets/<name>/` → 完全重启应用 → 设置 Appearance/Pets（桌面端）或 `/pets`（TUI）选择。
3. 一键：`npx petdex install <名>`、[codex-pet-cli](https://www.npmjs.com/package/codex-pet-cli)、`install-pet.sh` 等。
4. 常见坑：透明背景、webp 编码、帧等尺寸、帧数/帧率匹配、命名小写、Windows WSL 后端不显示、装完要完全重启。

---

## 5. 社区生态（节选）

- 管理器/安装：petdex、CodexPetDesk、codex-pet-cli、codexpethub
- 生成器/skill：hatch-pet（官方）、codex-pet-director、Codex-Pet-Skill、codex-pet-creation-guide
- 渲染参考：codex-pets-react（React 封装）、openclaw-tamagotchi（Tauri 状态机）、workbuddy-buddy
- 规范站：codexpet.xyz（spec/troubleshooting）、codex-pet.org（spritesheet 指南）
- 完整清单见 `codex-pets-research.md` 与 `research/codex-pet-format-report.md`。

---

## 6. 复刻要点（面向 DSH 客户端插件）

1. **包格式**：`pet.json`（4 基础字段 + 可选 frame/animations）+ `spritesheet.webp`（1536×1872、8×9、192×208、透明）。帧坐标按 `index = row×8 + col` 切图，不引入外部 atlas。
2. **状态机**：9 行固定表；状态驱动 = running（工作）/ waiting（等待输入）/ review（就绪）/ failed（阻塞）/ idle（默认）+ 交互态（waving/jumping）。
3. **DSH 侧映射**（本插件的核心）：DSH 会话 `SessionSummary` 提供 `running` / `pendingInteraction` / `completed` → 映射到 running / waiting / 庆祝(idle) ；`ConversationSnapshot.lastAgentError` → failed。
4. 渲染：`shell.overlay` 槽（帧级浮动层，可点透），CSS background-position 步进帧动画。
