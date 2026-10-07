# 墨迹图库内容后台

> 2026-10-07 内容调整：项目所有者已作废首批素材。原 27 项在线内容全部停用，首批 31 个研究 ID 纳入累计撤下名单。原资源和许可仅保留为历史记录；新的真实纹身选材在私有工程研究库中整理，尚未公开发布。下文数量与批次说明保留历史背景。

这个公开仓库用于维护墨迹小程序的图片与分类。日常只编辑 **main 分支**的 `gallery.json` 与素材输入，由 Actions 校验后发布到独立的 **published 分支**；无需运行服务器或安装管理后台。小程序和 CDN 固定读取 `@published`，不会直接读取 main 的待验证修改。重新进入或刷新图库后获取更新，CDN 缓存及离线设备可能延迟看到变化。

本批公开内容为 27 项：11 张作品照片、16 张独立图案。`LICENSES.md` 和每项 `source` 保留来源与许可。研究原件、未通过的 4 项照片、内部保存测试卡、审核证据文件和小程序工程均不在本仓库中。

## 编辑图库

在 GitHub 打开 `gallery.json`，点铅笔编辑，保存提交到 `main`，再查看 **Actions → Publish gallery**。绿色成功后切换到 **published 分支**检查 `release.json`：`sequence` 应递增，`catalogPath` 指向新的不可变目录。无需修改或删除旧目录。内容没有变化时不生成新版本，sequence 保持不变。

每张图的运营字段：

| 字段 | 用法 |
| --- | --- |
| `id` | 永久 ID，不能修改来表示同一张图 |
| `enabled` | `false` 暂时隐藏，之后改回 `true` 可重新上架 |
| `title` | 标题，非空，最多 200 字符 |
| `keywords` | 搜索关键词数组，不重复，最多 100 项 |
| `tags` | `styles` 风格、`subjects` 题材、`bodyParts` 部位；值来自 taxonomy；独立图案的部位必须为空 |
| `sortOrder` | 非负整数，小数值排前，同值时按 ID 稳定排序 |

main 中的 `gallery.json` 不能改来源、图片路径或许可；加入这些未知字段会被拒绝。图片的公开来源、许可、权利和资源信息在 `base-catalog.json`，它是添加或核验素材时使用的底账。

## 分类与快捷入口

`presentation.taxonomy` 有 `styles`、`subjects`、`bodyParts` 三个数组，每个最多 60 个标签。每个标签包含 `value` 和 `label`。`value` 用小写字母、数字和连字符，最多 48 字符，以字母或数字开头，三类标签的 value 不能重复。`label` 为非空显示名，最多 16 字符，不能含控制字符或换行。

新分类示例：在 `subjects` 中加入 `{ "value": "butterfly", "label": "蝴蝶" }`，再给对应图片的 `tags.subjects` 添加 `butterfly`。删除分类前先移除全部图片的引用，包括暂时隐藏的图片。

`quickSubjects.photo` / `design` 是两个列表的快捷题材按钮，各最多 10 个，必须引用 subjects。`searchSuggestions.photo` / `design` 是搜索推荐词，各最多 8 个，每项最多 50 字符。两者均不可重复。图片标题、关键词和这些分类可通过一次 gallery 提交共同更新。

## 免费 CDN 的更新时间

当前采用无需新增服务账号或清缓存密钥的免费链路。GitHub Actions 成功只表示 **published 分支已经发布**；客户端何时看到新图，还取决于 CDN 的发布指针缓存。jsDelivr 官方文档列出分支缓存可达 12 小时，JSDMirror 的实际缓存行为应单独观察，不能把一次 HTTP 200 当作最新内容已经送达。

小程序的刷新按钮会重新请求目录，但不能绕过上游 CDN 缓存。发布后若 CDN 的 `release.json.sequence` 仍小于 GitHub published 中的值，应等待缓存自然更新，不要反复提交相同内容或重发小程序；这些操作不能保证加快同一个指针 URL 的传播。目录与图片使用不可变版本路径，指针返回新版本后再读取对应目录。

本轮没有接入自动清缓存：jsDelivr 网页清理有验证码，API 需要邮件授权；JSDMirror 刷新接口需要账号密钥/积分。为保持当前方案无需新增账号和密钥，这些操作均不自动化。免费方案的验收边界是**发布流水线和客户端更新逻辑可用，但上新并非即时**。如将来需要明确的更新时间，再评估有可控缓存的存储与 CDN。

2026-10-07 第二版状态：GitHub 已发布 sequence 2，冻结客户端的更新逻辑测试通过。最终 HTTP 检查 62/64 通过：新目录与抽查图片正确，两条 release 指针仍返回 sequence 1。待 CDN 指针自然传播，未完成原生第二版端到端验收。不能将 Actions 成功写成第二版已在手机端生效。参考 [jsDelivr 缓存说明](https://github.com/jsdelivr/jsdelivr#caching)。

## 暂时隐藏与永久撤下

临时调整使用 `enabled: false`。如果需要永久撤下，将 ID 加入顶层 `withdrawnIds`。发布器会与上一份已发布的撤下列表合并；以后把 enabled 改回 true，或回滚旧 gallery，都不会让该 ID 复活。撤下可以包括已从运营列表删除的 ID。

不要手动改写 published 分支的 `release.json`、`asset-index.json` 或历史资源，也不要强制推送覆盖历史。Actions 以 published 的指针和哈希索引为唯一历史依据，main 中可能保留的初始示例不参与发布序号与撤下判断。已撤下的 ID 不要分配给新作品。撤下只影响收到新目录的客户端，不能删除用户相册中的已存图片，也不能令离线设备和 CDN 缓存即时失效。

## 新增图片

1. 先核实来源与允许的展示、下载、派生范围。建议在私有工作工程采集原件、保存证据，走审核和图片构建；公开仓库只加入通过核验的派生图片和来源/许可信息。
2. 在 main 上传缩略图、详情图，以及允许保存时的下载图，使用 `assets/<新版本>/<永久ID>/...` 新路径。保留原图比例和可见水印；需要归因的下载图应带作者、原作品名、来源、许可和改动。不要覆盖或删除已发布图片路径。
3. 在 `base-catalog.json.items` 加入完整条目，包括 ID、kind、原始标题/标签、`source` 的作者/HTTPS 来源/许可/归因/核验日期、三个布尔 `rights`，以及 `assets` 中的路径、宽高和字节数。下载许可为 true 时必须有 download，并记录 `attributionIncluded` 和 `changes`。只有正式 CC0 可不嵌入署名。
4. 在 `gallery.json.items` 加入对应运营条目，设置 enabled、标题、关键词、标签和排序。路径引用的文件必须已在同一次提交或之前提交中上传；只有 gallery 里一个新 ID 会被拒绝。
5. 运行检查或等待 Actions。输入不完整、路径越界、素材缺失、字节数不匹配或同路径内容被替换时，published 分支的旧发布指针和线上图片均保持不变。归因与许可核验不能由一次技术检查代替。

全部素材均按每项原许可使用，不能从本仓库推断作者与小程序存在合作或代言关系。

## 检查、发布和回滚

需要本地检查时，克隆这个内容仓库后运行 Node.js（无需 npm 安装）：

```sh
git fetch origin published
git worktree add ../moji-assets-published origin/published
node scripts/publish.mjs --input . --published ../moji-assets-published --check
node scripts/publish.mjs --input . --published ../moji-assets-published
```

`--check` 只验证；后一条在独立 published 工作树生成通过校验的输出，本身不提交或推送 GitHub。操作前确认当前输入工作树为 main。正常运营直接编辑 main 的 gallery 即可，也可在 Actions 手动运行 Publish gallery。工作流仅有 `contents: write` 权限，不调用第三方 Actions，不需要额外云密钥。已有 worktree 时不要重复创建。

第一次部署由维护者创建 published 分支，初始文件仅为 `release.json`、`asset-index.json`、`catalog/`、`assets/`、`LICENSES.md`。其中哈希索引用于维护永久资源完整性，不能省略。gallery、base-catalog、运营脚本及工作流留在 main，不必进入 CDN 分支。

回滚展示内容时，从 GitHub 历史复制旧版 `gallery.json` 的内容作为**新的提交**。新发布的 sequence 会更高；若内容与某旧目录相同，可复用该不可变目录。累计撤下仍生效。不要把 release 指针恢复成较低 sequence。

Actions 从 main 取运营输入，从 published 取当前指针、哈希索引和历史资源，在临时 staging 合并后校验。只有全部通过才把白名单公开文件复制到 published 工作树，并将 catalog、图片、资源哈希索引及 release 作为一次原子 Git 提交推送到 published；不回写 main 的发布示例。

如果误改 main 的图片、漏传文件或输入无效，staging 会被丢弃，published 及其 CDN 图片保持原样。即便如此，新增图片仍必须使用新版本路径，不能复用已发布路径来替换内容。不要绕过流程直接编辑 published。更新期间遇到其他人的发布提交可能使 push 被拒绝；检查最新输入后重跑工作流即可，流程不会强制覆盖别人提交。

published 中的 `release.json` 和 `catalog/`、`assets/` 是客户端分发文件，`asset-index.json` 保留完整性历史，`LICENSES.md` 保留许可。main 的 `base-catalog.json`、`gallery.json` 是运营输入。发布新素材时原路径永不复用，便于长期缓存与后续迁移对象存储。

GitHub 的 GITHUB_TOKEN 推送通常不会再次触发 push 工作流；工作流也限制了输入文件路径，避免发布产物重复触发。参见 [GitHub 工作流触发说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) 和 [工作流权限与并发语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。
