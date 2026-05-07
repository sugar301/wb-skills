# WB Analytics — 数据分析

> **调用**: `node wb-cli.mjs [-s <店铺>] analytics.<动作> '<JSON参数>'`
> **密钥**: 已内置在 `config.json`
> **多店铺**: 加 `-s <店铺名>` 切换

## ⚠️ 限流严重，谨慎使用！

| 接口组 | Personal/Service | Base |
|--------|------------------|------|
| 销售漏斗 / 搜索报告 | 3 req/min | 2 req/h |
| CSV 报表 | 3 req/min | 1 req/h |
| 库存报告 | 3 req/min | 2 req/h |

> **原则**: analytics 是稀缺资源，只在用户明确要求数据分析时才调用。
> 订单/评价/聊天等查询请优先用 orders-fbs 和 communications 技能，它们不限流或限流宽松得多。

## 重要规则

1. 🔍 所有 analytics 命令均为只读，可直接执行
2. 🐌 **同一次对话中最多调用 2 次**，优先合并查询
3. 📅 默认时间范围尽量短（7天以内），仅在用户明确要求时才扩大
4. ⏰ 间隔至少 30 秒再发下一次请求

---

## 一、销售漏斗

```bash
# 本月 vs 上月 (全部商品)
node wb-cli.mjs analytics.funnel '{"limit":10,"orderBy":{"field":"orderCount","mode":"desc"}}'

# 指定商品 + 指定时间
node wb-cli.mjs analytics.funnel '{"selectedPeriod":{"start":"2024-06-01","end":"2024-06-30"},"pastPeriod":{"start":"2024-05-01","end":"2024-05-31"},"filters":{"nmIds":[12345]},"limit":10}'

# 近7天按日统计 (最多7天)
node wb-cli.mjs analytics.funnelDaily '{"nmIds":[12345],"aggregationLevel":"day"}'

# 按分组统计 — 需指定科目/品牌/标签
node wb-cli.mjs analytics.funnelGrouped '{"subjectIds":[1],"brandNames":["品牌名"],"aggregationLevel":"day"}'
```

## 二、搜索报告

```bash
# 搜索报告主页
node wb-cli.mjs analytics.searchReport '{"limit":10}'

# 某商品的搜索词TOP
node wb-cli.mjs analytics.searchTexts '{"nmIds":[12345],"limit":20}'
```

## 三、库存报告

```bash
# WB 仓库库存
node wb-cli.mjs analytics.stocksWB '{"nmIds":[12345],"limit":100}'

# 按分组汇总
node wb-cli.mjs analytics.stocksGroups '{"stockType":"wb"}'

# 按商品
node wb-cli.mjs analytics.stocksProducts '{"nmIds":[12345]}'

# 按尺码
node wb-cli.mjs analytics.stocksSizes '{"nmID":12345}'

# 按仓库
node wb-cli.mjs analytics.stocksOffices '{"nmIds":[12345]}'

# 可选筛选:
# stockType: ""(全部)/"wb"/"mp"
# availabilityFilters: ["deficient","actual","balanced","nonActual","nonLiquid","invalidData"]
```

## 四、CSV 报表（限流最严：Base 1 req/h）

```bash
# 创建报表任务
node wb-cli.mjs analytics.csvCreate '{"reportType":"DETAIL_HISTORY_REPORT","selectedPeriod":{"start":"2024-01-01","end":"2024-06-01"},"nmIds":[12345]}'

# reportType:
#   DETAIL_HISTORY_REPORT          — 按货号销售漏斗 (需Jam)
#   GROUPED_HISTORY_REPORT         — 分组销售漏斗 (需Jam)
#   SEARCH_QUERIES_PREMIUM_REPORT_* — 搜索参数报告 (需Jam)
#   STOCK_HISTORY_REPORT_CSV       — 库存指标
#   STOCK_HISTORY_DAILY_CSV        — 库存历史

# 查任务状态
node wb-cli.mjs analytics.csvList

# 下载报表
node wb-cli.mjs analytics.csvDownload '{"downloadId":"uuid"}'
```
