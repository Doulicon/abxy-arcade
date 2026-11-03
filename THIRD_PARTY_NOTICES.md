# 开源依赖合规分析报告

> 项目：ABXY ARCADE（原 ENLU ARCADE / ZXCV ARCADE）
> 文档目的：盘点本项目直接依赖的开源组件及其许可证，分析合规风险，并给出规避建议。
> 生成日期：2026-11-03

---

## 一、依赖清单与许可证

### 后端运行时（server / package.json）

| 依赖 | 版本 | 许可证 | 用途 | 风险等级 |
| --- | --- | --- | --- | --- |
| express | 4.22.x | MIT | Web 服务器框架 | 低 |
| better-sqlite3 | 11.10.0 | MIT | SQLite 数据库 | 低 |
| bcryptjs | 2.4.3 | MIT | 密码哈希 | 低 |
| jsonwebtoken | 9.0.3 | MIT | JWT 鉴权 | 低 |
| multer | 2.5.0 | MIT | 文件上传 | 低 |
| nanoid | 5.1.16 | MIT | 生成唯一 ID | 低 |
| cookie-parser | 1.4.7 | MIT | 解析 Cookie | 低 |

### 前端（web / package.json）

| 依赖 | 版本 | 许可证 | 用途 | 风险等级 |
| --- | --- | --- | --- | --- |
| react | 18.3.1 | MIT | UI 框架 | 低 |
| react-dom | 18.3.1 | MIT | DOM 渲染 | 低 |
| react-router-dom | 6.30.6 | MIT | 前端路由 | 低 |
| vite | 5.4.21 | MIT | 构建工具 | 低 |
| tailwindcss | 3.4.19 | MIT | CSS 框架 | 低 |
| typescript | 5.9.3 | Apache-2.0 | 类型系统 | 低 |
| @vitejs/plugin-react | 4.7.0 | MIT | Vite React 插件 | 低 |
| autoprefixer | 10.6.2 | MIT | CSS 前缀 | 低 |
| postcss | 8.5.32 | MIT | CSS 处理 | 低 |

### 随仓库分发的运行时（server/public/emulatorjs）

| 组件 | 版本 | 许可证 | 用途 | 风险等级 |
| --- | --- | --- | --- | --- |
| EmulatorJS | 4.2.3 | GPL-3.0 | 浏览器端模拟器前端 | **高** |
| 内核（RetroArch/Libretro cores） | 随 EmulatorJS | 各内核不同（多为 GPL/MIT/BSD/非商业） | 各主机/街机模拟内核 | **高** |
| nipplejs（摇杆） | 随 EmulatorJS | MIT | 虚拟摇杆 | 低 |
| socket.io（客户端） | 随 EmulatorJS | MIT | 通信 | 低 |

---

## 二、风险分析

### 1. GPL-3.0 传染性风险（最高优先级）

- **EmulatorJS 采用 GPL-3.0**。GPL 是「强 Copyleft」许可证：任何对 GPL 代码的**分发/再分发**都必须以 GPL-3.0 开源其**衍生作品**的完整源代码。
- 本项目当前通过 `express.static` 将 EmulatorJS 作为静态资源**原样分发**（未修改其代码），这是允许的，但前提是：
  - 必须**保留** EmulatorJS 的版权声明与许可证文本；
  - 若未来对 EmulatorJS 的 JS 做任何**修改**，则该修改后的整体需以 GPL-3.0 开源。
- 关键结论：**本项目的前后端业务代码（React + Express）目前是独立调用 EmulatorJS，未与 GPL 代码静态链接/合并到同一分发文件，因此不必然被 GPL 传染**；但必须在「关于」页和分发物中显式注明 EmulatorJS 及其 GPL 许可，并提供其源码获取途径。

### 2. 模拟器内核的许可证多样性风险

- EmulatorJS 内部通过 RetroArch 加载各平台的 Libretro 内核。**不同内核许可证不同**：
  - 部分内核为 GPL / LGPL（开源可商用，但衍生须开源）；
  - 部分为**非商业**许可证（禁止商用）或**闭源**；
  - 部分（如某些 BIOS 依赖）受版权保护。
- 若本项目用于**商业用途**（收费、广告盈利），需逐个确认所用内核是否允许商用，否则存在法律风险。

### 3. BIOS / ROM 版权风险（与开源协议无关，但同样重要）

- 项目涉及 ROM 与 BIOS 文件的上传与运行。ROM/BIOS 本身是受版权保护的商业作品，**并非开源软件**，其分发责任由上传者/运营者承担。需在界面与文档中明确「用户需持有合法正版副本」的免责声明（本项目已有 footer.disclaimer）。

### 4. 依赖过时 / 安全风险

- `better-sqlite3`、`jsonwebtoken`、`express` 等存在历史安全公告（如 jsonwebtoken 的 CVE、express 的依赖问题）。应定期 `npm audit` 并升级。
- Node 版本要求 `>=20`，需保持受支持的 LTS 版本以获得安全补丁。

### 5. Apache-2.0 与 MIT 的归属声明要求

- MIT、Apache-2.0 均为宽松许可证，允许商用与闭源，但**都要求保留原版权声明与许可证文本**。当前项目在 `node_modules` 内保留了这些文件（安装时自动带上），但若未来做**打包分发**（如 Electron 打包、Docker 镜像、压缩包），需确认这些许可证文本被一并带上。

---

## 三、需要做什么来规避风险

### 必须做（合规底线）

1. **在「关于」页展示开源鸣谢与许可证声明**
   - 列出 EmulatorJS（GPL-3.0）及所有直接依赖（MIT / Apache-2.0）。
   - 标注各组件许可证名称，并提供官方链接（本项目 `/about` 页面已实现）。

2. **在分发物中附带 `THIRD_PARTY_NOTICES.md`**
   - 汇总所有第三方组件的名称、版本、许可证全文或摘要，与源代码/构建产物一起分发。

3. **保留 EmulatorJS 的版权与许可证**
   - 不要删除 `server/public/emulatorjs` 内自带的许可证/版权信息；若上游未附带 LICENSE 文件，应从 EmulatorJS 官方仓库（github.com/EmulatorJS/EmulatorJS）获取 GPL-3.0 全文并放入该目录，同时提供源码链接。

4. **明确 ROM/BIOS 合法性免责声明**
   - 在页脚、README、以及上传界面明确「用户须持有游戏与 BIOS 的合法正版副本，禁止上传侵权内容」，避免运营者承担间接责任。

### 强烈建议（降低风险）

5. **商用前进行内核许可证审计**
   - 若计划商用，逐项核查 `server/public/emulatorjs/cores` 下所用内核的许可证，剔除或替换「非商业」内核。

6. **定期安全扫描与升级**
   - 执行 `npm audit` / `npm audit fix`，将 `express`、`jsonwebtoken`、`better-sqlite3` 等保持最新。
   - 保持 Node.js LTS 版本。

7. **不要把业务代码与 GPL 代码编译进同一 JS 产物**
   - 继续保持「前端业务代码与 EmulatorJS 运行时分离加载」的架构，避免触发 GPL 传染。

8. **建立 SBOM（软件物料清单）**
   - 用 `npm ls --all` 或工具（如 `cyclonedx`、`syft`）生成依赖清单，随版本发布存档，便于合规审计。

---

## 四、结论

- **整体风险：可控，但存在一处高优先级关注点（EmulatorJS 的 GPL-3.0）及模拟器内核许可证的商用不确定性。**
- 本项目主体（React + Express 业务代码）使用 MIT / Apache-2.0 依赖，商用与闭源均无障碍；唯一需要严格对待的是 **EmulatorJS（GPL-3.0）与各模拟内核**的 Copyleft 与非商业条款。
- 只要满足上文「必须做」的四点（尤其保留许可证声明、在关于页鸣谢、附带 THIRD_PARTY_NOTICES、明确 ROM/BIOS 免责声明），即可有效规避绝大多数合规与法律风险。
