# dsh-pet

Codex 风格的「桌面宠物」DSH 客户端插件：在 DeepSeek Harness（DSH）Web GUI 里漂浮一只动画小宠物，由当前会话的 **agent 运行状态**实时驱动（工作 / 等待输入 / 报错 / 刚完成 / 待机）。

> 复刻对象：OpenAI Codex 桌面版的 Pets 功能。调研结论见 [`docs/Codex-Pet-能力分析.md`](docs/Codex-Pet-能力分析.md) 与 [`docs/复刻方案.md`](docs/复刻方案.md)。

## 能力

- **漂浮宠物**：注册进 DSH 的 `shell.overlay` 槽（帧级浮动层，可点透，右下角常驻）。
- **状态驱动**：读当前会话状态并映射到 Codex 的 9 状态动画行：

  | DSH 信号 | 宠物状态（行） | 状态标签 |
  | --- | --- | --- |
  | `running === true` | running（7） | Working |
  | `pendingInteraction` | waiting（6） | Needs input |
  | `lastAgentError` | failed（5） | Blocked |
  | running `true→false` 边沿 | jumping（4） | Done!（约 2.6s） |
  | `completed` 且未选 | review（8） | Ready |
  | 无活动 | idle（0） | （无） |

- **交互**：点击宠物触发 waving（3）「Hi!」。
- **Codex 兼容包格式**：宠物由 `pet.json`（`id/displayName/description/spritesheetPath/frame/animations`）+ 一张**行优先图集**（无独立 atlas 文件，帧索引 `index = row×columns + col`）描述；内置默认宠物在运行时用 canvas 生成（经 `frame` 字段声明 96×104×8×9 网格，与官方 `frame` 覆写机制一致）。

## 结构

```
lib/pet-core.js    纯逻辑（Node 可测）：pet.json 解析 + 帧切片 + 状态机
lib/index.js       host 侧 apply（空，纯 UI 插件）
lib/client.js      浏览器侧：window.__ModuleLoader__.load + apply/inject + PetOverlay + 精灵生成
test/*.test.mjs    Node 单测（pet-core + client 契约）
docs/              调研与方案
```

## 测试

```sh
node test/pet-core.test.mjs
node test/client-contract.test.mjs
```

## 安装到 DSH

```sh
# 一条命令装包 + 登记浏览器花名册（包自带 dsh.bundle.patch 自注册）
dsh plugin --profile web add .

# 或从 GitHub
dsh plugin --profile web add github:minybear/DeepSeek-Harness-Pet
```

然后重启 `dsh web` 并刷新页面，宠物应出现在右下角。离线环境或无需 pnpm 时，用 `deploy\install.ps1` 手动装；完整步骤见 [`INSTALL.md`](INSTALL.md)。

> 注：客户端插件需宿主端打包（`dsh.client.inject`）与重启后生效。
