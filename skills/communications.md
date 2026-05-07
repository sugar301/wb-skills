# WB Communications — 客户沟通

> **调用**: `node wb-cli.mjs [-s <店铺>] communications.<动作> '<JSON参数>'`
> **密钥**: 已内置在 `config.json`
> **多店铺**: 加 `-s <店铺名>` 切换

## 重要规则

1. 🔍 **查询操作**（列表/计数）直接执行
2. ⚠️ **回复/发送消息** 必须先展示回复内容，获得用户明确同意后再执行
3. 🚫 **绝对禁止** 不经确认代用户发送任何消息或回复
4. ⚡ 评价/问题列表含 SKU 时，用 `products.batchGet '{"skus":[...]}'` 一次性解析商品名，**严禁逐个 products.get**

---

## 一、问答（Questions）

### 查询（只读，直接执行）
```bash
# 未回复的问题
node wb-cli.mjs communications.questions '{"isAnswered":false,"take":10,"order":"dateDesc"}'

# 某商品的问题
node wb-cli.mjs communications.questions '{"nmId":123,"take":10}'
```

### 回复 ⚠️ 需用户确认
```bash
# ⚠️ 必须先展示: "即将回复问题 xxx: [回复内容]"
node wb-cli.mjs communications.questionReply '{"id":"abc123","text":"感谢您的提问！这款产品是纯棉材质。"}'
```

---

## 二、评价（Feedbacks）

### 查询（只读，直接执行）
```bash
# 未回复的评价
node wb-cli.mjs communications.feedbacks '{"isAnswered":false,"take":10,"order":"dateDesc"}'

# 某商品的评价
node wb-cli.mjs communications.feedbacks '{"nmId":123,"take":10}'
```

### 回复 ⚠️ 需用户确认
```bash
# ⚠️ 必须先展示: "即将回复评价 xxx: [回复内容]"
node wb-cli.mjs communications.feedbackReply '{"id":"def456","text":"感谢您的评价！我们会继续努力。"}'
```

---

## 三、聊天（Chats）

### 查询（只读，直接执行）
```bash
node wb-cli.mjs communications.chats
node wb-cli.mjs communications.chatEvents '{"next":1714435200000}'
```

### 发送消息 ⚠️ 需用户确认
```bash
# ⚠️ 必须先展示: "即将向 [客户] 发送: [消息内容]"
node wb-cli.mjs communications.sendMessage '{"replySign":"chat_sign_xxx","message":"您好，您的订单已发货"}'
```

---

## 四、退货（Returns）

### 查询（只读，直接执行）
```bash
# 进行中的退货申请 (14天内)
node wb-cli.mjs communications.returns '{"isArchive":false,"limit":20}'
```

### 回复 ⚠️ 需用户确认
```bash
# ⚠️ 必须先展示: "即将处理退货申请 xxx: [动作] [备注]"
node wb-cli.mjs communications.returnReply '{"id":"uuid","action":"approve","comment":""}'
# action 从 GET returns 的 actions 数组中获取
```
