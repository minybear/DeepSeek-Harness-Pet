# 安装 `@minybear/dsh-pet` 到 DSH Web GUI

插件代码已就绪并通过测试；要让宠物出现在正在运行的 DSH 页面里，需要：**安装包 → 登记进浏览器插件花名册 → 重启 `dsh web`**。前两步现在可以一条命令完成（见方式 A），第三步会重启当前 Web 进程（需你执行或确认）。

## 前提

- 已安装 `dsh` CLI。
- DSH home 为 `%USERPROFILE%\.dsh`（可用 `$env:DSH_HOME` 覆盖）。

## 方式 A：`dsh plugin` 一键安装（推荐）

包已在 `package.json` 声明 `dsh.bundle.patch`（自带花名册登记），所以 `dsh plugin add` 会同时完成「装包 + 登记花名册」两件事：

```powershell
# 在本工作区根目录运行（本地路径安装）
dsh plugin --profile web add .

# 或从 npm（发布后）
dsh plugin --profile web add @minybear/dsh-pet

# 或从 GitHub
dsh plugin --profile web add github:minybear/DeepSeek-Harness-Pet
```

`dsh plugin add` 内部 = `pnpm add`（把包装成 profile 依赖）+ 自动把声明了 `dsh.bundle` 的包加入 `dsh.profile.bundles`。重启时 `@minybear/dsh-pet` 自带的 `cordis.patch.yml` 会把 `ui-pet` 登记进浏览器花名册，客户端插件半体（`exports["./client"]`）随之被加载。

> 注意：`dsh plugin add` 走 pnpm，需要网络拉 peer 依赖；离线环境请用方式 B。

## 方式 B：脚本安装（离线 / 无 pnpm 时）

```powershell
# 在本工作区根目录运行
powershell -ExecutionPolicy Bypass -File deploy\install.ps1
```

脚本做的事（幂等，可反复运行）：
1. 把 `lib\`、`package.json`、`cordis.patch.yml` 复制到 `%DSH_HOME%\profiles\web\node_modules\@minybear\dsh-pet\`。
2. 在 `%DSH_HOME%\profiles\web\cordis.patch.yml` 里插入浏览器花名册行：
   ```yaml
   - insert:
       - id: ui-pet
         name: '@minybear/dsh-pet'
   ```

## 方式 C：完全手动

```powershell
$profile = "$env:DSH_HOME\profiles\web"
New-Item -ItemType Directory -Force -Path "$profile\node_modules\@minybear\dsh-pet" | Out-Null
Copy-Item -Recurse -Force lib "$profile\node_modules\@minybear\dsh-pet\lib"
Copy-Item -Force package.json "$profile\node_modules\@minybear\dsh-pet\package.json"
Copy-Item -Force cordis.patch.yml "$profile\node_modules\@minybear\dsh-pet\cordis.patch.yml"
```

再把 `- insert: [{ id: ui-pet, name: '@minybear/dsh-pet' }]` 合并进 `$profile\cordis.patch.yml`。

## 最后一步：重启并验证

```powershell
# 重启 dsh web（会重启当前正在服务的 3080 端口进程）
dsh web
```

刷新 `http://127.0.0.1:3080`。预期：右下角出现青绿色小宠物「Dee」，agent 运行时进入「Running」工作动画，等待审批时「Needs input」，报错「Blocked」，完成时短暂「Done!」庆祝，切换会话时「Hi!」挥手，点击宠物弹出菜单（喂食/玩耍/设置）。

## 验证清单

| 验证项 | 方法 |
| --- | --- |
| 纯逻辑 / 状态机 / 帧索引 / 状态存活期 | `node test\pet-core.test.mjs` |
| 插件契约 / slot 注册 | `node test\client-contract.test.mjs` |
| client.js 内联副本与 pet-core 一致性 | `node test\parity.test.mjs` |
| 精灵图集网格结构（三只内置宠物） | `node scripts\render-atlas.mjs --all`（输出 `assets\` 下各 PNG 并自检） |
| 配置层是否正确 | `dsh --profile web --dump-config`（能看到 `ui-pet` 行且不报错） |
| 安装结果体检 | `node scripts\verify-install.mjs` |
| 实际渲染 | 打开 `deploy\demo.html`（浏览器本地演示，可切换各状态/宠物/减少动态） |

## 卸载 / 回滚

```powershell
# 方式 A 安装的：
dsh plugin --profile web remove @minybear/dsh-pet

# 方式 B/C 安装的：
Remove-Item -Recurse -Force "$env:DSH_HOME\profiles\web\node_modules\@minybear\dsh-pet"
# 并从 cordis.patch.yml 中删除 ui-pet 的 insert 段
```
