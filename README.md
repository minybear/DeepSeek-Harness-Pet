# @minybear/dsh-pet

Codex 风格的「桌面宠物」DSH 客户端插件：在 DeepSeek Harness（DSH）Web GUI 里漂浮一只动画小宠物，由当前会话的 **agent 运行状态**实时驱动（工作 / 等待输入 / 报错 / 刚完成 / 待机）。

> 复刻对象：OpenAI Codex 桌面版的 Pets 功能。调研结论见 [`docs/Codex-Pet-能力分析.md`](docs/Codex-Pet-能力分析.md) 与 [`docs/复刻方案.md`](docs/复刻方案.md)；与 Codex 官方能力的逐项对照见 [`docs/差距分析.md`](docs/差距分析.md)；版本变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。

## 能力

- **漂浮宠物**：注册进 DSH 的 `shell.overlay` 槽（帧级浮动层，可点透，右下角常驻，可拖拽换位）。
- **状态驱动**：读当前会话状态并映射到 Codex 的 9 状态动画行；会话信号按 Codex `ambient.rs` 的**存活期**衰减（Running 3min / Failed 1h / Waiting 24h / Review 7d，超时回退 idle）：

  | DSH 信号 | 宠物状态（行） | 状态标签 |
  | --- | --- | --- |
  | `running === true` | running（7） | Running |
  | `pendingInteraction` | waiting（6） | Needs input |
  | `lastAgentError` | failed（5） | Blocked |
  | running `true→false` 边沿 | jumping（4） | Done!（约 2.6s） |
  | `completed` | review（8） | Ready |
  | 切换/打开会话 | waving（3） | Hi!（约 1.7s） |
  | 拖拽移动中 | running-left/right（1/2，按方向） | （无） |
  | 无活动 | idle（0） | （无） |

- **减少动态**：跟随系统 `prefers-reduced-motion`，或在设置里手动锁定「完整 / 减少动态」；减少动态时按 Codex 行为固定显示 idle 第一帧。
- **交互**：
  - 点击 → 弹出菜单：🍗 喂食（`eat`）、🎾 玩耍（`play`）、⚙ 设置。
  - 拖拽 → 移动宠物位置（按拖动方向播放官方 running-left/right 行走动画，静止时为 `drag` 姿态，位置持久化到 localStorage）。
- **养成数值**：🍖 饱食 / 😊 心情 0–100，随**墙钟时间**衰减（关掉浏览器也计时，约 8h / 6h 见底）；喂食 +30 饱食、玩耍 +25 心情；菜单里有两条数值条，待机且某项 <20 时宠物会冒「🍖 饿了 / 🎾 想玩」提示。
- **多宠物**：内置五只宠物——Dee（青绿）/ Amber（琥珀）/ Berry（莓紫）同模配色，以及**灰鲸**（DeepSeek Harness logo 造型）/ **蓝鲸**（DeepSeek 官方 logo 造型，品牌蓝）两只侧视鲸鱼，设置面板一键切换。
- **自定义宠物导入**：设置面板可导入标准 **Codex 宠物包**（`pet.json` + 图集图片，如 `~/.codex/pets/` 下 hatch-pet 生成的宠物），校验后存入 localStorage 并立即可选；可删除。无额外交互行的官方 9 行图集会自动回退（交互态播放 idle 行）。
- **外观设置**：尺寸（0.5–1.5）、透明度（0.2–1）、动画模式、宠物选择，全部持久化到 `localStorage`。
- **Codex 兼容包格式**：宠物由 `pet.json`（`id/displayName/description/spritesheetPath/frame/animations`）+ 一张**行优先图集**（无独立 atlas 文件，帧索引 `index = row×columns + col`）描述；内置默认宠物在运行时用 canvas 生成。前 9 行为 Codex V1 官方 9 状态，第 9–11 行为交互状态（eat/play/drag），经官方 `frame` 覆写（96×104×8×12）与 `animations` 字段声明。

## 结构

```
lib/pet-core.js    纯逻辑（Node 可测）：pet.json 解析 + 帧切片 + 状态机 + 状态存活期
lib/index.js       host 侧 apply（空，纯 UI 插件）
lib/client.js      浏览器侧：window.__ModuleLoader__.load + apply/inject + PetOverlay + 精灵生成
test/*.test.mjs    Node 单测（pet-core + client 契约 + 双副本一致性）
docs/              调研、方案与差距分析
```

> 注：`client.js` 内联了一份 pet-core（DSH 模块加载器无法解析包内文件），`test/parity.test.mjs` 会对两份副本做全量行为一致性校验，防止分叉。

## 测试

```sh
npm test            # 依次跑 pet-core / client-contract / parity
node scripts/render-atlas.mjs --all   # 软渲染三只内置宠物图集并自检网格不变量
```

## 安装到 DSH

```sh
# 从 npm（发布后）
dsh plugin --profile web add @minybear/dsh-pet

# 或一条命令装本地 checkout（包自带 dsh.bundle.patch 自注册）
dsh plugin --profile web add .

# 或从 GitHub
dsh plugin --profile web add github:minybear/DeepSeek-Harness-Pet
```

然后重启 `dsh web` 并刷新页面，宠物应出现在右下角。离线环境或无需 pnpm 时，用 `deploy\install.ps1` 手动装；完整步骤见 [`INSTALL.md`](INSTALL.md)。

> 注：客户端插件需宿主端打包（`dsh.client.inject`）与重启后生效。
