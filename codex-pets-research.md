# Codex 自定义宠物（Pets）调研报告：安装方式、官方 Skill 与社区生态

> 调研目的：搞清楚如何把自定义 Codex 宠物安装/加载进 Codex（CLI 或桌面版），以及社区现有的工具、生成器和示例项目，为复刻做准备。
> 调研方式：多轮中英文 web_search（30 轮左右），所有结论附来源 URL；无法从搜索摘要确认的细节标注 **待确认**。

---

## 0. 关键结论速览

| 问题 | 结论 |
|---|---|
| 官方宠物功能在哪个端 | **Codex 桌面版（Codex App）**，非 CLI。内置约 8 种官方宠物，支持自定义 |
| 自定义宠物的核心文件 | `pet.json`（元数据+动画定义）+ `spritesheet.webp`（动画精灵图集），可选 `preview.png` |
| 安装方式 | ① 手动把宠物包放进 pets 目录并重启应用；② 用社区 CLI（petdex / codex-pet-cli）一键安装；③ 用 `install-pet.sh` 等脚本 |
| 官方生成器 | `openai/skills` 仓库的 **hatch-pet** skill（`.curated/hatch-pet`），程序化生成 spritesheet + pet.json |
| CLI 有没有宠物 | 官方 CLI **没有内置宠物**；社区通过第三方桌面宠物（Hopet、OpenPet、agent-pets 等）给 CLI 会话加宠物 |
| 常见坑 | 透明背景、webp 编码、帧尺寸一致、帧数/帧率、命名、WSL 后端不显示等 |

---

## 1. 安装/加载自定义 pet 的具体方式

### 1.1 前提：宠物功能属于 Codex 桌面版

- OpenAI 于 2026 年 5 月前后为 Codex 桌面应用加入 Pets 功能（动画小宠物常驻桌面，实时反映任务状态）。报道来源：
  - [OpenAI’s Codex now has a tiny AI pet that keeps you updated while you code（Digital Trends）](https://www.digitaltrends.com/computing/openais-codex-now-has-a-tiny-ai-pet-that-keeps-you-updated-while-you-code/)
  - [OpenAI Adds Animated AI Pets to Codex Coding App（ExtremeTech）](https://www.extremetech.com/computing/openai-adds-animated-ai-pets-to-codex-coding-app)
  - [OpenAI Codex gets Pets feature with real-time task overlay（FoneArena）](https://www.fonearena.com/blog/481584/openai-codex-pets-real-time-task-overlay.html)
  - 中文报道：[OpenAI Codex 推出宠物模式（ithome）](https://www.ithome.com/0/945/989.htm)、[腾讯云开发者社区教程](https://cloud.tencent.com.cn/developer/article/2690113?policyId=1004)、[InfoQ 体验文](https://xie.infoq.cn/article/2a762b8c1050c00e4ab65444f)
- 内置宠物数量：社区文章提到"内置 8 种宠物，支持自定义"（[aihot.virxact.com](https://aihot.virxact.com/items/cmonlffqk0h1msll9kwoy6lps)，**待确认** 官方精确数量）。
- openai/codex 仓库中的 issue 也证明 `/pet` 是桌面版命令：
  - [Codex Desktop /pet is sent as a normal chat message instead of triggering pet command · Issue #20836 · openai/codex](https://github.com/openai/codex/issues/20836)
  - [Support configurable custom pet animation sequences and activity events · Issue #20863 · openai/codex](https://github.com/openai/codex/issues/20863)

### 1.2 三种安装路径（社区通行做法）

**方式 A：手动放置宠物包目录**
1. 准备一个宠物包目录（内含 `pet.json` + `spritesheet.webp`，见第 4 节）；
2. 将该目录放入 Codex 桌面应用读取的 pets 目录（社区普遍指向 `~/.codex/pets` 或应用数据目录下的 pets 子目录——**具体绝对路径待确认**，Windows 下可能在 `%APPDATA%` 下，macOS 下可能在 `~/Library/Application Support` 下；不同教程表述不一）；
3. 完全退出并重启 Codex 桌面应用；
4. 在应用内宠物面板/设置里切换到新宠物。
- 参考教程：[LINUX DO：Codex 桌面端宠物使用教程](https://linux.do/t/topic/2143854/2)、[CSDN：Codex 自定义宠物形象实战](https://blog.csdn.net/weixin_49263546/article/details/162605740)、[CSDN：Codex 更换桌面宠物教程](https://blog.csdn.net/weixin_48093827/article/details/161645370)、[技术站：codex 添加自定义宠物](https://jishuzhan.net/article/2078347828605886466)

**方式 B：社区 CLI 一键安装（最省事）**
- **petdex**：`npx petdex install <pet 名>` 之类的一条命令把宠物装进对应工具（Codex / Claude Code / OpenCode / Gemini CLI）的目录（[petdex README](https://github.com/crafter-station/petdex/blob/main/README.md)、[petdex-cli README](https://github.com/crafter-station/petdex/blob/main/packages/petdex-cli/README.md)、[npm petdex](https://www.npmjs.com/package/petdex)）。
- **codex-pet-cli**（npm 包）：Codex 宠物 CLI 工具（[npm](https://www.npmjs.com/package/codex-pet-cli)、[Socket 安全分析](https://socket.dev/npm/package/codex-pet-cli)）。
- 新版 Codex 还出现了 "one-curl Petdex installs"（一条 curl 装宠物）和 `/hatch` 命令（[AI Primer：Codex adds `/hatch` pets, in-pet chat replies, and one-curl Petdex installs](https://www.ai-primer.com/engineer/stories/codex-adds-hatch-pets-chat-replies-and-petdex-installs)，**待确认** 具体版本号与命令语法）。

**方式 C：脚本安装**
- awesome-codex-pet 仓库提供 `scripts/install-pet.sh` 一键安装脚本（[raw](https://raw.githubusercontent.com/legeling/awesome-codex-pet/main/scripts/install-pet.sh)），社区画廊页也提供"one-command installation"（[awesome-codex-pet](https://github.com/legeling/awesome-codex-pet)）。

### 1.3 是否有 `/pet` 命令、配置项、环境变量

- `/pet` 命令：**存在**。证据是 openai/codex Issue #20836 的标题——"Codex Desktop `/pet` is sent as a normal chat message instead of triggering pet command"（即 `/pet` 本应触发宠物命令，因 bug 被当作普通消息发送）。说明桌面版在聊天输入框中输入 `/pet` 可触发宠物相关命令（具体子命令**待确认**，推测与宠物面板/切换有关）。
- 配置项/环境变量：未在搜索结果中找到官方文档化的配置项或环境变量清单。`CODECX_*` 类环境变量、`config.toml` 里是否含 pets 字段 **待确认**。社区安装工具实际写入的位置就是宠物读取目录，未发现需要设置环境变量的情况。
- 官方 Settings 页面：Codex App 有 Settings 文档页（[Settings – Codex app | OpenAI Developers](https://developers.openai.com/codex/app/settings)），但宠物目录的具体配置项未在摘要中体现，**待确认**。

### 1.4 关于 CLI

- 官方 Codex CLI（终端版）**没有内置宠物**；社区通过第三方"镜像会话状态"的桌面宠物工具给 CLI 体验加宠物，例如：
  - [Hopet（BinaryFroggy/Hopet）](https://github.com/BinaryFroggy/Hopet)：macOS 桌面 AI 宠物，实时镜像 Claude Code 与 **Codex CLI** 会话状态，支持导入自定义宠物素材；
  - [OpenPet（X-T-E-R/OpenPet）](https://github.com/X-T-E-R/OpenPet)（**待确认** 细节）；
  - [agent-pets（ifBars/agent-pets）](https://github.com/ifBars/agent-pets#readme)：local-first 桌面宠物，镜像 Codex 与 agent 活动。
- 结论：**要"官方原生"宠物，用桌面版；要给 CLI 加宠物，用第三方工具**。

---

## 2. 官方 hatch-pet skill（openai/skills）

### 2.1 位置与性质

- 仓库：`openai/skills`，路径 `skills/.curated/hatch-pet/`：
  - [SKILL.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md)（[raw 直链](https://raw.githubusercontent.com/openai/skills/main/skills/.curated/hatch-pet/SKILL.md)）
  - 参考文档：[references/codex-pet-contract.md（宠物格式契约）](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md)
- 一句话功能：**从概念描述或草图（brief）程序化生成 Codex 兼容的动画宠物精灵（animated pet sprites）**，产出 spritesheet + pet.json（第三方摘要：[qumge.com](https://qumge.com/en/skills/openai/skills/hatch-pet)、[SkillsMP](https://skillsmp.com/creators/openai/skills/skills-curated-hatch-pet)、[skillavatars](https://www.skillavatars.com/skills/hatch-pet)）。

### 2.2 工作流（基于 SKILL 结构与社区转述，细节待确认）

- 结合 SKILL.md 结构、`codex-pet-contract.md` 的存在以及多个聚合站点的描述，其工作流大致为：
  1. **理解契约**：读取 codex-pet-contract.md，明确 Codex 需要的宠物包格式（pet.json 字段、spritesheet 图集规格、动作/动画命名）；
  2. **生成精灵图**：以程序化方式（像素画网格布局）生成 spritesheet（webp），覆盖各动作/状态帧；
  3. **编写 pet.json**：按契约声明元数据与动画序列；
  4. **校验/交付**：产出可直接放入 pets 目录的宠物包。
- 出处：SKILL.md 与 contract 同在 hatch-pet 目录（[目录结构](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md)）；第三方制作教程也把"先看 contract 再生成"作为标准流程（[codexpet.xyz 中文教程：如何使用 hatch-pet 制作自定义 Codex 宠物](https://codexpet.xyz/zh/guide/how-to-create-a-codex-pet/)、[GetLLMs：Create a Custom Codex Pet with hatch-pet](https://getllms.org/codex-pets/create-custom-codex-pet)）。
- **待确认**：SKILL.md 原文的具体步骤编号、是否强制用程序化（而非 AI 生图）方式、是否内置校验脚本——搜索摘要未给出原文全文。

---

## 3. 社区工具/项目盘点（仓库名 + 一句话 + URL）

### 3.1 安装与管理工具
| 项目 | 功能 | URL |
|---|---|---|
| **petdex** | 跨工具动画宠物画廊 + CLI 一键安装，支持 Codex / Claude Code / OpenCode / Gemini CLI | https://github.com/crafter-station/petdex |
| **petdex 创建页** | 在线制作宠物包（pet.json + spritesheet） | https://petdex.dev/zh/create |
| **CodexPetDesk** | Codex 宠物桌面管理/查看工具 | https://github.com/fangbm/CodexPetDesk |
| **codex-pet-cli**（npm） | Codex 宠物 CLI | https://www.npmjs.com/package/codex-pet-cli |
| **codexpethub**（npm） | 宠物包集线器 | https://www.npmjs.com/package/codexpethub |
| **abpets**（npm） | 宠物包（**待确认** 功能细节） | https://www.npmjs.com/package/abpets |
| **@ifbars/agent-pets** | local-first 桌面宠物，镜像 Codex 与 agent 活动 | https://github.com/ifBars/agent-pets |
| **Hopet** | macOS 桌面 AI 宠物，实时镜像 Claude Code / Codex CLI 会话状态，支持导入自定义素材 | https://github.com/BinaryFroggy/Hopet |
| **vscode-codex-pet** | VS Code 扩展中的 Codex 宠物 | https://marketplace.visualstudio.com/items?itemName=DinohouseDigitalLLC.vscode-codex-pet |

### 3.2 生成器 / Skill
| 项目 | 功能 | URL |
|---|---|---|
| **hatch-pet**（openai/skills 官方） | 官方生成 skill：概念→spritesheet + pet.json | https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md |
| **codex-pet-director** | 中文优先的 Codex skill，制作"官方 Codex 桌面宠物" | https://github.com/zixuanzhou0-ai/codex-pet-director |
| **Codex-Pet-Skill** | 中文制作技巧合集 + 已生成宠物合集 | https://github.com/Luyu2026/Codex-Pet-Skill |
| **desktop-pet-maker**（pet-player） | 桌面宠物制作 skill（含 petpack-schema 参考） | https://github.com/redniu123/pet-player/tree/main/skills/desktop-pet-maker |
| **codex-pet**（runcomfy-com / agentspace-so） | 社区 Codex 宠物 skill（多聚合站收录） | https://github.com/aiskillstore/marketplace/blob/main/skills/runcomfy-com/codex-pet/SKILL.md |
| **codex-pet-creation-guide** | 完整制作指南：全工作流 / QA 故障排查 / GitHub 分享 | https://github.com/gmskywalker/codex-pet-creation-guide |

### 3.3 画廊 / 资源导航
| 项目 | 功能 | URL |
|---|---|---|
| **Awesome-Codex-Pets** | Codex Pet 生态资源导航（作品、下载站、工具、教程、Prompt 灵感） | https://github.com/T-Zevin/Awesome-Codex-Pets/ |
| **awesome-codex-pet** | 社区宠物画廊，生成动作预览 + 一键安装 | https://github.com/legeling/awesome-codex-pet |
| **awesome_pets** | Codex App 友好宠物合集 | https://github.com/Nitrogen216/awesome_pets |
| **CodexPetdexSkins** | 宠物皮肤集合 | https://github.com/IceSaury/CodexPetdexSkins |
| **codexpet.xyz** | 宠物包格式规范 + 故障排查 + 制作教程（中英） | https://codexpet.xyz/spec/ 、 https://codexpet.xyz/troubleshooting/ |
| **codex-pet.org** | spritesheet.webp 指南 + 宠物画廊 | https://codex-pet.org/spritesheet-webp/ |
| **pet（lencx/pet）** | AI 编程伴侣宠物素材库 | https://github.com/lencx/pet |

### 3.4 示例宠物项目（复刻参考）
| 项目 | 说明 | URL |
|---|---|---|
| codex-pet-tangdouren | 糖豆人宠物（带 STATUS.md 记录踩坑） | https://github.com/Carl-312/codex-pet-tangdouren |
| remielle-codex-pet | 小蕾米（含 Windows WSL 不显示 bug 讨论） | https://github.com/HanaAyane/remielle-codex-pet |
| Codex_pet-Megumi | 加藤惠（Megumi）宠物 | https://github.com/Albertzry/Codex_pet-Megumi |
| codex-pet-DeepSeek-girl | DeepSeek 娘宠物 | https://github.com/xpy12367/codex-pet-DeepSeek-girl |
| yuexinmiao-codex-pet | 月薪喵（含 CODEX_PET_SPEC.md 规范文档） | https://github.com/WenNinghan/yuexinmiao-codex-pet |
| openclaw-codex-pet | OpenClaw 龙虾宠物 | https://github.com/zknicker/openclaw-codex-pet |
| hutchling | Fred Hutch 癌症中心的 Codex pet | https://github.com/FredHutch/hutchling |
| aniya-pet | Aniya 桌面宠物 | https://github.com/usertianziyang/aniya-pet |
| rana-codex-pet | Rana 宠物 | https://github.com/huoyi-bao/rana-codex-pet |
| feibi-jiubi-codex-pet | 肥比九比宠物 | https://github.com/KanadeK/feibi-jiubi-codex-pet |
| aemeath-codex-pet | Aemeath 宠物 | https://github.com/ChuyuZhong/aemeath-codex-pet |
| openclaw-tamagotchi | 跨平台开源桌面宠物（状态机+气泡+素材导入器，实现参考） | https://github.com/katolikov/openclaw-tamagotchi |
| workbuddy-buddy | Tauri 桌面宠物，含 PET_SPEC.md（15 只伙伴+自建） | https://github.com/FlashFamily/workbuddy-buddy |
| clawdex | 含 docs/state-mapping.md（动作/状态映射参考） | https://github.com/danielkempe/clawdex |
| Kavana（caro.sh） | "Bring Kavana into Codex" 安装文档示例 | https://www.caro.sh/docs/kavana |

---

## 4. 最小可用的 pet 包长什么样

### 4.1 目录 + 文件清单（社区示例一致）

一个宠物包 = 一个目录，核心文件 2 个，可选 2 个：

```
my-pet/                  # 目录名即宠物标识（如 teddy--danieloleary）
├── pet.json             # 必需：元数据 + 动画/动作定义
├── spritesheet.webp     # 必需：动画精灵图集（帧网格）
├── preview.png          # 可选：画廊/预览用静态图
└── README.md            # 可选：说明与安装指引
```

- 依据：[awesome-codex-pet/pets/teddy--danieloleary 目录](https://github.com/legeling/awesome-codex-pet/tree/main/pets/teddy--danieloleary)、[yuexinmiao-codex-pet](https://github.com/WenNinghan/yuexinmiao-codex-pet)、[CodexPetdexSkins](https://github.com/IceSaury/CodexPetdexSkins)、[gmskywalker/codex-pet-creation-guide 的 04-GITHUB-SHARING.md](https://github.com/gmskywalker/codex-pet-creation-guide/blob/main/docs/04-GITHUB-SHARING.md)。

### 4.2 pet.json 字段（社区多来源一致的部分）

- `name` / `id`：宠物名称与唯一标识；
- `sprite`：指向 `spritesheet.webp` 的引用；
- `preview`：可选，指向 `preview.png`；
- `animations` / `actions`：动作集合，社区示例中常见 `idle`、`sleep`、`working`、`thinking`、`success`、`failure` 等动作名，每个动作含帧范围/帧数、帧率等参数；官方契约文档（[codex-pet-contract.md](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md)）与 [codexpet.xyz/spec（宠物包格式：pet.json、spritesheet.webp 及图集规范）](https://codexpet.xyz/spec/) 定义了权威字段清单。
- ⚠️ **待确认**：因无法读取原文，逐字段的精确 schema（字段名大小写、必填项、帧率单位）请以 codex-pet-contract.md / codexpet.xyz/spec / petdex 的 petpack-schema（[redniu123/pet-player petpack-schema.md](https://github.com/redniu123/pet-player/blob/main/skills/desktop-pet-maker/references/petpack-schema.md)）为准。复刻前应直接拉取这些原始文档。

---

## 5. 常见坑 / 故障排查

### 5.1 社区汇总来源
- [Codex Pet Troubleshooting（codexpet.xyz，英文）](https://codexpet.xyz/troubleshooting/) 与 [中文版](https://codexpet.xyz/zh/troubleshooting/)
- [codex-pet-creation-guide/docs/03-QA-TROUBLESHOOTING.md](https://github.com/gmskywalker/codex-pet-creation-guide/blob/main/docs/03-QA-TROUBLESHOOTING.md)
- [spritesheet.webp Guide for Codex Pets（codex-pet.org）](https://codex-pet.org/spritesheet-webp/) 与 [中文版](https://codex-pet.org/zh/spritesheet-webp/)

### 5.2 反复出现的高置信度要点
1. **透明背景**：spritesheet 必须透明背景（不要留白底/黑底），否则宠物会显示为带色块方块（多个教程与故障页一致强调）。
2. **格式与编码**：动画图集必须用 **webp**（社区规范称 spritesheet.webp）；建议无损/高质量编码避免色块与压缩伪影。
3. **帧尺寸一致**：所有帧必须等尺寸（常见 32×32 或 64×64 像素网格），帧大小不一致会导致错位/跳动。
4. **帧数与帧率**：每个动作的帧数、帧率要写对；帧数声明与实际图集不符会导致动画缺帧或错乱。
5. **命名**：动作名/宠物 id 要符合契约约定（如小写、连字符分隔），文件名与 pet.json 引用必须完全一致（`spritesheet.webp` 大小写敏感）。
6. **平台特定 bug**：
   - Windows 开启 **WSL 后端**时自定义桌宠不显示（上游 bug）：[remielle-codex-pet Issue #1](https://github.com/HanaAyane/remielle-codex-pet/issues/1)；
   - Windows 上 coding→pet 模式切换时吉祥物不可见，社区有修复提交：[oc-claw commit eb0d487](https://github.com/rainnoon/oc-claw/commit/eb0d4872e2135522d7daf8aa26c92b7669df52b3)。
7. **安装后不出现**：多数教程要求**完全退出并重启** Codex 应用；宠物包目录层级/路径放错也不会被识别。

> ⚠️ 说明：troubleshooting 页面条目的具体原文未逐条读取，以上为多来源交叉出现的要点；**完整条目清单待确认**，复刻前建议直接访问 codexpet.xyz/troubleshooting 与 gmskywalker 的 QA 文档。

---

## 6. 给复刻项目的建议（基于以上调研）

1. **目标载体**：优先面向 **Codex 桌面版**（官方宠物机制所在），pet 包格式以官方 `codex-pet-contract.md` + `codexpet.xyz/spec` 为准；如需 CLI 体验，参考 Hopet/agent-pets 这类"状态镜像"工具而非官方机制。
2. **产出格式**：宠物包 = 目录（pet.json + spritesheet.webp [+ preview.png]）；生成器（复刻 hatch-pet 或 codex-pet-director 思路）应程序化输出像素网格 spritesheet 并自动写 pet.json。
3. **安装体验**：参考 petdex / awesome-codex-pet 的"一条命令安装 + 重启提示"模式；提供脚本同时覆盖 macOS/Linux/Windows 路径。
4. **质量校验**：内置校验（透明背景、webp、帧等尺寸、动作帧数匹配、命名小写连字符），对应第 5 节的常见坑。
5. **参考实现**：openclaw-tamagotchi（Tauri 状态机桌面宠物）、workbuddy-buddy（Tauri + PET_SPEC）、codex-pets-react（spritesheet 的 React 封装）可作为渲染层参考。

---

## 附：主要一手资料链接

- 官方：hatch-pet SKILL.md — https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md
- 官方：codex-pet-contract.md — https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md
- 规范：https://codexpet.xyz/spec/ （中文 https://codexpet.xyz/zh/spec/ ）
- 故障排查：https://codexpet.xyz/troubleshooting/ （中文 https://codexpet.xyz/zh/troubleshooting/ ）
- 制作教程：https://codexpet.xyz/zh/guide/how-to-create-a-codex-pet/ 、https://getllms.org/codex-pets/create-custom-codex-pet
- openai/codex issue（/pet 命令证据）：https://github.com/openai/codex/issues/20836 、https://github.com/openai/codex/issues/20863
- petdex：https://github.com/crafter-station/petdex 、https://petdex.dev/zh/create
