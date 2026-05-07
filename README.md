<p align="center">
  <h1 align="center">🛒 WB Skills</h1>
  <p align="center"><b>让你的 Wildberries 店铺接入 AI</b></p>
  <p align="center">
    <sub>零依赖 · 多店铺 · 密钥隔离 · 一句话命令</sub>
  </p>
</p>

---

将 Wildberries OpenAPI 封装为 AI 可直接调用的命令行工具。接入 Claude、GPT、Copilot 等任意 AI 平台后，用自然语言管理你的 WB 店铺。

## AI 能做什么

| 场景 | 自然语言示例 | 实际命令 |
|------|-------------|----------|
| 📦 查商品 | "SKU ABC123 是哪个商品" | `products.get '{"sku":"ABC123"}'` |
| 📋 商品列表 | "列出我最近的商品" | `products.list '{"limit":10}'` |
| 🛒 新订单 | "今天有多少新订单" | `orders.new` |
| 📊 订单详情 | "最近 7 天的订单" | `orders.list '{"dateFrom":...}'` |
| 💬 回复评价 | "帮我看有没有差评" | `communications.feedbacks '{"isAnswered":false}'` |
| ✅ 确认发货 | "把订单加到供应并发货" | `supplies.addOrders` + `supplies.deliver` |
| 📈 销售分析 | "这个月卖得怎么样" | `analytics.funnel '{"limit":10}'` |
| 🔍 搜商品 | "搜一下 '袜子' 相关商品" | `products.list '{"search":"袜子"}'` |
| 🏷️ 库存状况 | "哪些商品缺货了" | `analytics.stocksProducts` |
| 🖼️ 上传图片 | "给商品上传主图" | `products.mediaUpload '{"filePath":"..."}'` |

## 为什么选这个

- **密钥隔离** — API Key 只存在 `config.json`，AI 永远不接触
- **多店铺** — 一个 `config.json` 管理多个店铺，`-s store2` 随时切换
- **零依赖** — 仅需 Node.js ≥ 18，`npm install` 都不需要
- **安全确认** — 修改操作（发货/删除/取消/回复）必须用户二次确认才执行
- **内置优化** — 批量查商品、智能压缩响应，节省 AI token
- **纯 CLI** — 输出 JSON 到 stdout，任何 AI 平台都能解析

## 5 分钟接入

```bash
# 1. 克隆
git clone https://github.com/sugar301/wb-skills.git
cd wb-skills

# 2. 编辑 config.json
{
  "stores": {
    "main": { "name": "主店铺", "apiKey": "你的WB_API_KEY" },
    "二店":   { "name": "第二家店", "apiKey": "另一个KEY" }
  },
  "default": "main"
}

# 3. 验证
node wb-cli.mjs --stores          # 列出店铺
node wb-cli.mjs orders.new        # 查默认店铺新订单
node wb-cli.mjs -s 二店 orders.new # 查二店新订单
```

## 作为 AI Skill 使用

将文件夹放入任意 AI 工具的 skills 目录：

- **Claude Code**: 放入 `CLAUDE.md` 同级
- **Cursor**: 放入 `.cursor/skills/`
- **自定义 GPT**: 导入 `SKILL.md` 作为 Instructions

AI 自动加载 `SKILL.md` 获取规则 → 按需读取 `skills/*.md` 获取具体命令 → 执行 `node wb-cli.mjs`。

## 命令总览

```
products.*     商品管理 — categories, subjects, brands, list, get, batchGet,
               create, update, trash, recover, tags, mediaUpload, warehouses

orders.*       订单管理 — new, list, status, cancel, stickers, archive, meta.*

supplies.*     供应管理 — create, list, get, addOrders, deliver, delete, qrcode

passes.*       通行证   — offices, list, create, delete

communications.* 客户沟通 — questions, feedbacks, chats, returns, replies

analytics.*    数据分析 — funnel, searchReport, stocks, csv
```

```bash
node wb-cli.mjs --help   # 完整帮助
```

## 安全模型

```
AI (只知道命令格式) → node wb-cli.mjs (读 config.json, 注入 Key) → WB API
                              ↑
                     config.json (gitignored, 密钥在此终结)
```

- 🔍 查询类操作：AI 直接执行
- ⚠️ 修改类操作：AI **必须先展示内容并获用户确认**，否则拒绝执行

## 许可证

MIT
