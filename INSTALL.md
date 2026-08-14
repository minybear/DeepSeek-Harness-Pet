# 安装 `dsh-pet` 到 DSH Web GUI

插件代码已就绪并通过测试；要让宠物出现在正在运行的 DSH 页面里，需要三步：**安装包 → 登记进浏览器插件花名册 → 重启 `dsh web`**。前两步由 `scripts/install.ps1` 或下方命令完成，第三步会重启当前 Web 进程（需你执行或确认）。

## 前提

- `dsh` 已安装（本机 `dsh` 位于 npm 缓存 checkout 的 `node_modules\.bin\dsh`）。
- DSH home 为 `%USERPROFILE%\.dsh`（可用 `$env:DSH_HOME` 覆盖）。

## 方式 A：一键脚本（推荐）

```powershell
# 在本工作区根目录运行
powershell -ExecutionPolicy Bypass -File deploy\install.ps1
```

脚本做的事（幂等，可反复运行）：
1. 把 `lib\` 与 `package.json` 复制到 `%DSH_HOME%\profiles\web\node_modules\dsh-pet\`（让 loader 能解析到 `dsh-pet`）。
2. 在 `%DSH_HOME%\profiles\web\cordis.patch.yml` 里插入浏览器花名册行：
   ```yaml
   - insert:
       - id: ui-pet
         name: 'dsh-pet'
   ```

## 方式 B：手动

```powershell
$profile = "$env:DSH_HOME\profiles\web"
New-Item -ItemType Directory -Force -Path "$profile\node_modules\dsh-pet" | Out-Null
Copy-Item -Recurse -Force lib "$profile\node_modules\dsh-pet\lib"
Copy-Item -Force package.json "$profile\node_modules\dsh-pet\package.json"
```

然后把 `deploy\cordis.patch.pet.yml` 的内容合并进 `$profile\cordis.patch.yml`（当前为 `[]`，直接整体替换即可）。

## 第三步：重启并验证

```powershell
# 重启 dsh web（会重启当前正在服务的 3080 端口进程）
# 视你最初启动方式：Ctrl+C 后重新 `dsh web`，或重启对应后台任务
dsh web
```

刷新 `http://127.0.0.1:3080`。预期：右下角出现青绿色小宠物「Dee」，agent 运行时进入「Working」工作动画，等待审批时「Needs input」，报错「Blocked」，完成时短暂「Done!」庆祝，点击宠物会「Hi!」挥手。

## 验证清单

| 验证项 | 方法 |
| --- | --- |
| 纯逻辑 / 状态机 / 帧索引 | `node test\pet-core.test.mjs` |
| 插件契约 / slot 注册 | `node test\client-contract.test.mjs` |
| 精灵图集网格结构 | `node scripts\render-atlas.mjs`（输出 `assets\dsh-pet-spritesheet.png` 并自检） |
| 配置层是否正确 | `dsh --profile web --dump-config`（能看到 `ui-pet` 行且不报错） |
| 实际渲染 | 打开 `deploy\demo.html`（浏览器本地演示，可切换各状态） |

## 卸载 / 回滚

```powershell
Remove-Item -Recurse -Force "$env:DSH_HOME\profiles\web\node_modules\dsh-pet"
# 并从 cordis.patch.yml 中删除 ui-pet 的 insert 段
```
