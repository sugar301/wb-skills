# WB Products — 商品管理

> **调用**: `node wb-cli.mjs [-s <店铺>] products.<动作> '<JSON参数>'`
> **密钥**: 已内置在 `config.json`，调用时无需传 Key
> **多店铺**: 加 `-s <店铺名>` 切换，如 `-s store2`。不指定用 default。

## 重要规则

1. **只读操作直接执行**，不需要确认
2. **修改/创建/删除操作** ⚠️ 必须先展示将要执行的操作，获得用户明确同意后再执行
3. 返回数据较多时，自动用 limit 分页，每页不超过 20 条

---

## 目录与类目（只读）

```bash
# 一级类目
node wb-cli.mjs products.categories '{"locale":"zh"}'

# 科目/子类目 — 可按名称搜索
node wb-cli.mjs products.subjects '{"name":"袜子","limit":10}'

# 科目特征 — 查某科目下有哪些属性
node wb-cli.mjs products.characteristics '{"subjectId":105,"locale":"zh"}'

# 品牌
node wb-cli.mjs products.brands '{"subjectId":105}'
```

目录值查询：
```bash
node wb-cli.mjs products.directory '{"type":"colors","locale":"zh"}'
# type: colors | kinds(性别) | countries(产地) | seasons | vat(税率) | tnved(HS编码)
# tnved 需额外传 subjectID
node wb-cli.mjs products.directory '{"type":"tnved","subjectID":105,"search":6204}'
```

### 标签（只读）
```bash
node wb-cli.mjs products.tags
```

---

## 商品卡

### 查询（只读，直接执行）

```bash
# 按 SKU 查单个 (完整数据, 含全部图片)
node wb-cli.mjs products.get '{"sku":"ABC123M"}'

# ⚡ 批量查 (默认完整, 最多30个)
node wb-cli.mjs products.batchGet '{"skus":["ABC123M","DEF456L","GHI789XL"]}'

# ⚡⚡ 批量查 compact 模式 — 只返回 首图+关键字段, 省 token
node wb-cli.mjs products.batchGet '{"skus":["ABC123M","DEF456L"],"compact":true}'
```
compact 模式只保留: nmID, vendorCode, title, brand, subjectName, 首张图片, 尺码概要(chrtID/techSize/price), createdAt。

> **推荐**: 订单/评价列表拿到的 SKU 批量解析用 compact 模式, 省 80%+ 数据量。

### 创建/编辑/删除 ⚠️ 全部需用户确认

> **严禁不经确认执行。** 必须先向用户展示完整的操作内容和参数，获得明确同意后再执行。

#### 创建商品卡
```bash
# ⚠️ 必须先展示将要创建的商品，获得确认后执行
# 结构: [ { subjectID, variants: [{ vendorCode, brand, title, ... }] } ]
node wb-cli.mjs products.create '{"cards":[{
  "subjectID": 50,
  "variants": [{
    "vendorCode": "TEST001",
    "brand": "品牌名",
    "title": "商品标题",
    "description": "商品描述",
    "dimensions": { "length": 25, "width": 8, "height": 18, "weightBrutto": 0.5 },
    "sizes": [{ "techSize": "M", "wbSize": "50", "price": 2500, "skus": ["TEST001BK"] }]
  }]
}]}'
```

> **v2 接口结构**: 顶层是数组，每项含 `subjectID`（科目ID）和 `variants`（商品变体数组，1-30个）。
> `weightBrutto` 单位是 **kg**，最多 3 位小数。
> `vendorCode` 必填，最多 72 字符。

#### 编辑商品卡
```bash
# ⚠️ 全量覆盖，需展示改动内容后确认
# 结构同创建，variants 内每项追加 nmID
node wb-cli.mjs products.update '{"cards":[{
  "nmID": 12345,
  "variants": [{
    "nmID": 12345,
    "vendorCode": "ABC123",
    "title": "新标题",
    "sizes": [{ "chrtID": 678, "price": 2490 }]
  }]
}]}'
```
> 编辑是全量覆盖，不传的字段会被清空。仅改价格可最小化数据。

#### 移入回收站
```bash
# ⚠️ 必须先展示: "即将删除商品 [12345, 67890]，确认吗？"
node wb-cli.mjs products.trash '{"nmIDs":[12345,67890]}'
```

#### 从回收站恢复
```bash
# ⚠️ 必须先展示: "即将恢复商品 [12345, 67890]"
node wb-cli.mjs products.recover '{"nmIDs":[12345,67890]}'
```

---

## 商品图片 ⚠️ 需用户确认

### 上传图片
```bash
# ⚠️ 必须先告知: 即将上传的文件路径和关联顺序
node wb-cli.mjs products.mediaUpload '{"filePath":"C:/photos/product1.jpg","photoNumber":1}'
```
- `filePath` — 本地图片文件路径 (jpg/png/gif/bmp/webp) 或视频 (mp4/mov)
- `photoNumber` — 图片排序号，1开始递增

### 关联图片到商品卡
```bash
# ⚠️ 必须先确认: 要将图片 fileId xxx 关联到商品 nmID xxx
node wb-cli.mjs products.mediaLink '{"nmID":12345,"fileId":"abc123","photoNumber":1}'
```
- `fileId` — 来自 `products.mediaUpload` 返回的 data 中的 fileId

---

## 仓库与库存（只读）

```bash
# 仓库列表
node wb-cli.mjs products.warehouses

# 某仓库的库存
node wb-cli.mjs products.stocks '{"warehouseId":123,"limit":50}'
```

> 仓库的创建/修改/删除操作 ⚠️ 需用户确认。当前 CLI 仅封装了查询。
