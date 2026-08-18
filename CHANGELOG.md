# Changelog

本仓库的所有重要变更都记录在此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-08-18

### Added
- **养成数值系统**（Tamagotchi 风，本插件扩展能力）：🍖 饱食 / 😊 心情 0–100，按**墙钟时间**衰减（关闭浏览器也计时；饱食约 8h、心情约 6h 见底），🍗 喂食 +30 饱食、🎾 玩耍 +25 心情。
- 菜单新增两条数值进度条；待机且某项 <20 时宠物冒「🍖 饿了 / 🎾 想玩」提示气泡（会话状态优先，不打断工作/等待/报错显示）。
- `pet-core` 新增纯函数 `decayStats / feedStats / playStats / statHint`（含 parity 一致性覆盖与 10 组边界单测）。

## [0.3.0] - 2026-08-18

### Added
- **两只鲸鱼形象**：`graywhale`（灰鲸，DeepSeek Harness logo 造型，灰色 #8b95a5）与 `bluewhale`（蓝鲸，DeepSeek 官方 logo 造型，品牌蓝 #4d6bfe）。
- 新增 `drawWhale` 侧视鲸鱼绘制：身体椭圆 + 头部 + 尾鳍，idle 呼吸喷**水柱**、工作中冒**气泡**、waving 举**胸鳍**、jumping 是**跃出水面**、running-left 整体镜像。
- `BUILTIN_PETS` 条目新增 `shape` 字段（`blob` / `whale`），`buildDefaultAsset` 按 shape 分派绘制。
- `render-atlas.mjs` 同步鲸鱼 SDF 端口（椭圆距离场），`--all` 现在渲染全部五只宠物。

## [0.2.0] - 2026-08-18

### Added
- **BridgeOverlay**：headless `shell.overlay` 注册项，把当前会话的 `running / waiting / completed / error` 状态变化 POST 到 `http://127.0.0.1:8765/pet-state`，供 `dsh-pet-desktop` 桌面浮窗消费（A 阶段桥接）。
- **状态存活期（ambient.rs 复刻）**：Running 3min / Failed 1h / Waiting 24h / Review 7d 后回退 idle（`decaySignals` + 首见时间戳）。
- **拖拽方向动画**：拖动时按水平方向播放官方 `running-right` / `running-left` 行走行。
- **会话切换打招呼**：切换/打开会话时播放 `waving`（对应 Codex SessionStart）；同一会话重复选中不会重复挥手（`shouldWave` 去重）。
- **减少动态模式**：跟随系统 `prefers-reduced-motion`，设置面板可手动锁定，启用时固定 idle 第一帧。
- **多宠物**：内置 Dee（青绿）/ Amber（琥珀）/ Berry（莓紫）三只配色宠物，设置面板切换。
- **自定义宠物导入**：设置面板导入标准 Codex 宠物包（`pet.json` + 图集图片），校验后存 localStorage，可切换/删除。
- 官方状态标签对齐 ambient.rs：`Running / Needs input / Ready / Blocked`。
- 测试：新增 `test/parity.test.mjs`（client.js 内联副本与 pet-core 全量行为一致性）、`test/wave.test.mjs`（wave 去重）。
- 文档：新增 `docs/差距分析.md`（与 Codex 官方能力逐项对照）。

### Fixed
- 修复 `pet-core.js` 与 `client.js` 内联副本状态机分叉（`completed→review` 此前仅存在于 client）。
- 修复 React hooks 顺序违规：`useRef`/`useState` 曾在 `if (!asset) return null` 之后，asset 异步加载后必然崩溃。
- 修复 `scripts/verify-install.mjs` 硬编码的 `C:/Users/redtea/...` 路径。
- `npm test` 现在跑全部测试（pet-core / client-contract / parity / wave）。

### Changed
- `render-atlas.mjs` 配色参数化，`--all` 渲染三只内置宠物并自检。
- `demo.html` 增加 wave / 换宠物 / 减少动态演示按钮。

## [0.1.0] - 2026-08-14

### Added
- 首个可用版本：Codex 9 状态 V1 图集、`pet.json` 解析、状态机、`shell.overlay` 浮窗、拖拽换位、🍗 喂食 / 🎾 玩耍、尺寸/透明度设置（localStorage 持久化）、`dsh plugin add` 自注册安装、离线 `deploy/install.ps1`。

[0.2.0]: https://github.com/minybear/DeepSeek-Harness-Pet/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/minybear/DeepSeek-Harness-Pet/releases/tag/v0.1.0
