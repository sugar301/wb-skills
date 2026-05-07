#!/usr/bin/env node
/**
 * wb-cli — Wildberries Marketplace CLI
 *
 * 封装所有 WB API，AI 通过命令行调用此脚本，不直接接触 API Key。
 *
 * 用法:
 *   node wb-cli.mjs <命令> [JSON参数]
 *
 * 命令格式: <域>.<动作>
 *
 * 示例:
 *   node wb-cli.mjs products.categories
 *   node wb-cli.mjs products.list '{"limit":10}'
 *   node wb-cli.mjs orders.new
 *   node wb-cli.mjs orders.list '{"dateFrom":1714435200,"limit":50}'
 *   node wb-cli.mjs analytics.funnel '{"selectedPeriod":{"start":"2024-06-01","end":"2024-06-30"}}'
 *   node wb-cli.mjs communications.feedbacks '{"isAnswered":false,"take":20,"skip":0}'
 *   node wb-cli.mjs --help
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 配置 ──────────────────────────────────────────────────
const configRaw = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));

// 兼容旧单 key 格式
let stores;
if (configRaw.stores) {
  stores = configRaw.stores;
} else if (configRaw.wbApiKey) {
  stores = { main: { name: '默认店铺', apiKey: configRaw.wbApiKey } };
  configRaw.default = 'main';
} else {
  console.error(JSON.stringify({ error: '请在 config.json 中配置 stores 或 wbApiKey' }));
  process.exit(1);
}

const defaultStore = configRaw.default || Object.keys(stores)[0];
let selectedStore = defaultStore;

function getApiKey() {
  const store = stores[selectedStore];
  if (!store) throw new Error(`未知店铺: ${selectedStore}, 可用: ${Object.keys(stores).join(', ')}`);
  return store.apiKey;
}

// ─── 服务器映射 ────────────────────────────────────────────
const SERVERS = {
  content:          'https://content-api.wildberries.ru',
  marketplace:      'https://marketplace-api.wildberries.ru',
  feedbacks:        'https://feedbacks-api.wildberries.ru',
  chat:             'https://buyer-chat-api.wildberries.ru',
  returns:          'https://returns-api.wildberries.ru',
  analytics:        'https://seller-analytics-api.wildberries.ru',
};

// ─── HTTP 请求 ─────────────────────────────────────────────
async function api(server, method, path, query, body) {
  const base = SERVERS[server];
  if (!base) throw new Error(`未知服务器: ${server}, 可用: ${Object.keys(SERVERS).join(', ')}`);

  let url = base + path;
  if (query && Object.keys(query).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    }
    if (qs.toString()) url += '?' + qs.toString();
  }

  const opts = {
    method,
    headers: {
      Authorization: getApiKey(),
      Accept: 'application/json',
    },
  };

  if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';

  if (ct.includes('json')) {
    const data = await res.json();
    return { status: res.status, data };
  }

  // 二进制 (如贴纸、报表文件)
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: ct,
    size: buf.length,
    base64: buf.toString('base64'),
    __binary: true,
  };
}

// ─── 媒体上传 (multipart/form-data) ────────────────────────
async function uploadMedia(filePath, photoNumber) {
  if (!existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`);

  const fileBuffer = readFileSync(filePath);
  const fileName = basename(filePath);
  const fileStat = statSync(filePath);

  // 探测 MIME 类型
  const ext = fileName.split('.').pop().toLowerCase();
  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo' };
  const mimeType = mimeMap[ext] || 'application/octet-stream';

  // 手动构建 multipart body
  const boundary = `----WBCLI${Date.now()}`;
  const CRLF = '\r\n';
  const parts = [];

  // uploadfile 字段
  parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="uploadfile"; filename="${fileName}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`));
  parts.push(fileBuffer);

  // photo_number 字段
  parts.push(Buffer.from(`${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="photo_number"${CRLF}${CRLF}${photoNumber}`));

  // 结束
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

  const body = Buffer.concat(parts);

  const res = await fetch(`${SERVERS.content}/content/v2/media/file`, {
    method: 'POST',
    headers: {
      Authorization: getApiKey(),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Accept: 'application/json',
    },
    body,
  });

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) {
    const data = await res.json();
    return { status: res.status, data };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, contentType: ct, size: buf.length };
}

// ─── 参数解析 ──────────────────────────────────────────────
const rawArgv = process.argv.slice(2);

// 提取全局选项 (--store/-s, --stores)
const cmdArgv = [];
for (let i = 0; i < rawArgv.length; i++) {
  if (rawArgv[i] === '--store' || rawArgv[i] === '-s') {
    selectedStore = rawArgv[++i];
    if (!selectedStore || stores[selectedStore] === undefined) {
      console.error(JSON.stringify({ error: `未知店铺: ${selectedStore || '(未指定)'}`, available: Object.keys(stores) }));
      process.exit(1);
    }
  } else if (rawArgv[i] === '--stores' || rawArgv[i] === '--list-stores') {
    const list = {};
    for (const [k, v] of Object.entries(stores)) {
      list[k] = { name: v.name, default: k === defaultStore, active: k === selectedStore };
    }
    console.log(JSON.stringify({ stores: list, default: defaultStore }, null, 2));
    process.exit(0);
  } else {
    cmdArgv.push(rawArgv[i]);
  }
}
const argv = cmdArgv;

if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
  console.log('用法: node wb-cli.mjs [-s <店铺>] <命令> [JSON参数]');
  console.log('');
  console.log(`当前店铺: ${selectedStore} (${stores[selectedStore]?.name || '?'})  |  可用: ${Object.keys(stores).join(', ')}`);
  console.log('切换: -s <店铺名>    列店铺: --stores');
  console.log('命令列表:');
  console.log('  products.categories        一级类目');
  console.log('  products.subjects          科目列表');
  console.log('  products.characteristics   科目特征 (需 subjectId)');
  console.log('  products.brands            品牌 (需 subjectId)');
  console.log('  products.directory         目录值 (type: colors|kinds|countries|seasons|vat|tnved)');
  console.log('  products.list              商品卡列表');
  console.log('  products.get               ⚡ 按 SKU 精确查单个商品');
  console.log('  products.batchGet          ⚡⚡ 批量按 SKU 查商品 (skus 数组, 最多30)');
  console.log('  products.create            ⚠️ 创建商品卡 (需 cards 数组)');
  console.log('  products.update            ⚠️ 编辑商品卡 (需 cards 数组, 含 nmID)');
  console.log('  products.trash             ⚠️ 移入回收站 (需 nmIDs)');
  console.log('  products.recover           ⚠️ 从回收站恢复 (需 nmIDs)');
  console.log('  products.tags              标签列表');
  console.log('  products.mediaUpload       ⚠️ 上传商品图片 (需 filePath)');
  console.log('  products.mediaLink         ⚠️ 关联图片到商品 (需 nmID, fileId)');
  console.log('  products.warehouses        仓库列表');
  console.log('  products.stocks            仓库库存');
  console.log('');
  console.log('  orders.new                 新订单');
  console.log('  orders.list                订单列表');
  console.log('  orders.status              订单状态');
  console.log('  orders.cancel              取消订单 (需 orderId)');
  console.log('  orders.stickers            订单贴纸 (需 type, width, height, orders)');
  console.log('  orders.archive             归档订单 (需 year, month)');
  console.log('');
  console.log('  orders.meta.get            获取订单元数据 (需 orders)');
  console.log('  orders.meta.set            设置订单元数据 (需 orderId, type, value)');
  console.log('  orders.meta.delete         删除订单元数据 (需 orderId, key)');
  console.log('');
  console.log('  supplies.create            创建供应');
  console.log('  supplies.list              供应列表');
  console.log('  supplies.get               供应详情 (需 supplyId)');
  console.log('  supplies.addOrders         添加订单到供应 (需 supplyId, orders)');
  console.log('  supplies.deliver           转配送 (需 supplyId)');
  console.log('  supplies.delete            删除供应 (需 supplyId)');
  console.log('  supplies.qrcode            供应QR码 (需 supplyId, type)');
  console.log('');
  console.log('  passes.offices             通行证仓库');
  console.log('  passes.list                通行证列表');
  console.log('  passes.create              创建通行证');
  console.log('  passes.delete              删除通行证 (需 passId)');
  console.log('');
  console.log('  communications.questions   问题列表');
  console.log('  communications.questionReply 回答问题');
  console.log('  communications.feedbacks   评价列表');
  console.log('  communications.feedbackReply 回复评价');
  console.log('  communications.chats       聊天列表');
  console.log('  communications.chatEvents  聊天事件');
  console.log('  communications.sendMessage 发送消息');
  console.log('  communications.returns     退货申请');
  console.log('  communications.returnReply 回复退货');
  console.log('');
  console.log('  analytics.funnel           销售漏斗 (周期对比)');
  console.log('  analytics.funnelDaily      销售漏斗 (按日)');
  console.log('  analytics.funnelGrouped    销售漏斗 (分组按日)');
  console.log('  analytics.searchReport     搜索报告主页');
  console.log('  analytics.searchTexts      商品搜索词排名');
  console.log('  analytics.stocksWB         WB仓库库存');
  console.log('  analytics.stocksGroups     库存分组');
  console.log('  analytics.stocksProducts   库存商品');
  console.log('  analytics.stocksSizes      库存尺码');
  console.log('  analytics.stocksOffices    库存仓库');
  console.log('  analytics.csvCreate        创建CSV报表');
  console.log('  analytics.csvList          报表列表');
  console.log('  analytics.csvDownload      下载报表');
  console.log('');
  console.log('示例:');
  console.log('  node wb-cli.mjs products.list \'{"limit":5}\'');
  console.log('  node wb-cli.mjs -s store2 orders.new');
  console.log('  node wb-cli.mjs --stores');
  console.log('  node wb-cli.mjs analytics.funnel \'{"selectedPeriod":{"start":"2024-01-01","end":"2024-01-31"},"limit":10}\'');
  process.exit(0);
}

const cmd = argv[0];
let params = {};
if (argv.length > 1) {
  try {
    params = JSON.parse(argv[1]);
  } catch {
    console.error(JSON.stringify({ error: `参数 JSON 解析失败: ${argv[1].substring(0, 100)}` }));
    process.exit(1);
  }
}

// ─── 命令路由 ──────────────────────────────────────────────
async function run() {
  const r = await route(cmd, params);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
}

async function route(cmd, p) {
  try {
    switch (cmd) {

      // ── Products ──────────────────────────────────────────
      case 'products.categories':
        return await api('content', 'GET', '/content/v2/object/parent/all', { locale: p.locale });

      case 'products.subjects':
        return await api('content', 'GET', '/content/v2/object/all', p);

      case 'products.characteristics':
        if (!p.subjectId) throw new Error('缺少 subjectId');
        return await api('content', 'GET', `/content/v2/object/charcs/${p.subjectId}`, { locale: p.locale });

      case 'products.brands':
        if (!p.subjectId) throw new Error('缺少 subjectId');
        return await api('content', 'GET', '/api/content/v1/brands', p);

      case 'products.directory':
        if (!p.type) throw new Error('缺少 type (colors|kinds|countries|seasons|vat|tnved)');
        return await api('content', 'GET', `/content/v2/directory/${p.type}`, { locale: p.locale, subjectID: p.subjectID, search: p.search });

      case 'products.list':
        return await api('content', 'POST', '/content/v2/get/cards/list', { locale: p.locale }, {
          settings: {
            sort: p.sort || { ascending: false },
            filter: { ...(p.filter || {}), ...(p.search ? { textSearch: p.search } : {}), withPhoto: (p.filter?.withPhoto !== undefined) ? p.filter.withPhoto : -1 },
            cursor: { limit: p.limit || 10, ...p.cursor },
          },
        });

      case 'products.get':
        if (!p.sku) throw new Error('缺少 sku');
        const res = await api('content', 'POST', '/content/v2/get/cards/list', { locale: p.locale }, {
          settings: {
            sort: { ascending: false },
            filter: { textSearch: String(p.sku), withPhoto: -1 },
            cursor: { limit: 10 },
          },
        });
        if (res.data?.cards) {
          const match = res.data.cards.find(c => hasSku(c, p.sku));
          if (match) return { status: res.status, data: p.compact ? compactCard(match, p.sku) : match };
          // 没精确匹配到 SKU，返回 textSearch 最接近的
          const best = res.data.cards[0];
          return {
            status: 404,
            error: `未精确匹配 SKU="${p.sku}"`,
            hint: 'textSearch 最接近的结果 (SKU 可能在其他尺码中)',
            bestMatch: { nmID: best.nmID, title: best.title, vendorCode: best.vendorCode, sizes: best.sizes?.map(s => ({ chrtID: s.chrtID, skus: s.skus })) }
          };
        }
        return res;

      case 'products.batchGet':
        if (!p.skus || !Array.isArray(p.skus) || p.skus.length === 0) throw new Error('缺少 skus (非空数组)');
        if (p.skus.length > 30) throw new Error('skus 最多 30 个');
        const found = [];
        const missing = [];
        for (let i = 0; i < p.skus.length; i += 5) {
          const chunk = p.skus.slice(i, i + 5);
          const chunkResults = await Promise.all(chunk.map(async (sku) => {
            const r = await api('content', 'POST', '/content/v2/get/cards/list', { locale: p.locale }, {
              settings: {
                sort: { ascending: false },
                filter: { textSearch: String(sku), withPhoto: -1 },
                cursor: { limit: 3 },
              },
            });
            if (r.data?.cards) {
              const match = r.data.cards.find(c => hasSku(c, sku));
              if (match) return p.compact ? compactCard(match, sku) : { ...match, _matchedSku: sku };
            }
            return { sku, _notFound: true };
          }));
          found.push(...chunkResults.filter(r => !r._notFound));
          missing.push(...chunkResults.filter(r => r._notFound).map(r => r.sku));
          if (i + 5 < p.skus.length) await new Promise(r => setTimeout(r, 700));
        }
        return {
          total: p.skus.length,
          found: found.length,
          missing: missing.length > 0 ? missing : undefined,
          items: found,
        };

      case 'products.create':
        if (!p.cards || !Array.isArray(p.cards) || p.cards.length === 0) throw new Error('缺少 cards (非空数组)');
        return await api('content', 'POST', '/content/v2/cards/upload', {}, p.cards);

      case 'products.update':
        if (!p.cards || !Array.isArray(p.cards) || p.cards.length === 0) throw new Error('缺少 cards (非空数组, 需含 nmID)');
        return await api('content', 'POST', '/content/v2/cards/update', {}, p.cards);

      case 'products.trash':
        if (!p.nmIDs || !Array.isArray(p.nmIDs) || p.nmIDs.length === 0) throw new Error('缺少 nmIDs (非空数组, 最多1000)');
        return await api('content', 'POST', '/content/v2/cards/delete/trash', {}, { nmIDs: p.nmIDs });

      case 'products.recover':
        if (!p.nmIDs || !Array.isArray(p.nmIDs) || p.nmIDs.length === 0) throw new Error('缺少 nmIDs (非空数组, 最多1000)');
        return await api('content', 'POST', '/content/v2/cards/recover', {}, { nmIDs: p.nmIDs });

      case 'products.tags':
        return await api('content', 'GET', '/content/v2/tags');

      case 'products.mediaUpload':
        if (!p.filePath) throw new Error('缺少 filePath (本地图片路径)');
        return await uploadMedia(p.filePath, p.photoNumber || 1);

      case 'products.mediaLink':
        if (!p.nmID || !p.fileId) throw new Error('缺少 nmID, fileId');
        return await api('content', 'POST', '/content/v2/media/save', {}, {
          nmID: p.nmID,
          photoNumber: p.photoNumber || 1,
          fileId: p.fileId,
        });

      case 'products.warehouses':
        return await api('content', 'GET', '/api/v3/offices', { limit: p.limit || 1000 });

      case 'products.stocks':
        if (!p.warehouseId) throw new Error('缺少 warehouseId');
        return await api('marketplace', 'GET', `/api/v3/stocks/${p.warehouseId}`, { limit: p.limit || 1000, offset: p.offset || 0 });

      // ── Orders ────────────────────────────────────────────
      case 'orders.new':
        return await api('marketplace', 'GET', '/api/v3/orders/new');

      case 'orders.list':
        return await api('marketplace', 'GET', '/api/v3/orders', {
          limit: p.limit || 100,
          next: p.next || 0,
          dateFrom: p.dateFrom,
          dateTo: p.dateTo,
        });

      case 'orders.status':
        if (!p.orders || !Array.isArray(p.orders) || p.orders.length === 0) throw new Error('缺少 orders (非空数组)');
        return await api('marketplace', 'POST', '/api/v3/orders/status', {}, { orders: p.orders });

      case 'orders.cancel':
        if (!p.orderId) throw new Error('缺少 orderId');
        return await api('marketplace', 'PATCH', `/api/v3/orders/${p.orderId}/cancel`);

      case 'orders.stickers':
        if (!p.orders || !Array.isArray(p.orders) || p.orders.length === 0) throw new Error('缺少 orders (非空数组)');
        return await api('marketplace', 'POST', '/api/v3/orders/stickers',
          { type: p.type || 'png', width: p.width || 58, height: p.height || 40 },
          { orders: p.orders });

      case 'orders.archive':
        if (!p.year || !p.month) throw new Error('缺少 year, month');
        return await api('marketplace', 'GET', '/api/marketplace/v3/fbs/orders/archive', {
          year: p.year, month: p.month, next: p.next || 0, limit: p.limit || 100,
        });

      // ── Orders Meta ───────────────────────────────────────
      case 'orders.meta.get':
        if (!p.orders || !Array.isArray(p.orders) || p.orders.length === 0) throw new Error('缺少 orders (非空数组)');
        return await api('marketplace', 'POST', '/api/marketplace/v3/orders/meta', {}, { orders: p.orders });

      case 'orders.meta.set':
        if (!p.orderId || !p.type || p.value === undefined) throw new Error('缺少 orderId, type, value');
        const metaEndpoints = {
          sgtin:    { path: `/api/v3/orders/${p.orderId}/meta/sgtin`,               body: { sgtins: Array.isArray(p.value) ? p.value : [p.value] } },
          uin:      { path: `/api/v3/orders/${p.orderId}/meta/uin`,                 body: { uin: p.value } },
          imei:     { path: `/api/v3/orders/${p.orderId}/meta/imei`,                body: { imei: p.value } },
          gtin:     { path: `/api/v3/orders/${p.orderId}/meta/gtin`,                body: { gtin: p.value } },
          expiration: { path: `/api/v3/orders/${p.orderId}/meta/expiration`,        body: { expiration: p.value } },
          customs:  { path: `/api/marketplace/v3/orders/${p.orderId}/meta/customs-declaration`, body: { customsDeclaration: p.value } },
        };
        const meta = metaEndpoints[p.type];
        if (!meta) throw new Error(`未知元数据类型: ${p.type}, 可用: ${Object.keys(metaEndpoints).join(', ')}`);
        return await api('marketplace', 'PUT', meta.path, {}, meta.body);

      case 'orders.meta.delete':
        if (!p.orderId) throw new Error('缺少 orderId');
        return await api('marketplace', 'DELETE', `/api/v3/orders/${p.orderId}/meta`, { key: p.key });

      // ── Supplies ──────────────────────────────────────────
      case 'supplies.create':
        return await api('marketplace', 'POST', '/api/v3/supplies', {}, p.name ? { name: p.name } : {});

      case 'supplies.list':
        return await api('marketplace', 'GET', '/api/v3/supplies', { limit: p.limit || 100, next: p.next || 0 });

      case 'supplies.get':
        if (!p.supplyId) throw new Error('缺少 supplyId');
        return await api('marketplace', 'GET', `/api/v3/supplies/${p.supplyId}`);

      case 'supplies.addOrders':
        if (!p.supplyId || !p.orders || !Array.isArray(p.orders) || p.orders.length === 0) throw new Error('缺少 supplyId, orders (非空数组)');
        return await api('marketplace', 'PATCH', `/api/marketplace/v3/supplies/${p.supplyId}/orders`, {}, { orders: p.orders });

      case 'supplies.deliver':
        if (!p.supplyId) throw new Error('缺少 supplyId');
        return await api('marketplace', 'PATCH', `/api/v3/supplies/${p.supplyId}/deliver`);

      case 'supplies.delete':
        if (!p.supplyId) throw new Error('缺少 supplyId');
        return await api('marketplace', 'DELETE', `/api/v3/supplies/${p.supplyId}`);

      case 'supplies.qrcode':
        if (!p.supplyId) throw new Error('缺少 supplyId');
        return await api('marketplace', 'GET', `/api/v3/supplies/${p.supplyId}/barcode`, { type: p.type || 'svg' });

      // ── Passes ────────────────────────────────────────────
      case 'passes.offices':
        return await api('marketplace', 'GET', '/api/v3/passes/offices');

      case 'passes.list':
        return await api('marketplace', 'GET', '/api/v3/passes');

      case 'passes.create':
        return await api('marketplace', 'POST', '/api/v3/passes', {}, {
          firstName: p.firstName,
          lastName: p.lastName,
          carModel: p.carModel,
          carNumber: p.carNumber,
          officeId: p.officeId,
        });

      case 'passes.delete':
        if (!p.passId) throw new Error('缺少 passId');
        return await api('marketplace', 'DELETE', `/api/v3/passes/${p.passId}`);

      // ── Communications ────────────────────────────────────
      case 'communications.questions':
        return await api('feedbacks', 'GET', '/api/v1/questions', {
          isAnswered: p.isAnswered !== undefined ? p.isAnswered : false,
          take: p.take || 30,
          skip: p.skip || 0,
          nmId: p.nmId,
          order: p.order,
          dateFrom: p.dateFrom,
          dateTo: p.dateTo,
        });

      case 'communications.questionReply':
        if (!p.id) throw new Error('缺少 id (问题ID)');
        return await api('feedbacks', 'PATCH', '/api/v1/questions', {}, {
          id: p.id,
          answer: { text: p.text || '' },
          state: p.state || 'wbRu',
        });

      case 'communications.feedbacks':
        return await api('feedbacks', 'GET', '/api/v1/feedbacks', {
          isAnswered: p.isAnswered !== undefined ? p.isAnswered : false,
          take: p.take || 30,
          skip: p.skip || 0,
          nmId: p.nmId,
          order: p.order,
          dateFrom: p.dateFrom,
          dateTo: p.dateTo,
        });

      case 'communications.feedbackReply':
        if (!p.id) throw new Error('缺少 id (评价ID)');
        return await api('feedbacks', 'POST', '/api/v1/feedbacks/answer', {}, {
          id: p.id,
          text: p.text || '',
        });

      case 'communications.chats':
        return await api('chat', 'GET', '/api/v1/seller/chats');

      case 'communications.chatEvents':
        return await api('chat', 'GET', '/api/v1/seller/events', { next: p.next });

      case 'communications.sendMessage':
        if (!p.replySign) throw new Error('缺少 replySign');
        return await api('chat', 'POST', '/api/v1/seller/message', {}, {
          replySign: p.replySign,
          message: p.message || '',
        });

      case 'communications.returns':
        return await api('returns', 'GET', '/api/v1/claims', {
          is_archive: p.isArchive !== undefined ? p.isArchive : false,
          limit: p.limit || 50,
          offset: p.offset || 0,
          nm_id: p.nmId,
        });

      case 'communications.returnReply':
        if (!p.id || !p.action) throw new Error('缺少 id, action');
        return await api('returns', 'PATCH', '/api/v1/claim', {}, {
          id: p.id,
          action: p.action,
          comment: p.comment,
        });

      // ── Analytics ─────────────────────────────────────────
      case 'analytics.funnel':
        return await api('analytics', 'POST', '/api/analytics/v3/sales-funnel/products', {}, {
          selectedPeriod: p.selectedPeriod || { start: dateDaysAgo(30), end: dateToday() },
          pastPeriod: p.pastPeriod || { start: dateDaysAgo(60), end: dateDaysAgo(31) },
          filters: p.filters || { brandNames: [], subjectIds: [], tagIds: [], nmIds: [] },
          orderBy: p.orderBy || { field: 'orderCount', mode: 'desc' },
          limit: p.limit || 20,
          offset: p.offset || 0,
        });

      case 'analytics.funnelDaily':
        return await api('analytics', 'POST', '/api/analytics/v3/sales-funnel/products/history', {}, {
          selectedPeriod: p.selectedPeriod || { start: dateDaysAgo(7), end: dateToday() },
          nmIds: p.nmIds || [],
          skipDeletedNm: p.skipDeletedNm || false,
          aggregationLevel: p.aggregationLevel || 'day',
        });

      case 'analytics.funnelGrouped':
        return await api('analytics', 'POST', '/api/analytics/v3/sales-funnel/grouped/history', {}, {
          selectedPeriod: p.selectedPeriod || { start: dateDaysAgo(7), end: dateToday() },
          brandNames: p.brandNames || [],
          subjectIds: p.subjectIds || [],
          tagIds: p.tagIds || [],
          skipDeletedNm: p.skipDeletedNm || false,
          aggregationLevel: p.aggregationLevel || 'day',
        });

      case 'analytics.searchReport':
        return await api('analytics', 'POST', '/api/v2/search-report/report', {}, {
          currentPeriod: p.currentPeriod || { start: dateDaysAgo(30), end: dateToday() },
          pastPeriod: p.pastPeriod || { start: dateDaysAgo(60), end: dateDaysAgo(31) },
          filters: p.filters || {},
          sort: p.sort || { field: 'openCard', mode: 'desc' },
          limit: p.limit || 20,
          offset: p.offset || 0,
        });

      case 'analytics.searchTexts':
        return await api('analytics', 'POST', '/api/v2/search-report/product/search-texts', {}, {
          currentPeriod: p.currentPeriod || { start: dateDaysAgo(30), end: dateToday() },
          pastPeriod: p.pastPeriod || { start: dateDaysAgo(60), end: dateDaysAgo(31) },
          nmIds: p.nmIds || [],
          topOrderBy: p.topOrderBy || { field: 'frequency', mode: 'desc' },
          limit: p.limit || 30,
        });

      case 'analytics.stocksWB':
        return await api('analytics', 'POST', '/api/analytics/v1/stocks-report/wb-warehouses', {}, {
          nmIds: p.nmIds || [],
          chrtIds: p.chrtIds || [],
          limit: p.limit || 1000,
          offset: p.offset || 0,
        });

      case 'analytics.stocksGroups':
        return await api('analytics', 'POST', '/api/v2/stocks-report/products/groups', {}, {
          nmIds: p.nmIds || [],
          subjectIDs: p.subjectIDs || [],
          brandNames: p.brandNames || [],
          tagIDs: p.tagIDs || [],
          currentPeriod: p.currentPeriod || { start: dateToday(), end: dateToday() },
          stockType: p.stockType || '',
          skipDeletedNm: p.skipDeletedNm || false,
          orderBy: p.orderBy || { field: 'stockCount', mode: 'desc' },
          limit: p.limit || 20,
          offset: p.offset || 0,
        });

      case 'analytics.stocksProducts':
        return await api('analytics', 'POST', '/api/v2/stocks-report/products/products', {}, {
          nmIds: p.nmIds || [],
          subjectID: p.subjectID,
          brandName: p.brandName,
          tagID: p.tagID,
          currentPeriod: p.currentPeriod || { start: dateToday(), end: dateToday() },
          stockType: p.stockType || '',
          skipDeletedNm: p.skipDeletedNm || false,
          orderBy: p.orderBy || { field: 'stockCount', mode: 'desc' },
          limit: p.limit || 20,
          offset: p.offset || 0,
        });

      case 'analytics.stocksSizes':
        if (!p.nmID && !p.nmId) throw new Error('缺少 nmID');
        return await api('analytics', 'POST', '/api/v2/stocks-report/products/sizes', {}, {
          nmID: p.nmID || p.nmId,
          currentPeriod: p.currentPeriod || { start: dateToday(), end: dateToday() },
          stockType: p.stockType || '',
          orderBy: p.orderBy || { field: 'stockCount', mode: 'desc' },
          includeOffice: p.includeOffice || false,
        });

      case 'analytics.stocksOffices':
        return await api('analytics', 'POST', '/api/v2/stocks-report/offices', {}, {
          nmIds: p.nmIds || [],
          subjectIDs: p.subjectIDs || [],
          brandNames: p.brandNames || [],
          tagIDs: p.tagIDs || [],
          currentPeriod: p.currentPeriod || { start: dateToday(), end: dateToday() },
          stockType: p.stockType || '',
          skipDeletedNm: p.skipDeletedNm || false,
        });

      case 'analytics.csvCreate':
        if (!p.reportType) throw new Error('缺少 reportType');
        return await api('analytics', 'POST', '/api/v2/nm-report/downloads', {}, p);

      case 'analytics.csvList':
        const csvQuery = {};
        if (p.downloadIds) csvQuery['filter[downloadIds]'] = p.downloadIds;
        return await api('analytics', 'GET', '/api/v2/nm-report/downloads', csvQuery);

      case 'analytics.csvDownload':
        if (!p.downloadId) throw new Error('缺少 downloadId');
        return await api('analytics', 'GET', `/api/v2/nm-report/downloads/file/${p.downloadId}`);

      default:
        return { error: `未知命令: ${cmd}`, hint: '使用 --help 查看所有命令' };
    }
  } catch (err) {
    return { error: err.message, command: cmd };
  }
}

// ─── 工具函数 ──────────────────────────────────────────────
function hasSku(card, sku) {
  const s = String(sku);
  if (String(card.vendorCode) === s) return true;
  if (card.sizes) {
    for (const size of card.sizes) {
      if (size.skus && size.skus.some(k => String(k) === s)) return true;
    }
  }
  return false;
}

function compactCard(card, matchedSku) {
  const firstPhoto = card.photos?.[0]?.c246x328 || card.photos?.[0]?.big || card.photos?.[0]?.c516x688 || null;
  return {
    nmID:        card.nmID,
    imtID:       card.imtID,
    vendorCode:  card.vendorCode,
    title:       card.title,
    brand:       card.brand,
    subjectID:   card.subjectID,
    subjectName: card.subjectName,
    photo:       firstPhoto,
    sizes:       card.sizes?.map(s => ({ chrtID: s.chrtID, techSize: s.techSize, wbSize: s.wbSize, price: s.price })),
    ...(matchedSku ? { sku: matchedSku } : {}),
    createdAt:   card.createdAt,
    updatedAt:   card.updatedAt,
  };
}

function dateToday() { return new Date().toISOString().slice(0, 10); }
function dateDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

run().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
