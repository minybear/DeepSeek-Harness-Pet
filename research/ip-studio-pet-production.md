# Codex v2 动态角色适配器

在 `SKILL.md` 已确认用户要把已锁定角色制作成 Codex 桌宠，并已进入共享动态角色流程后读取本文件。共同的身份真源、动作合同、整表直生、禁止局部拼接、无损预览和修正原则只由主入口选择的共同方法决定；本文件仅增加 Codex v2 固定状态、布局、方向盲审、成品目录和本机安装。

## 1. 最终产物

每只新桌宠使用 `spriteVersionNumber: 2`：

- 精灵表为透明 PNG 或 WebP，尺寸 `1536×2288`。
- 网格固定为 8 列 × 11 行，每格 `192×208`。
- 第 0–8 行是九组 Codex 应用状态。
- 第 9–10 行是十六个顺时针注视方向。
- 各标准状态未使用的格子保持全透明。
- 正式 Codex 宠物目录只放 `pet.json` 与 `spritesheet.webp`；完整角色快照、过程图和 QA 证据留在角色包的桌宠运行目录。
- 每次运行还保存并校验标准化 `motion-contract.json`。它把 Codex v2 表达为动态角色系统的一个固定适配器，不允许九种状态、十六方向或 8×11 布局成为其它平台的默认合同。

九组状态及帧数如下：

| 行 | 状态 | 使用列 | 画面含义 |
| --- | --- | --- | --- |
| 0 | `idle` | 0–5 | 安静呼吸、眨眼或轻微起伏；第一帧也是静态回退图 |
| 1 | `running-right` | 0–7 | 向屏幕右侧拖动时的移动循环 |
| 2 | `running-left` | 0–7 | 向屏幕左侧拖动时的移动循环 |
| 3 | `waving` | 0–3 | 友好招手或引起注意 |
| 4 | `jumping` | 0–4 | 蓄力、上升、顶点、下降和落稳 |
| 5 | `failed` | 0–7 | 受阻、失败或取消时的低落反应 |
| 6 | `waiting` | 0–5 | 等待用户批准、帮助或输入 |
| 7 | `running` | 0–5 | 正在处理任务，不是原地跑步 |
| 8 | `review` | 0–5 | 专注检查已经完成的结果 |

方向顺序固定为：

```text
第 9 行：000、022.5、045、067.5、090、112.5、135、157.5
第 10 行：180、202.5、225、247.5、270、292.5、315、337.5
```

`000` 表示朝上看，`090` 表示朝屏幕右侧看，`180` 表示朝下看，`270` 表示朝屏幕左侧看。正面中性状态不占用方向格，指针没有方向时由应用回退到 `idle`。

## 2. 从角色包适配，而不是重新发明角色

先调用工作区依赖加载器，并把返回的 Python 绝对路径用于本文件的所有命令。基础图、动作条和方向条都通过 `SKILL.md` 已经选择的同一个图像入口生成；本路径不再次选择 provider。确定性脚本只负责布局、抠图、拼装、检查和归档。

运行：

```text
"<workspace-python>" -B scripts/pet_kit.py prepare <character-kit>
```

`prepare` 会验证角色包，自动使用角色名、当前版本、完整角色档案和主参考图，生成桌宠运行目录、身份快照、布局辅助图、十三个视觉任务及各自提示词。默认目录为：

```text
<character-kit>/derivatives/codex-pet/<pet-id>/runs/rNNN/
```

用户不需要重新描述角色，也不需要填写 JSON。未指定桌宠名时使用角色名，未指定风格时继承角色档案的画法。用户提供的其它参考图可用重复的 `--reference` 加入；它们只补充当前桌宠生产，不覆盖角色档案。

准备完成后，`pet_request.json`、`pet-run-record.json` 和 `motion-contract.json` 必须引用同一合同哈希。`check --stage prepared` 会同时确认九个状态 clip、十六个静态方向 clip 和十一组 Codex 图集行；缺少合同的旧运行结构不再进入正常读取路径。

角色适配遵守以下顺序：

1. 保留主轮廓、脸部结构、颜色落点、纹样边界、服装连接、材质和全部标志物。
2. 让整只角色在 `192×208` 中仍能读清；缩小后无法辨认的纹理可以合并成较大色块。
3. 固定配件的几何、颜色、身体落点和安装方式保持不变；细绳、环、扣和链可以在不改变结构的前提下加粗，使连接在桌宠尺寸仍连续可见。
4. 像尾尖灯笼这样的独立配件继续作为独立配件摆动，但必须能沿“身体固定点 → 箍或扣 → 绳带 → 环 → 配件”看见完整受力路径，不画成无连接的漂浮装饰。
5. 若一个固定特征只有在改变身份含义、主要轮廓或安装方式后才能通过桌宠几何，先把这一个取舍交给用户；其它缩放和动作适配由 Agent 决定。

## 3. 视觉任务图

运行：

```text
"<workspace-python>" -B scripts/pet_kit.py ready <run-dir>
```

只生成 `ready_jobs` 中的任务。依赖顺序为：

```text
base
├─ idle
├─ running-right ─ running-left
├─ waving
├─ jumping
├─ failed
├─ waiting
├─ running
└─ review
   └─ look-cardinals
      └─ look-row-9
         └─ look-row-10
```

每次读取 `imagegen-jobs.json` 中该任务的 `prompt_file` 和全部 `input_images`。图片的 `role` 说明它是角色参考、布局辅助、标准动作参考还是方向连续性依据。布局辅助图只规定格数、间距和安全边距，最终结果中不能出现格线、标签或辅助色。

每个视觉任务只生成一个结果。可并行时最多同时处理三个彼此独立的动作条；基础图、四向锚点、第 9 行和第 10 行按依赖顺序处理。没有并行执行能力时按相同顺序串行完成，不把并行本身变成用户决策。

选定一个生成结果后实际打开它，确认角色身份、帧数、完整身体、纯色幕布、间距和边缘，再运行：

```text
"<workspace-python>" -B scripts/pet_kit.py accept-job <run-dir> \
  --job <job-id> \
  --source <selected-image> \
  --qa-note "<可见的通过依据>"
```

该命令复制正式输入、记录选择证据并推进任务状态。标准动作条会立即抽帧并执行结构检查；四向锚点和两条方向行会执行各自的确定性拼装检查。生成结果没有通过时，不标记任务完成，从同一档案、主参考图和任务提示重新生成；不从失败图继续变体。

## 4. 基础图与九组标准动作

`base` 是桌宠尺寸下的视觉基准，不替代角色主参考图。它必须是单角色、完整全身、居中、清楚轮廓、纯色幕布，无文字、场景、阴影、辉光和无连接装饰。接受 `base` 后，命令会建立 `<run-folder>/references/canonical-base.png`；之后每个动作条都同时读取角色主参考图和这张桌宠基准。

标准动作遵守下列可观察语义：

- `idle` 只做呼吸、眨眼、很小的头身起伏或材质摆动。六帧需要看得出细微变化，首尾接近，不能变成招手、工作或跳跃。
- `running-right` 和 `running-left` 通过身体、四肢、尾巴和已连接配件表现位移，面向对应屏幕方向，步态交替，不使用速度线、尘土或地面阴影。
- `waving` 只用爪、手、翼或肢体姿态表达招手，不画动作弧线、星星或符号。
- `jumping` 只用身体高度表现完整跳跃，不画落地阴影、尘土、冲击线或弹跳台。
- `failed` 用下垂姿态、闭眼或低落表情表达。泪、烟或星只在与身体轮廓接触、保持硬边且仍属于同一精灵时使用。
- `waiting` 是期待用户输入的询问姿态，和安静待机、检查结果区分开。
- `running` 表示 Agent 正在处理任务，可用专注姿势、思考、扫描或已有道具的工作动作；不画跑步、抬腿、冲刺或位移。
- `review` 用前倾、眨眼、眼神、头部角度或爪位表现检查；不临时增加放大镜、纸张、代码或 UI。

每个动作条保持同一角色尺度和基线。动作需要改变高度时只改变身体位置，不把角色忽大忽小。附属配件按档案的受力方式跟随或滞后，连接点不能跳位、翻面或穿过身体。

`running-right` 通过看图检查后，只有左右翻转不会改变非对称脸纹、文字、单侧配件、光向和安装意义时，才运行：

```text
"<workspace-python>" -B scripts/pet/derive_running_left_from_running_right.py \
  --run-dir <run-dir> \
  --confirm-appropriate-mirror \
  --decision-note "<翻转仍保持身份的具体原因>"
```

脚本逐格翻转并保留时间顺序。存在单侧配件、方向性符号或左右身份差异时，正常生成 `running-left`。

九组动作全部通过增量检查后，建立完整标准中间层：

```text
"<workspace-python>" -B scripts/pet/extract_strip_frames.py \
  --decoded-dir <run-dir>/decoded \
  --output-dir <run-dir>/frames \
  --states all \
  --method auto

"<workspace-python>" -B scripts/pet/inspect_frames.py \
  --frames-root <run-dir>/frames \
  --json-out <run-dir>/qa/review.json \
  --require-components

"<workspace-python>" -B scripts/pet/compose_atlas.py \
  --frames-root <run-dir>/frames \
  --output <run-dir>/final/spritesheet.png \
  --webp-output <run-dir>/final/spritesheet.webp

"<workspace-python>" -B scripts/pet/make_contact_sheet.py \
  <run-dir>/final/spritesheet.webp \
  --output <run-dir>/qa/contact-sheet.png

"<workspace-python>" -B scripts/pet/render_animation_previews.py \
  --frames-root <run-dir>/frames \
  --output-dir <run-dir>/qa/previews
```

实际打开标准总览和九个 GIF，GIF 只检查节奏与状态语义，颜色和透明边缘仍以 PNG、最终 WebP 图集和多底色总览为准。身份漂移、空帧、身体裁切、帧间缩放跳动、方向错误、步态倒放、几乎静止的循环或状态含义混淆都需要重做对应整行。若源动作条本身尺度稳定、跳动只来自逐帧裁切，可用 `--method stable-slots` 重新抽帧并在 `inspect_frames.py` 中增加 `--allow-stable-slots`；这是一项看过循环后的整格注册修正，不允许替换人物内部像素，也不是默认。

## 5. 十六个注视方向

标准动作通过后，Agent 根据角色真实构造写入 `<run-dir>/qa/look-mechanics.md`，内容至少说明：

- 哪个身体部位保持固定，通常是脚、底座、下躯干或自然着地点；
- 眼睛、眼睑、眉、头、颈、耳、毛发、上身和附肢中谁先指向目标，谁随后跟进；
- 眼睛是立体眼球、平面贴图、屏幕表情还是其它构造，以及它应如何运动；
- 每个佩戴、手持或悬挂配件的固定点、刚柔性、遮挡、领先或滞后关系；
- 上、右、下、左四个方向分别显示哪一侧身体、哪些特征被遮挡；
- 每 22.5 度允许移动的幅度，使相邻姿态形成均匀连续的圆周。

不能用整只角色旋转、倾斜、拉伸或仿射变形来伪造视线。人形和拟人角色通常由眼睛与眼睑先动，头颈和上身轻微跟随；大眼角色移动完整眼球结构，不在固定眼白上滑动孤立瞳孔；平面屏幕脸可以保持外壳不动，只重绘屏幕内特征。柔性尾巴、吊带和挂件保持身体固定点稳定，并以连续弧线滞后跟随。

先生成一个四格方向锚点条，顺序固定为 `000 上、090 屏幕右、180 下、270 屏幕左`。实际以正常桌宠尺寸检查四个方向；脸部角色用瞳孔、鼻尖、头部朝向相对头部中心的位置判断，非脸部角色使用它自然的指向部位。四个方向都明确后接受：

```text
"<workspace-python>" -B scripts/pet_kit.py accept-job <run-dir> \
  --job look-cardinals \
  --source <selected-strip> \
  --approve-cardinals \
  --qa-note "<四个方向的可见坐标依据>"
```

随后把这四种姿态作为方向含义真源，整行生成第 9 行；相邻格按 22.5 度均匀插值。第 9 行接受后，确定性脚本会把八个姿态用同一尺度、下身锚点和基线注册到正式格子。看过注册结果并确认没有反转、跳位、身份变化、配件断裂或错误象限后，再生成第 10 行。第 10 行同时读取四向锚点和已完成第 9 行，使 `157.5 → 180` 与 `337.5 → 000` 也只移动一步。

方向中的单格失败时，修正该整行的方向说明并重新生成完整八格行；不把单独修补的一格混进新的方向行。

## 6. 最终透明处理和确定性检查

动作条和方向条在抽帧时先使用同一套软遮罩处理：从画面边界识别幕布色区域，恢复角色轮廓的透明度，并在缩放前从半透明边缘反推出角色本色。它不能退回“与幕布色距离小于阈值就整像素删除”的硬切方式；那会把深浅不一的幕布残留在轮廓外，也会在缩放后形成彩色锯齿。

第 10 行接受后，再对完整 8×11 精灵表执行一次边缘颜色恢复，处理拼装和缩放新产生的半透明像素：

```text
"<workspace-python>" -B scripts/pet/despill_chroma_edges.py \
  <run-dir>/final/spritesheet-extended.png \
  --output <run-dir>/final/spritesheet-extended.png \
  --webp-output <run-dir>/final/spritesheet-extended.webp \
  --chroma-key <pet_request.json 中的 chroma_key.hex> \
  --json-out <run-dir>/qa/chroma-despill-extended.json

"<workspace-python>" -B scripts/pet/validate_atlas.py \
  <run-dir>/final/spritesheet-extended.webp \
  --json-out <run-dir>/final/validation-extended.json \
  --chroma-key <同一幕布色> \
  --require-v2
```

去色报告 `ok: true` 且 v2 校验通过后，继续查看包含棋盘格、深色、白色和高反差底色的总览。校验会同时识别接近精确幕布色的残留和较暗的同色系轮廓，不能只用与单一 RGB 值的距离判断。深浅背景都没有彩边后透明处理才算完成；如果失败，先从原始动作条重新构建遮罩，不在已经损坏的精灵表上反复涂色。

继续生成：

```text
"<workspace-python>" -B scripts/pet/make_contact_sheet.py \
  <run-dir>/final/spritesheet-extended.webp \
  --output <run-dir>/qa/contact-sheet-extended.png

"<workspace-python>" -B scripts/pet/make_direction_qa_sheet.py \
  <run-dir>/final/spritesheet-extended.webp \
  --output <run-dir>/qa/look-directions.png

"<workspace-python>" -B scripts/pet/make_direction_blind_qa_sheet.py \
  <run-dir>/final/spritesheet-extended.webp \
  --output <run-dir>/qa/direction-blind-pairs.png \
  --answer-key <run-dir>/qa/direction-blind-answer-key.json

"<workspace-python>" -B scripts/pet/measure_direction_continuity.py \
  <run-dir>/final/spritesheet-extended.webp \
  --json-out <run-dir>/qa/look-continuity.json
```

## 7. 方向盲审和最终看图

把 `qa/direction-blind-pairs.png` 分别交给三个没有看过方向标签、提示词、答案或彼此结论的独立看图执行者。每一行只按图中指定的水平轴或垂直轴，把 A、B 分别判断为 `screen-left`、`screen-right`、`up`、`down` 或 `ambiguous`。三个结果分别写入 `direction-blind-verdicts-1.json` 至 `-3.json`，再运行：

```text
"<workspace-python>" -B scripts/pet/combine_direction_blind_verdicts.py \
  --verdicts <run-dir>/qa/direction-blind-verdicts-1.json \
  --verdicts <run-dir>/qa/direction-blind-verdicts-2.json \
  --verdicts <run-dir>/qa/direction-blind-verdicts-3.json \
  --json-out <run-dir>/qa/direction-blind-verdicts.json

"<workspace-python>" -B scripts/pet/validate_direction_blind_verdicts.py \
  --answer-key <run-dir>/qa/direction-blind-answer-key.json \
  --verdicts <run-dir>/qa/direction-blind-verdicts.json \
  --json-out <run-dir>/qa/direction-blind-validation.json
```

四个正方向是硬门槛；任何错误或无法判断都要重做包含它的方向行。中间方向的盲审分歧先作为警告，再结合带标签的正常尺寸循环判断；只有错误象限、方向反转、明显跳位、身份漂移、缩放跳动、配件断裂、透明孔洞或裁切才构成失败。没有独立看图执行能力时，不伪造三份结论；由用户查看方向盲审图是唯一回退方式。

独立最终看图执行者同时查看标准总览、最终总览、方向图、九个 GIF、结构检查、方向盲审和连续性报告。它确认十一行是同一角色、九种状态语义清楚、十六方向连续且全部正方向明确。Agent 把结果保存为：

```json
{
  "ok": true,
  "visual_qa": "pass",
  "reviewer": "independent worker or explicit user inspection",
  "qa_note": "可见的整体通过依据",
  "warnings": []
}
```

同时保存 `qa/direction-semantics.json`：

```json
{
  "ok": true,
  "directions": [
    {
      "direction": "000",
      "expected": "up",
      "verdict": "pass",
      "observed": "正常尺寸下实际可见方向",
      "reason": "眼睛、头部、身体或配件的坐标依据"
    }
  ]
}
```

数组按固定顺序包含全部十六项。正方向只能是 `pass`；中间方向可在整体循环明确时记为 `warning`，不能留下 `fail`。

## 8. 修正策略

每次失败先归到最早的真实原因：动作语义、身份漂移、源动作条边缘、连接部件、抽帧、幕布、方向连续性或最终看图。确定性错误先用对应脚本修正；源图本身错误才重新生图。

已接受任务在后续总览、GIF、方向图或盲审中被否决时，使用原来的 `accept-job` 命令并增加 `--replace-complete`。`pet_kit.py` 会先把旧任务、所有依赖它的后续任务及失效产物移入 `history/pet-job-replacements/`，再接受替换图；不手工改任务状态，也不把旧图集当成新结果继续使用。已经 `finalize` 的运行不原位换图，应从当前锁定角色新建一次桌宠运行。

- 标准动作失败时重做最小的完整动作行。
- 四向锚点只有一个方向失败时，可先单独重做该锚点，再重新组成批准的四向条。
- 正式方向行任何一格失败时重做包含它的完整八格行。
- 同一根因连续出现两次时停止微调同一提示词，改用更明确的四向姿态、简化动作幅度、加粗连接件、减少桌宠尺寸无法保留的非身份纹理，或调整确定性抽帧方法。
- 修正只有在减少失败且没有破坏已经通过的身份、动作或方向时才算推进。

## 9. 成品目录与安装

全部视觉与确定性检查通过后运行：

```text
"<workspace-python>" -B scripts/pet_kit.py finalize <run-dir>
"<workspace-python>" -B scripts/pet_kit.py check <run-dir> --stage final
```

`finalize` 在写入成品前重新验证角色快照、标准化动态合同、十三个视觉任务、九个 GIF、8×11 精灵表、去色、标准动作、方向语义、三份盲审和独立最终看图。通过后生成：

```text
<run-dir>/package/<pet-id>/
├── pet.json
└── spritesheet.webp
```

用户要求制作可直接使用的 Codex 桌宠时，检查通过后安装：

```text
"<workspace-python>" -B scripts/pet_kit.py install <run-dir>
```

若相同内容已经安装，命令直接报告已存在。若同一 `pet-id` 已被其它内容占用，只把“是否替换现有宠物”交给用户；获批后增加 `--replace-installed`，旧目录会先移动到 Codex 宠物目录内的 `.ip-studio-backups/`，再安装新版本。

安装完成后，用户只需要重启或重新打开 Codex，并在设置的宠物选项中启用它。Agent 展示最终总览图、至少一项动作预览、宠物名、角色版本、运行目录和安装目录；满足当前桌宠请求后停止，不自动扩展为 Windows 独立桌宠、Live2D、视频或其它动画产品。
