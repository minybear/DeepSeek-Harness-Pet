# OpenAI Codex 自定义宠物（Custom Pet）包技术文件格式规范研究报告

> 研究方式：多轮 web_search 定位权威来源后，通过网络抓取提取原文全文（包括 openai/skills 官方契约文档、codexpet.xyz 规范页全文、codex-pet.org 文档页全文、openai/codex 仓库 Rust TUI 宠物模块源码、真实宠物包 Codie 的 zip 与 pet.json 实证）。
> 权威性分级：**官方** = openai/skills 或 openai/codex 源码；**社区** = codexpet.xyz / codex-pet.org / 各宠物仓库；**提案** = GitHub issue 中未合入的提议。
> 每条结论附来源 URL；无法从权威来源确认的字段标注"待确认"。

---

## 0. 结论速览

| 项目 | 结论 |
| --- | --- |
| 包结构 | 一个目录，仅 2 个必需文件：`pet.json` + `spritesheet.webp`，**没有独立的 atlas JSON 文件** |
| 安装位置 | `${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>/`（CODEX_HOME 未设置时回退 `~/.codex`） |
| V1 雪碧图 | **1536×1872**，8 列 × 9 行网格，每格 **192×208**，透明背景（RGBA），WebP 或 PNG |
| V2 雪碧图（社区记载） | **1536×2288**，8 列 × 11 行（9 个状态行 + 2 个 16 方向注视行），需 `pet.json` 声明 `spriteVersionNumber: 2` |
| 帧坐标 | 无 atlas JSON，帧矩形由固定网格隐式推导：`sprite_index = row × columns + column`（行优先），帧矩形 = `(col×W, row×H, W, H)` |
| 动画状态 | 9 个固定状态行：idle / running-right / running-left / waving / jumping / failed / waiting / running / review |
| 状态驱动 | 由应用活动事件驱动（running=工作中、waiting=等待输入、review=就绪/审查、failed=阻塞），无事件时回退 idle |
| 待确认项 | `spriteVersionNumber`（V2）字段在 openai/codex 开源 TUI 源码中未实现，桌面端闭源，无法从官方源码验证 |

---

## 1. 宠物包目录结构

### 1.1 官方契约（openai/skills）

来源：[openai/skills `codex-pet-contract.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md)

> Place files under:
> ```text
> ${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>/
> ├── pet.json
> └── spritesheet.webp
> ```
> The app loads custom pets from the folder name under `${CODEX_HOME:-$HOME/.codex}/pets/`.

- 目录名即宠物标识（folder name = on-disk identity），应用按文件夹名加载。
- `CODEX_HOME` 环境变量优先；未设置时回退到 `$HOME/.codex`。
- 官方契约只要求 **pet.json（manifest）** 和 **spritesheet.webp（透明动画图集）** 两个文件。

### 1.2 源码实证（openai/codex TUI）

来源：[openai/codex `codex-rs/tui/src/pets/model.rs`](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/model.rs)

自定义宠物目录为 `codex_home.join("pets").join(value)`，要求 `pet.json` 存在；另有**遗留兼容路径** `~/.codex/avatars/<id>/avatar.json`（旧版 avatar 目录，manifest 文件名是 `avatar.json`，格式相同）。加载逻辑优先级：

1. 显式路径（目录或 pet.json 路径）
2. `custom:<id>` 选择器 → `CODEX_HOME/pets/<id>/pet.json`
3. 内置目录 id（如 `codex`、`dewey`）→ 从 CDN 拉取
4. 否则按自定义宠物处理（`CODEX_HOME/pets/<id>/pet.json`）

来源：[openai/codex `codex-rs/tui/src/pets/picker.rs`](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/picker.rs) — `/pets` 选择器合并三路来源：内置目录宠物、合成"禁用"条目（id=`disabled`）、用户自定义宠物（扫描 `CODEX_HOME/pets/*/pet.json` 与 `CODEX_HOME/avatars/*/avatar.json`）。

### 1.3 社区站点口径（一致）

- [codexpet.xyz/llms-full.txt](https://codexpet.xyz/llms-full.txt)：`~/.codex/pets/<pet-name>/` 下 `pet.json` + `spritesheet.webp`。
- [codex-pet.org/llms.txt](https://codex-pet.org/llms.txt)：pet.json + spritesheet.webp，通常以 `.codex-pet.zip` 分发。
- 真实包实证：下载 [Codie 官方示例包 codie.zip](https://codexpet.xyz/downloads/codie.zip) 解压后为 `pet.json` + `spritesheet.webp`（外加 preview.png / contact-sheet.png 两个 QA/预览附属文件，非必需）。

> ⚠️ **没有 atlas JSON**：官方格式中不存在 atlas.json / frames.json 之类的外部帧坐标文件。帧坐标完全由固定网格隐式定义（见第 4 节）。任何社区工具生成的额外 JSON 文件都是工具自身的中间产物，Codex 应用不读取。

---

## 2. pet.json 完整字段 Schema

### 2.1 官方契约给出的最小形态

来源：[openai/skills `codex-pet-contract.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md)

```json
{
  "id": "pet-name",
  "displayName": "Pet Name",
  "description": "One short sentence.",
  "spritesheetPath": "spritesheet.webp"
}
```

### 2.2 权威实现（openai/codex Rust TUI `model.rs`，逐字段还原）

来源：[openai/codex `codex-rs/tui/src/pets/model.rs`](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/model.rs)（serde 反序列化结构体 `PetFile` 与 `AnimationSpec`）

| 字段 | 类型 | 含义 | 必填 | 默认值/回退规则 |
| --- | --- | --- | --- | --- |
| `id` | string | 宠物标识（选择器 id） | 否 | 缺省时用目录名；TUI 中自定义宠物选择器为 `custom:<id>`，加载后 `id` 变为 `custom-<id>` |
| `displayName` | string | 显示名 | 否 | 缺省时回退 `id` → 目录名 |
| `description` | string | 一句话描述 | 否 | 空字符串 |
| `spritesheetPath` | string | 雪碧图相对路径 | 否 | 缺省 `"spritesheet.webp"`；**必须为目录内相对路径**，绝对路径或 `..` 越界会被拒绝（"spritesheet path must stay inside …"） |
| `frame` | object | 帧网格覆写（`{ width, height, columns, rows }`，均为正整数 u32） | 否 | 默认 `192×208`、8 列、9 行；**网格必须精确铺满雪碧图**（`width×columns == 图宽` 且 `height×rows == 图高`），否则报错；总帧数 ≤ 256 |
| `animations` | object | 命名动画表：`{ "<动画名>": AnimationSpec }`，见下表 | 否 | 缺省时使用内置 9 状态默认动画表（见第 5 节） |
| `spriteVersionNumber` | integer | V2 版本号声明（=2 表示 1536×2288、11 行） | 否（V2 必须） | 仅社区文档记载，见"待确认"说明 |

**AnimationSpec 字段**（`animations.<name>` 的值）：

| 字段 | 类型 | 含义 | 必填 | 默认值 |
| --- | --- | --- | --- | --- |
| `frames` | number[] | 帧序列（**雪碧图全局帧索引**，行优先：`index = row×columns + col`） | 是（不能为空数组） | — |
| `fps` | number | 播放帧率（每帧时长 = 1/fps 秒） | 否 | `8.0`；合法范围 0 < fps ≤ 60，否则报错 |
| `loop` | boolean | 是否循环 | 否 | `true`（loop_start = 0）；`false` 时播完一次后跳转到 `fallback` |
| `fallback` | string | 单次播放结束后的回退动画名 | 否 | `"idle"`；必须存在于 animations（或默认表中），否则报错 |

校验规则（源码实证）：`frames` 索引必须 < 总帧数；`fps` 必须有限且 0 < fps ≤ 60；`fallback` 必须存在；每个动画至少一帧；`frame` 网格必须恰好覆盖雪碧图。

### 2.3 社区文档补充字段

- [codexpet.xyz/spec/](https://codexpet.xyz/spec/) 与 [中文版](https://codexpet.xyz/zh/spec/) 给出带 `spriteVersionNumber` 的形态：

```json
{
  "id": "codie",
  "displayName": "Codie",
  "description": "A tiny pixel robot companion for Codex Pet.",
  "spritesheetPath": "spritesheet.webp",
  "spriteVersionNumber": 2
}
```

- [codex-pet.org/codex-pet-json/](https://codex-pet.org/codex-pet-json/)：id 需小写简洁；上传器要求引用的动画文件命名为 `spritesheet.webp`；描述写一句具体的话；**gallery 标签不要放进 pet.json**（在 Studio 上传时另选）。

### 2.4 待确认项

- **`spriteVersionNumber`（V2 规格 1536×2288 / 8×11 / 16 方向）**：由 [codexpet.xyz/spec/](https://codexpet.xyz/spec/) 与社区生产文档 [CheshireMew/ip-studio `pet-production.md`](https://github.com/CheshireMew/ip-studio/blob/main/references/pet-production.md) 记载（要求 V2 必须精确 1536×2288 且声明 `spriteVersionNumber: 2`）。但 **openai/codex 开源 TUI 源码（main 分支）未实现该字段**，且 `validate_app_spritesheet_dimensions` 硬性要求 1536×1872。桌面端（Electron）闭源，无法从官方源码验证 V2 是否被官方桌面应用支持 → **待确认**。若以开源 TUI 为复刻基准，V1（1536×1872）是唯一被源码接受的形式。
- `name`/`species`/`breed`/`size`/`dimensions`/`states` 等字段**不存在**于官方 schema 中（用户问题中提到的这些字段名均未在任何权威来源出现，未编造）。

---

## 3. spritesheet.webp 雪碧图规格

### 3.1 V1（官方，9 状态）

来源：[openai/skills `codex-pet-contract.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md) + [animation-rows.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md)

| 属性 | 值 |
| --- | --- |
| 格式 | PNG 或 WebP（社区站点与 QA 要求 WebP / RGBA） |
| 尺寸 | **1536×1872**（= 192×8 × 208×9） |
| 网格 | **8 列 × 9 行** |
| 单格 | **192×208** |
| 背景 | 必须透明；未使用格完全透明 |
| 其它 | 不得有标签、gutter、边框、网格线、格外的阴影；不得添加额外帧 |

- webview 动画使用**固定行/列数的 CSS background-position** 渲染（来源：契约文档原文）。
- 每行从第 0 列起使用**连续的非空帧**播放；**行尾的空格被忽略**；每行至少 1 个非空帧（来源：[codexpet.xyz/llms-full.txt](https://codexpet.xyz/llms-full.txt)、[codexpet.xyz/spec/](https://codexpet.xyz/spec/)）。
- 透明像素不得残留 RGB 残值（[qa-rubric.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/qa-rubric.md)："Fully transparent atlas pixels do not retain non-zero RGB residue after export"）。
- 官方 QA 硬性要求精确 1536×1872（[qa-rubric.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/qa-rubric.md) "Exact 1536x1872 dimensions"）；openai/codex TUI 源码同样硬校验 1536×1872（`validate_app_spritesheet_dimensions`）。
- 社区站点 codexpet.xyz 声明"图集尺寸当前不做硬性拒绝"，但其 V1 校验规则同样写"V1 must be exactly 1536x1872"（[codexpet.xyz/spec/](https://codexpet.xyz/spec/)）——即 V1 仍以 1536×1872 为准。

**真实包实证**：Codie 官方包 spritesheet.webp 解析 WebP 头 = **1536×1872，VP8L（无损 RGBA WebP）**（本机实测；包来自 [codexpet.xyz/downloads/codie.zip](https://codexpet.xyz/downloads/codie.zip)）。

### 3.2 V2（社区记载，16 方向）

来源：[codexpet.xyz/spec/](https://codexpet.xyz/spec/)、[CheshireMew/ip-studio `pet-production.md`](https://github.com/CheshireMew/ip-studio/blob/main/references/pet-production.md)、[crafter-station/petdex README](https://raw.githubusercontent.com/crafter-station/petdex/master/README.md)

- 尺寸 **1536×2288**，网格 **8 列 × 11 行**，单格仍 192×208。
- 第 0–8 行 = 9 个标准状态；**第 9–10 行 = 16 个顺时针注视方向**（每行 8 格）。
- 方向顺序固定：第 9 行 = `000, 022.5, 045, 067.5, 090, 112.5, 135, 157.5`；第 10 行 = `180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5`。`000`=朝上、`090`=屏幕右、`180`=朝下、`270`=屏幕左；指针无方向时回退 `idle`（来源：ip-studio）。
- 必须声明 `spriteVersionNumber: 2`（[codexpet.xyz/spec/](https://codexpet.xyz/spec/)）。→ **V2 官方支持度待确认**（见 2.4）。

### 3.3 内容约束（官方 SKILL.md / qa-rubric）

来源：[openai/skills `hatch-pet/SKILL.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md)、[qa-rubric.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/qa-rubric.md)

- 形象需在 192×208 格内可读的紧凑全身剪影；九行间形象一致（脸、比例、材质、配色、道具）。
- 禁止：分离式特效（飘浮星星、速度线、残影）、投影/光晕/辉光、文字/标签/UI/可读 logo、与 chroma-key 相近的颜色、跨格裁切、格线。
- `idle` 必须平静低干扰（呼吸/眨眼/轻微起伏），第一帧可作减少动态模式的静态回退图。

---

## 4. Atlas（图集/帧坐标）规范

**结论：官方格式没有独立的 atlas JSON 文件。** 帧矩形由固定网格 + 行优先索引隐式定义（源码实证 [openai/codex `frames.rs`](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/frames.rs)）：

```rust
// frames.rs（节选，逻辑等价）
for row in 0..pet.rows {
    for column in 0..pet.columns {
        let index = row * pet.columns + column;          // 全局帧索引（行优先）
        let x = column * pet.frame_width;                // 帧矩形左边缘
        let y = row * pet.frame_height;                  // 帧矩形上边缘
        // crop (x, y, frame_width, frame_height)
    }
}
```

- **帧索引公式**：`sprite_index = row × columns + column`（行优先）。V1 下第 0 行第 0 列 = 0，第 8 行第 0 列 = 64（=8×8），与源码默认动画表的 `sprite_indices` 一致（如 `running` 行 7 → 帧 56..61，`review` 行 8 → 帧 64..69，测试实证 [model.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/model.rs)）。
- **帧矩形**：`(column×frame_width, row×frame_height, frame_width, frame_height)`，即左上角 (col×192, row×208)，宽 192、高 208。
- **命名约定**：网格内无命名概念；每帧只以行号/列号/全局索引寻址。官方组装脚本 [compose_atlas.py](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/scripts/compose_atlas.py) 按 `ROW_SPECS`（状态名 → 行号 → 帧数）把每行前 N 帧居中粘贴到对应格，居中公式：`left = column*192 + (192 - frame.width)//2`。
- **锚点/枢轴**：官方格式**无锚点（anchor/pivot）概念**。个别第三方壳（如 [fangbm/CodexPetDesk](https://github.com/fangbm/CodexPetDesk) 的 web widget）自行实现了 hover/drag 等交互，但不改变包格式。
- 想自定义几何只能通过 pet.json 的 `frame` 字段（width/height/columns/rows），且网格必须恰好覆盖雪碧图尺寸（源码硬校验）。

---

## 5. 动画/状态 → 帧序列映射

### 5.1 官方 9 状态行表

来源：[openai/skills `animation-rows.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md)（列 = 该行使用列范围；时长为"每帧 ms，末帧 ms"）：

| 行 | 状态 | 使用列 | 帧数 | 官方时长（animation-rows.md） | TUI 源码默认时长（model.rs `app_state_animation`） |
| --- | --- | --- | --- | --- | --- |
| 0 | `idle` | 0–5 | 6 | 280, 110, 110, 140, 140, 320 ms | 1680, 660, 660, 840, 840, 1920 ms（=md 值 ×6） |
| 1 | `running-right` | 0–7 | 8 | 120 ms ×7，末帧 220 ms | 120 ×7，末帧 220 |
| 2 | `running-left` | 0–7 | 8 | 120 ms ×7，末帧 220 ms | 120 ×7，末帧 220 |
| 3 | `waving` | 0–3 | 4 | 140 ms ×3，末帧 280 ms | 140 ×3，末帧 280 |
| 4 | `jumping` | 0–4 | 5 | 140 ms ×4，末帧 280 ms | 140 ×4，末帧 280 |
| 5 | `failed` | 0–7 | 8 | 140 ms ×7，末帧 240 ms | 140 ×7，末帧 240 |
| 6 | `waiting` | 0–5 | 6 | 150 ms ×5，末帧 260 ms | 150 ×5，末帧 260 |
| 7 | `running` | 0–5 | 6 | 120 ms ×5，末帧 220 ms | 120 ×5，末帧 220 |
| 8 | `review` | 0–5 | 6 | 150 ms ×5，末帧 280 ms | 150 ×5，末帧 280 |

- 每行**末帧之后（final used column 之后）的格子必须全透明**（animation-rows.md）。
- **注意差异**：官方 md 与 TUI 源码的 idle 时长相差 6 倍（md: 280/110/110/140/140/320；源码: 1680/660/660/840/840/1920）。以哪份为准取决于目标运行时；复刻桌面端时建议以 md 为基准、以源码为参考。其余行两处一致。

### 5.2 各状态语义（官方）

来源：[animation-rows.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md)、[hatch-pet/SKILL.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md)

- `idle`：平静低干扰的呼吸/眨眼循环；减少动态模式取第一帧。
- `running-right` / `running-left`：向屏幕右/左的移动循环（8 帧，须读出方向性；`running-left` 可由 `running-right` 逐格镜像派生，须保持时间顺序）。
- `waving`：打招呼/引起注意（清晰起手、抬手、收回）。
- `jumping`：蓄力→上升→顶点→下降→落稳。
- `failed`：错误/沮丧/泄气反应（可读但不嘈杂）。
- `waiting`：**阻塞等待用户输入/审批/帮助**的期待询问姿态（区别于 idle 与 review）。
- `running`：**工作中**——专注处理、思考、扫描、输入、用力（**不是脚跑步**；禁止慢跑/冲刺/抬膝/长步/摆臂/位移）。
- `review`：专注/检查/思考循环（审查状态）。

### 5.3 官方 TUI 源码的状态驱动（权威实现）

来源：[openai/codex `codex-rs/tui/src/pets/ambient.rs`](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/ambient.rs)

- 通知种类 `PetNotificationKind` 直接映射动画名：`Running→"running"`、`Waiting→"waiting"`、`Review→"review"`、`Failed→"failed"`；无通知时播放 `idle`。
- 状态标签：Running="Running"，Waiting="Needs input"，Review="Ready"，Failed="Blocked"。
- 状态存活期（超时回退 idle）：Running 3 分钟、Failed 1 小时、Waiting 24 小时、Review 7 天。
- 循环语义：`loop_start = Some(0)` 表示整段循环；`None` 表示播完一次后跳转 `fallback`。
- 默认工作状态动画（`app_state_animation`）实为"行帧序列 ×3 遍 + 追加 idle 帧"，`loop_start = 18`（即尾部 idle 段循环）——工作结束后自然沉淀回 idle。
- 别名（默认动画表同时注册）：`move_right`/`move_left`/`wave`/`bounce`/`sad` 分别对应行 1/2/3/4/5。
- 减少动态（`animations_enabled=false`）：固定显示 idle 第一帧，不调度后续帧。
- 帧缓存：雪碧图按格切出 PNG 存 `CODEX_HOME/cache/tui-pets/frame-cache/<pet-id>/<sha256-缓存键>/frames/frame_000.png…`（[frames.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/frames.rs)）。

### 5.4 社区对"agent 活动 → 宠物状态"的映射参考

- GitHub issue（提案，未合入）[openai/codex #20863 "Support configurable custom pet animation sequences and activity events"](https://github.com/openai/codex/issues/20863?plain=1)：指出当前应用把本地/云工作折叠为单一 `running` 状态；希望暴露 thinking / editing / edited / running(command) / ran(command completed) / review 等更细的活动态，并允许 pet.json 用 `animation` 字段自定义。**该提案尚未被官方采纳，属"待确认"的未来能力**。
- [danielkempe/clawdex `state-mapping.md`](https://github.com/danielkempe/clawdex/blob/main/docs/state-mapping.md)（社区，Claude Code 事件→宠物行）：SessionStart→waving、UserPromptSubmit→review、PreToolUse(编辑/执行)→running、PreToolUse(读/搜)→review、Notification(权限)→waiting、Stop→waving、failed 保留给终端级失败。`transient`（播完回 idle）/`sticky`（保持到下一个事件）/`release`（清锁回 idle）三种模式。

---

## 6. 与 Codex 的集成契约

### 6.1 发现与加载

- 自定义宠物：应用扫描 `${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>/`，按**文件夹名**识别宠物；读目录内 `pet.json` 解析 manifest，`spritesheetPath`（默认 `spritesheet.webp`）解析为目录内相对路径，越界即拒绝（源码 [model.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/model.rs)）。
- 选择器语法：TUI 中自定义宠物 id 前缀 `custom:`（`custom:<id>`），选择后持久化为 `config.tui_pet`（源码 [app/pets.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/app/pets.rs)、[picker.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/picker.rs)）；桌面端在设置 Appearance / Pets 中选择（[codexpet.xyz/llms-full.txt](https://codexpet.xyz/llms-full.txt)）。
- 内置宠物：不随应用打包本地雪碧图，首次使用时从 CDN `https://persistent.oaistatic.com/codex/pets/v1/<file>`（如 `dewey-spritesheet-v4.webp`）下载，校验尺寸后装入 `CODEX_HOME/cache/tui-pets/v1/assets/`；下载上限 4 MB（源码 [asset_pack.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/asset_pack.rs)）。
- 第三方应用（如 [claude-code-best/open-design](https://github.com/claude-code-best/open-design/blob/main/docs/codex-pets.md)）同样按 `${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/` 约定读取；manifest 每个字段都被防御性读取（缺省回退：目录名→显示名、空描述、`spritesheet.webp`→`.png`→`.gif`）。

### 6.2 安装流程（官方推荐）

来源：[codexpet.xyz/llms-full.txt](https://codexpet.xyz/llms-full.txt)、[hatch-pet/SKILL.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md)

1. 将 `pet.json` + `spritesheet.webp` 放入 `~/.codex/pets/<pet-name>/`（或经 hatch-pet 工作流生成后由脚本打包到该目录）。
2. 重启/重新打开 Codex。
3. 在设置 Appearance / Pets（桌面端）或 `/pets` 命令（TUI）中选择宠物。

### 6.3 宠物状态如何从 agent 运行状态驱动

- **桌面端（契约口径）**：应用把 agent 活动折叠为少量宠物状态——`running`（工作中）、`waiting`（等待用户输入/审批）、`review`（就绪/审查）、`failed`（阻塞），无活动时 `idle`（源码 [ambient.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/ambient.rs) 的 `PetNotificationKind` 是这一契约的可执行体现；[issue #20863](https://github.com/openai/codex/issues/20863?plain=1) 证实应用内部有更细的活动标签但宠物端只映射到这几个状态）。
- **方向性状态**：`running-right`/`running-left` 由宠物移动方向驱动（拖动宠物时）；`waving`/`jumping` 由交互（打招呼/庆祝）驱动。
- 播放规则：每行从第 0 列起连续非空帧，末尾空格忽略；`loop:true` 循环，`loop:false` 播完跳 `fallback`（默认 idle）。

---

## 7. 完整示例摘录

### 7.1 官方契约最小示例（原文）

来源：[openai/skills `codex-pet-contract.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md)

```json
{
  "id": "pet-name",
  "displayName": "Pet Name",
  "description": "One short sentence.",
  "spritesheetPath": "spritesheet.webp"
}
```

### 7.2 真实包：Codie（官网下载实证）

来源：<https://codexpet.xyz/pets/codie/>，包内 `pet.json` 原文（本机解压 codie.zip 提取）：

```json
{
  "id": "codie",
  "displayName": "Codie",
  "description": "A tiny pixel robot companion for Codex Pet.",
  "spritesheetPath": "spritesheet.webp"
}
```

同包 `spritesheet.webp` 实测 = 1536×1872 无损 WebP（VP8L）。

### 7.3 带 V2 声明（社区规范文档）

来源：[codexpet.xyz/spec/](https://codexpet.xyz/spec/)（V2 需 `spriteVersionNumber: 2`，1536×2288）

```json
{
  "id": "codie",
  "displayName": "Codie",
  "description": "A tiny pixel robot companion for Codex Pet.",
  "spritesheetPath": "spritesheet.webp",
  "spriteVersionNumber": 2
}
```

### 7.4 带自定义 frame 网格与 animations（openai/codex 源码测试用例，原文）

来源：[openai/codex `model.rs` 测试](https://github.com/openai/codex/blob/main/codex-rs/tui/src/pets/model.rs)（证明这两个可选字段的真实解析行为）：

```json
{
  "displayName": "Tall",
  "spritesheetPath": "spritesheet.webp",
  "frame": { "width": 384, "height": 104, "columns": 4, "rows": 18 }
}
```

```json
{
  "displayName": "Custom",
  "spritesheetPath": "spritesheet.webp",
  "animations": {
    "idle": { "frames": [0], "fps": 2.0, "loop": false, "fallback": "idle" },
    "wave": { "frames": [1], "loop": false, "fallback": "missing" }
  }
}
```

### 7.5 社区提案：`animation` 扩展字段（未合入，仅供参考）

来源：[openai/codex issue #20863](https://github.com/openai/codex/issues/20863?plain=1)（作者 hlky 的 PoC 提议形态，**非官方现行格式**）：

```json
{
  "displayName": "Datachan Extended",
  "description": "Custom pet with explicit animation behavior.",
  "spritesheetPath": "spritesheet.webp",
  "animation": {
    "autoDetectFrames": true,
    "idleSlowdown": 6,
    "states": {
      "idle":    { "row": 8, "durationMs": 150, "lastFrameDurationMs": 280 },
      "running": { "row": 7, "durationMs": 120, "lastFrameDurationMs": 220 },
      "review":  { "row": 0, "durationMs": 140, "lastFrameDurationMs": 320 }
    },
    "chains": {
      "idle": ["idle", "waving", "review"],
      "running": { "mode": "loop", "sequence": ["waving", "idle", "running-left", "running-right", "running"] }
    },
    "events": { "hover": "jumping" }
  }
}
```

> 提案要点：per-state row/frames/durationMs/lastFrameDurationMs/slowdown、链式序列（chains）、播放模式（idleFallback / loop / once）、事件映射（hover、drag）、更细活动态（thinking/editing/edited/running/ran/review）。全部为**待确认**的未来能力。

---

## 8. 复刻建议要点（供参考）

1. **最小兼容包** = `pet.json`（4 字段）+ `spritesheet.webp`（1536×1872、8×9、192×208、透明 RGBA）。
2. 帧坐标不要用外部 atlas JSON，直接按 `index = row×8 + col` 切图；如需兼容非标准网格，支持 pet.json `frame` 字段（width×columns 必须等于图宽）。
3. 状态机按 9 行固定表实现，默认时长采用 animation-rows.md 表；工作态播放"行 ×3 + idle 尾"或直接循环该行均可（参考 TUI 实现）。
4. 内置宠物可从 CDN 拉取，自定义宠物只读本地目录；路径安全上限制 spritesheetPath 为目录内相对路径。
5. V2（spriteVersionNumber: 2、11 行 16 方向）作为可选扩展实现，但需自行承担与官方开源 TUI 不兼容的风险。

---

## 附：主要来源清单

**官方**
- [openai/skills `codex-pet-contract.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md)
- [openai/skills `animation-rows.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md)
- [openai/skills `hatch-pet/SKILL.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md)
- [openai/skills `qa-rubric.md`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/qa-rubric.md)
- [openai/skills `compose_atlas.py`](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/scripts/compose_atlas.py)
- [openai/codex `codex-rs/tui/src/pets/`（model.rs / catalog.rs / frames.rs / ambient.rs / asset_pack.rs / picker.rs）](https://github.com/openai/codex/tree/main/codex-rs/tui/src/pets)
- [openai/codex issue #20863（动画自定义提案）](https://github.com/openai/codex/issues/20863?plain=1)

**社区站点**
- [codexpet.xyz/spec/](https://codexpet.xyz/spec/) · [中文 /zh/spec/](https://codexpet.xyz/zh/spec/) · [llms-full.txt](https://codexpet.xyz/llms-full.txt) · [llms.txt](https://codexpet.xyz/llms.txt) · [Codie 示例包](https://codexpet.xyz/downloads/codie.zip)
- [codex-pet.org/llms.txt](https://codex-pet.org/llms.txt) · [pet.json 格式](https://codex-pet.org/codex-pet-json/) · [spritesheet.webp 指南](https://codex-pet.org/spritesheet-webp/)

**社区实现/文档**
- [WenNinghan/yuexinmiao-codex-pet `CODEX_PET_SPEC.md`](https://github.com/WenNinghan/yuexinmiao-codex-pet/blob/main/docs/CODEX_PET_SPEC.md)
- [fangbm/CodexPetDesk](https://github.com/fangbm/CodexPetDesk)
- [danielkempe/clawdex `state-mapping.md`](https://github.com/danielkempe/clawdex/blob/main/docs/state-mapping.md)
- [CheshireMew/ip-studio `pet-production.md`](https://github.com/CheshireMew/ip-studio/blob/main/references/pet-production.md)
- [claude-code-best/open-design `codex-pets.md`](https://github.com/claude-code-best/open-design/blob/main/docs/codex-pets.md)
- [crafter-station/petdex README](https://raw.githubusercontent.com/crafter-station/petdex/master/README.md)
- [lencx/pet](https://github.com/lencx/pet)
