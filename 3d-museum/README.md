# 3D 世界文物馆

把 53 件世界文物 3D 模型陈列进可漫游的开源数字博物馆。项目基于 Vite、TypeScript 和 Three.js，使用 OpenVGAL 的开源场地模板搭建中央中庭与多个分馆，再把 Echo 导出的文物模型按主题摆入展台。

这个仓库适合做数字文博展示、Three.js 场馆原型、3D 资产整理和开源展陈实验。

## 项目亮点

- 真实馆内陈列：根页面不是 iframe 拼接，而是一个新的 Three.js 3D 博物馆场景。
- 多分馆布局：青铜礼器馆、中国造像与瓷器馆、世界文明馆、自然标本馆、示例技术馆围绕中央中庭布置。
- 53 件展品：从 Echo 导出包中提取模型和文物元数据，并在源码中生成可维护的展品清单。
- 开源场地：使用 OpenVGAL Minimalist GLB 模板作为博物馆空间，并保留原始 MIT License。
- 可维护工程：包含导入脚本、元数据提取脚本、生产构建和 Git 资源规则。

## 仓库结构

- `public/echo/`：从 Echo 导出包解包出来的原始应用，包含 React/Three 运行产物、Draco 解码器和全部模型资源。
- `public/venue/openvgal/`：来自 OpenVGAL 的 MIT 许可博物馆/画廊模板 GLB，用作中央中庭与多个分馆空间。
- `src/`：可继续源码化维护的 Vite + TypeScript + Three.js 展馆逻辑，负责加载 53 件文物模型、分馆编组、展台陈列、巡展和交互。
- `scripts/`：Echo 导出包导入和文物元数据提取工具。
- `ATTRIBUTION.md`：第三方场地、模型与许可来源说明。

## 开发

```bash
npm install
npm run dev
```

默认开发服务会运行在：

- 分馆陈列入口：`http://127.0.0.1:5173/`
- 原始 Echo 导出馆直达：`http://127.0.0.1:5173/echo/index.html`

根页面会直接加载 `src/` 中维护的 Three.js 博物馆场景，并引用 `public/echo/assets/models/` 中的真实展品模型。

## 开源场地来源

- 场地模板来源：OpenVGAL, Open Virtual Gallery, `https://github.com/lbartworks/openvgal`
- 许可：MIT License，副本保存在 `public/venue/openvgal/LICENSE`
- 当前只拷贝了运行所需的 Minimalist 模板 GLB 与模板 catalog，没有引入 OpenVGAL 的完整工程。

## 开源许可

本项目源码以 MIT License 开源，见 `LICENSE`。

第三方 3D 场地、模型、扫描数据和示例资源仍归各自作者或机构所有，并遵循它们自己的许可。发布、二次分发或商用前请阅读 `ATTRIBUTION.md`，其中包含 CC0、CC BY、CC BY-NC、CC BY-NC-SA、MIT 等不同来源说明。

## 重新导入 Echo 导出包

默认从项目根目录的 `3D 世界文物馆.exported.echo` 导入：

```bash
npm run import:echo
```

也可以指定另一个包：

```bash
ECHO_EXPORT="/path/to/app.exported.echo" npm run import:echo
```

## 常用命令

```bash
npm run build
npm run preview
```

## Git 维护建议

- 提交源码、配置、`package-lock.json` 和文档。
- 不提交 `node_modules/`、`dist/`、本地 `.env*` 文件。
- `public/echo/assets/models/*.bin` 是大模型资源，已经用 `.gitattributes` 标记为二进制并禁用 diff。
- 当前单个模型文件均小于 GitHub 100MB 单文件限制；如果后续加入更大的 GLB/纹理资源，建议迁移到 Git LFS。
- 每次改动后至少运行 `npm run build`，确认 TypeScript 和生产构建都能通过。
