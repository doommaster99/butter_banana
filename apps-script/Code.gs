// =====================================================================
// ร้านกล้วยอบเนย - Google Apps Script (Code.gs)  *เวอร์ชันแก้ไขความปลอดภัย*
//
// ขั้นตอนหลังวางโค้ด:
//   1) เลือกฟังก์ชัน setup แล้วกด "เรียกใช้" 1 ครั้ง (อนุญาตสิทธิ์ตามที่ขอ)
//   2) Deploy > Manage deployments > แก้ไข > Version: New version > Deploy
//   3) เข้าหน้า Admin แล้วเปลี่ยนรหัสผ่านทันที
// =====================================================================

const SHEET_ID = '1G86sP-E_Kq22rwrPI6F7TbtHSQBMOgsdfC8HJsg0xUo';
const FOLDER_ID = '1N2I7aWib3kJxK-3CrIEMqYk0L_ldAAxX';

const TZ = 'Asia/Bangkok';
const DEFAULT_PASSWORD = '123456';   // ใช้ครั้งแรกเท่านั้น แล้วระบบจะบังคับให้เปลี่ยน
const TOKEN_TTL = 21600;             // อายุ token 6 ชั่วโมง (สูงสุดของ CacheService)
const MAX_FAILS = 5;                 // ใส่รหัสผิดได้กี่ครั้ง
const LOCK_SECONDS = 600;            // ล็อกการ login กี่วินาที (10 นาที)
const MAX_QTY = 500;                 // จำนวนสูงสุดต่อสินค้า 1 รายการ
const MAX_IMAGE_CHARS = 7000000;     // ขนาดข้อความ base64 สูงสุดของรูป

// ราคาสินค้า "ฝั่งเซิร์ฟเวอร์" (ถ้าแก้ราคา ต้องแก้ทั้งที่นี่และใน Index.html)
const PRODUCTS = {
  p1: { name: 'กล้วยอบเนย (กล่อง)',        price: 50 },
  p2: { name: 'กล้วยออริจินัล (กล่อง)',     price: 50 },
  p3: { name: 'กล้วยอบเนย (ถัง)',          price: 50 },
  p4: { name: 'กล้วยออริจินัล (ถัง)',       price: 50 },
  p5: { name: 'กล้วยอบเนย (ห่อเล็ก)',      price: 20, promoQty: 12, promoPrice: 200 },
  p6: { name: 'กล้วยออริจินัล (ห่อเล็ก)',   price: 20, promoQty: 12, promoPrice: 200 }
};
const IMAGE_TYPES = ['logo', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

// ---------------------------------------------------------------------
// เตรียมฐานข้อมูล (รันด้วยมือ 1 ครั้ง)
// ---------------------------------------------------------------------
function setup() {
  const ss = getSS_();
  ensureSheets_(ss);
  ensureAuth_(ss);
}

function getSS_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function ensureSheets_(ss) {
  let settings = ss.getSheetByName('Settings');
  if (!settings) {
    settings = ss.insertSheet('Settings');
    settings.appendRow(['Key', 'Value']);
  }
  settings.getRange('A:B').setNumberFormat('@');

  let orders = ss.getSheetByName('Orders');
  if (!orders) {
    orders = ss.insertSheet('Orders');
    orders.appendRow(['ID', 'Timestamp', 'Name', 'Phone', 'Items', 'Total', 'Address']);
  }
  // ตั้งเป็น Plain text กันเลข 0 นำหน้าหาย และกันข้อความถูกตีความเป็นสูตร
  orders.getRange('A:E').setNumberFormat('@');
  orders.getRange('G:G').setNumberFormat('@');
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------
function getSettings_(ss) {
  const sheet = ss.getSheetByName('Settings');
  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== '' && data[i][0] !== null) {
      settings[String(data[i][0])] = String(data[i][1] === null ? '' : data[i][1]);
    }
  }
  return settings;
}

// เรียกภายใน withLock_ เท่านั้น
function updateSetting_(ss, key, value) {
  const sheet = ss.getSheetByName('Settings');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) {
      sheet.getRange(i + 1, 2).setValue(String(value));
      return;
    }
  }
  sheet.appendRow([key, String(value)]);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// รหัสผ่าน / token
// ---------------------------------------------------------------------
function hashPwd_(salt, pwd) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + ':' + pwd, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ย้ายรหัสเดิม (plain text) ไปเป็น hash อัตโนมัติ ถ้ายังไม่เคยทำ
function ensureAuth_(ss) {
  let settings = getSettings_(ss);
  if (settings.PWD_HASH && settings.PWD_SALT) return settings;

  withLock_(function () {
    const cur = getSettings_(ss);
    if (cur.PWD_HASH && cur.PWD_SALT) return;
    const legacy = cur.ADMIN_PASSWORD && cur.ADMIN_PASSWORD !== '(moved to hash)'
      ? cur.ADMIN_PASSWORD : DEFAULT_PASSWORD;
    const salt = Utilities.getUuid();
    updateSetting_(ss, 'PWD_SALT', salt);
    updateSetting_(ss, 'PWD_HASH', hashPwd_(salt, legacy));
    updateSetting_(ss, 'PWD_MUST_CHANGE', legacy === DEFAULT_PASSWORD ? '1' : '0');
    if (cur.ADMIN_PASSWORD !== undefined) updateSetting_(ss, 'ADMIN_PASSWORD', '(moved to hash)');
  });
  return getSettings_(ss);
}

function login_(settings, params) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('login_fails') || 0);
  if (fails >= MAX_FAILS) {
    throw new Error('ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วลองใหม่');
  }
  const pwd = String(params.password || '');
  if (!safeEqual_(hashPwd_(settings.PWD_SALT, pwd), settings.PWD_HASH)) {
    cache.put('login_fails', String(fails + 1), LOCK_SECONDS);
    throw new Error('รหัสผ่านไม่ถูกต้อง');
  }
  cache.remove('login_fails');
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('tok_' + token, '1', TOKEN_TTL);
  return { token: token, mustChange: settings.PWD_MUST_CHANGE === '1' };
}

function requireAdmin_(params) {
  const token = String(params.token || '');
  if (!token || !CacheService.getScriptCache().get('tok_' + token)) {
    throw new Error('Unauthorized');
  }
}

function validateNewPassword_(pwd) {
  const letters = (pwd.match(/[a-zA-Z]/g) || []).length;
  if (!/^[a-zA-Z0-9]{6,64}$/.test(pwd) || letters < 3) {
    throw new Error('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัว ใช้ได้เฉพาะ A-Z, a-z, 0-9 และมีตัวอักษรอย่างน้อย 3 ตัว');
  }
}

// ---------------------------------------------------------------------
// คำนวณราคา (ฝั่งเซิร์ฟเวอร์เป็นตัวตัดสิน)
// ---------------------------------------------------------------------
function calcTotal_(p, qty) {
  if (p.promoQty && qty >= p.promoQty) {
    return Math.floor(qty / p.promoQty) * p.promoPrice + (qty % p.promoQty) * p.price;
  }
  return qty * p.price;
}

function buildOrder_(params) {
  const cart = params.cart;
  if (!cart || typeof cart !== 'object') throw new Error('ไม่พบรายการสินค้า');

  const lines = [];
  let total = 0;
  Object.keys(PRODUCTS).forEach(function (id) {
    const qty = Number(cart[id] || 0);
    if (!qty) return;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new Error('จำนวนสินค้าไม่ถูกต้อง (1-' + MAX_QTY + ')');
    }
    total += calcTotal_(PRODUCTS[id], qty);
    lines.push(PRODUCTS[id].name + ' x' + qty);
  });
  if (!lines.length) throw new Error('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ');

  const name = String(params.name || '').trim();
  const phone = String(params.phone || '').replace(/\D/g, '');
  const address = String(params.address || '').trim();
  if (name.length < 1 || name.length > 100) throw new Error('ชื่อต้องยาว 1-100 ตัวอักษร');
  if (!/^\d{9,10}$/.test(phone)) throw new Error('เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก');
  if (address.length > 500) throw new Error('ที่อยู่ยาวเกินไป (สูงสุด 500 ตัวอักษร)');

  return { name: name, phone: phone, address: address, items: lines.join(', '), total: total };
}

// ---------------------------------------------------------------------
// หน้าเว็บ
// ---------------------------------------------------------------------
function doGet(e) {
  // ถ้ามีไฟล์ Index ในโปรเจกต์ จะแสดงหน้าเว็บ (ใช้งานผ่านลิงก์ script.google.com)
  // ถ้าใช้ GitHub Pages ไม่ต้องมีไฟล์ Index ที่นี่ จะตอบข้อความว่า API พร้อมใช้งานแทน
  try {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('ร้านกล้วยอบเนย')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    return ContentService.createTextOutput('API is running')
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

// ---------------------------------------------------------------------
// API หลัก (เรียกจาก google.script.run และ doPost)
// ---------------------------------------------------------------------
function processApiAction(action, params) {
  try {
    params = params || {};
    const ss = getSS_();
    if (!ss.getSheetByName('Settings') || !ss.getSheetByName('Orders')) ensureSheets_(ss);
    const settings = ensureAuth_(ss);
    let result = {};

    if (action === 'init') {
      // ส่งเฉพาะค่าที่หน้าเว็บต้องใช้ ห้ามส่งรหัสผ่าน/hash
      Object.keys(settings).forEach(function (k) {
        if (k === 'LOGO_URL' || k.indexOf('IMG_') === 0) result[k] = settings[k];
      });
      result.ORDERS_OPEN = settings.ORDERS_OPEN === '0' ? '0' : '1';   // ค่าเริ่มต้น = เปิดรับออเดอร์
    }
    else if (action === 'login') {
      result = login_(settings, params);
    }
    else if (action === 'logout') {
      CacheService.getScriptCache().remove('tok_' + String(params.token || ''));
    }
    else if (action === 'changePassword') {
      requireAdmin_(params);
      const oldPwd = String(params.oldPassword || '');
      if (!safeEqual_(hashPwd_(settings.PWD_SALT, oldPwd), settings.PWD_HASH)) {
        throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
      }
      const newPwd = String(params.newPassword || '');
      validateNewPassword_(newPwd);
      withLock_(function () {
        const salt = Utilities.getUuid();
        updateSetting_(ss, 'PWD_SALT', salt);
        updateSetting_(ss, 'PWD_HASH', hashPwd_(salt, newPwd));
        updateSetting_(ss, 'PWD_MUST_CHANGE', '0');
      });
    }
    else if (action === 'setOrdersOpen') {
      requireAdmin_(params);
      const open = (params.open === true || params.open === 'true');
      withLock_(function () { updateSetting_(ss, 'ORDERS_OPEN', open ? '1' : '0'); });
      result = { open: open };
    }
    else if (action === 'saveOrder') {
      // ปิดรับออเดอร์อยู่ -> ปฏิเสธที่เซิร์ฟเวอร์ด้วย (กันการยิงข้ามหน้าเว็บ)
      if (settings.ORDERS_OPEN === '0') throw new Error('ORDERS_CLOSED');
      const o = buildOrder_(params);
      withLock_(function () {
        const sheet = ss.getSheetByName('Orders');
        const id = String(Date.now());
        const ts = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
        sheet.appendRow([id, ts, o.name, o.phone, o.items, o.total, o.address]);
      });
      result = { total: o.total, items: o.items };
    }
    else if (action === 'getOrders') {
      requireAdmin_(params);
      const data = ss.getSheetByName('Orders').getDataRange().getValues();
      const orders = [];
      for (let i = data.length - 1; i >= 1; i--) {   // ใหม่สุดก่อน
        const r = data[i];
        let ts = r[1];
        if (ts instanceof Date) ts = Utilities.formatDate(ts, TZ, 'yyyy-MM-dd HH:mm:ss');
        let phone = String(r[3]);
        if (/^\d{9}$/.test(phone)) phone = '0' + phone;   // กู้เลข 0 ที่หายจากข้อมูลเก่า (เฉพาะ 9 หลัก)
        orders.push({
          id: String(r[0]),
          timestamp: String(ts),
          name: String(r[2]),
          phone: phone,
          items: String(r[4]),
          total: Number(r[5]) || 0,
          address: String(r[6] === null ? '' : r[6])
        });
      }
      result = orders;
    }
    else if (action === 'deleteOrder') {
      requireAdmin_(params);
      const id = String(params.id || '');
      if (!id) throw new Error('ไม่พบรหัสรายการ');
      withLock_(function () {
        const sheet = ss.getSheetByName('Orders');
        const data = sheet.getDataRange().getValues();
        for (let i = data.length - 1; i >= 1; i--) {
          if (String(data[i][0]) === id) {
            sheet.deleteRow(i + 1);
            return;
          }
        }
        throw new Error('ไม่พบรายการที่ต้องการลบ (อาจถูกลบไปแล้ว)');
      });
    }
    else if (action === 'uploadImage') {
      requireAdmin_(params);
      const type = String(params.type || '');
      if (IMAGE_TYPES.indexOf(type) < 0) throw new Error('ประเภทรูปไม่ถูกต้อง');

      const b64 = String(params.base64 || '');
      if (b64.length > MAX_IMAGE_CHARS) throw new Error('ไฟล์รูปใหญ่เกินไป');
      const comma = b64.indexOf(',');
      const head = comma > 0 ? b64.substring(0, comma) : '';
      const m = head.match(/^data:image\/(jpeg|png|webp);base64$/);
      if (!m) throw new Error('รองรับเฉพาะไฟล์ JPG, PNG, WEBP');

      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const bytes = Utilities.base64Decode(b64.substring(comma + 1));
      const blob = Utilities.newBlob(bytes, 'image/' + m[1], type + '_' + Date.now() + '.' + ext);

      const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const imageUrl = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';

      const key = type === 'logo' ? 'LOGO_URL' : 'IMG_' + type;
      const fileKey = 'FILE_' + key;
      const oldFileId = settings[fileKey];
      withLock_(function () {
        updateSetting_(ss, key, imageUrl);
        updateSetting_(ss, fileKey, file.getId());
      });
      if (oldFileId) {
        try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (e) { /* ไม่มีไฟล์เก่าแล้ว */ }
      }
      result = { url: imageUrl };
    }
    else {
      throw new Error('ไม่รู้จักคำสั่ง');
    }

    return JSON.stringify({ success: true, data: result });

  } catch (err) {
    return JSON.stringify({ success: false, message: err.message });
  }
}

// รับคำสั่งจากภายนอก (กรณีโฮสต์หน้าเว็บที่อื่น)
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No POST data received');
    }
    const params = JSON.parse(e.postData.contents);
    const responseStr = processApiAction(params.action, params);
    return ContentService.createTextOutput(responseStr).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
