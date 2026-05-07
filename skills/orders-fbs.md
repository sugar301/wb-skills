# WB Orders FBS — 订单、供应、通行证

> **调用**: `node wb-cli.mjs [-s <店铺>] <域>.<动作> '<JSON参数>'`
> **密钥**: 已内置在 `config.json`
> **适用场景**: 所有与订单、发货、物流相关的查询，**优先使用此技能而非 analytics**
> **多店铺**: 加 `-s <店铺名>` 切换

## 重要规则

1. 🔍 **只读操作**（查询/列表）直接执行
2. ⚠️ **修改操作**（取消/发货/创建/删除/设置元数据）必须先展示操作内容，获得用户明确同意后再执行
3. 🚫 **绝对禁止** 不经确认直接执行任何修改操作
4. 📦 订单相关查询优先用此技能，不要用 analytics
5. ⚡ **批量解析商品**: 订单列表返回 SKU 时，用 `products.batchGet '{"skus":[...]}'` 一次性拿到所有商品名，**严禁逐个 products.get**

---

## 一、订单查询（只读，直接执行）

```bash
# 新订单
node wb-cli.mjs orders.new

# 订单列表 — dateFrom/dateTo 为 Unix 时间戳，最多30天范围
node wb-cli.mjs orders.list '{"dateFrom":1714435200,"dateTo":1751327999,"limit":50}'

# 订单状态
node wb-cli.mjs orders.status '{"orders":[12345,67890]}'

# 归档订单（3个月前的历史订单）
node wb-cli.mjs orders.archive '{"year":2024,"month":5,"limit":100}'

# 订单元数据
node wb-cli.mjs orders.meta.get '{"orders":[12345]}'
```

### 订单贴纸（只读）
```bash
node wb-cli.mjs orders.stickers '{"orders":[12345],"type":"png","width":58,"height":40}'
# type: svg|zplv|zplh|png, size: 58x40 或 40x30
```

---

## 二、订单修改 ⚠️ 全部需用户确认

### 取消订单
```bash
# ⚠️ 执行前必须告知用户: "即将取消订单 xxx，确认吗？"
node wb-cli.mjs orders.cancel '{"orderId":12345}'
```

### 设置订单元数据
```bash
# ⚠️ 执行前告知用户: 订单号、设置的元数据类型和值
node wb-cli.mjs orders.meta.set '{"orderId":12345,"type":"sgtin","value":"0463001000001"}'
# type: sgtin | uin(16位) | imei(15位) | gtin(13位) | expiration(dd.mm.yyyy) | customs(报关单号)

# ⚠️ 删除元数据也需确认
node wb-cli.mjs orders.meta.delete '{"orderId":12345,"key":"imei"}'
```

---

## 三、供应管理

### 查询（只读，直接执行）
```bash
node wb-cli.mjs supplies.list '{"limit":20}'
node wb-cli.mjs supplies.get '{"supplyId":"WB-Gi-12345678"}'
node wb-cli.mjs supplies.qrcode '{"supplyId":"WB-Gi-12345678","type":"png"}'
```

### 修改 ⚠️ 需用户确认
```bash
# 创建供应
# ⚠️ 告知: "即将创建供应 '名称'"
node wb-cli.mjs supplies.create '{"name":"今日发货"}'

# 加订单到供应 — ⚠️ 告知: "即将把订单 [xxx,xxx] 加入供应 xxx"
node wb-cli.mjs supplies.addOrders '{"supplyId":"WB-Gi-12345678","orders":[123,456]}'

# 转为配送（关闭供应，所有订单变 complete）— ⚠️ 必须确认！
node wb-cli.mjs supplies.deliver '{"supplyId":"WB-Gi-12345678"}'

# 删除供应（必须为空供应）
node wb-cli.mjs supplies.delete '{"supplyId":"WB-Gi-12345678"}'
```

---

## 四、通行证

### 查询（只读）
```bash
node wb-cli.mjs passes.offices
node wb-cli.mjs passes.list
```

### 创建/删除 ⚠️ 需用户确认
```bash
# ⚠️ 告知: "即将为仓库 15 创建通行证，司机: Alex Petrov, 车牌: A456BC123"
node wb-cli.mjs passes.create '{"firstName":"Alex","lastName":"Petrov","carModel":"Lamborghini","carNumber":"A456BC123","officeId":15}'

# ⚠️ 告知: "即将删除通行证 123"
node wb-cli.mjs passes.delete '{"passId":123}'
```

---

## 标准发货流程（参考）

每一步修改操作都需要用户确认：

1. `orders.new` — 查询新订单
2. `orders.meta.set` — 设置标签/IMEI 等 ⚠️确认
3. `supplies.create` — 创建供应 ⚠️确认
4. `supplies.addOrders` — 加订单到供应 ⚠️确认
5. `orders.stickers` — 打印贴纸
6. `supplies.qrcode` — 打印供应 QR 码
7. `supplies.deliver` — 完成发货 ⚠️确认
