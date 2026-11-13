# ร้านกล้วยอบเนย — วิธีนำขึ้น GitHub Pages

โครงสร้างไฟล์

```
github-pages/
├── index.html            ← หน้าเว็บ (อัปโหลดขึ้น GitHub)
├── .nojekyll             ← ไฟล์เปล่า บอก GitHub ไม่ต้องประมวลผลแบบ Jekyll (อัปโหลดขึ้น GitHub)
├── README.md             ← ไฟล์นี้ (จะอัปโหลดหรือไม่ก็ได้)
└── apps-script/
    └── Code.gs           ← ฝั่งเซิร์ฟเวอร์ (วางใน Google Apps Script ไม่ต้องขึ้น GitHub)
```

หลักการ: หน้าเว็บ (`index.html`) อยู่บน GitHub Pages ส่วนข้อมูลทั้งหมด (ออเดอร์ รหัสผ่าน รูปภาพ) ยังอยู่ที่ Google Sheet / Drive ผ่าน Apps Script เหมือนเดิม

---

## ขั้นที่ 1: ตั้งค่า Google Apps Script

1. เปิดโปรเจกต์ Apps Script เดิม แล้ววางโค้ดจาก `apps-script/Code.gs` ทับไฟล์ `Code.gs`
2. ไฟล์ `Index` (HTML) ในโปรเจกต์ Apps Script **ไม่จำเป็นต้องมีอีกต่อไป** จะลบหรือเก็บไว้ก็ได้
3. เลือกฟังก์ชัน `setup` แล้วกด "เรียกใช้" 1 ครั้ง (ทำครั้งเดียว) และอนุญาตสิทธิ์
4. Deploy
   - ถ้ามี deployment เดิมอยู่แล้ว: Deploy > Manage deployments > ไอคอนดินสอ > Version: **New version** > Deploy (ลิงก์ `/exec` เดิมยังใช้ได้)
   - ถ้าสร้างใหม่: Deploy > New deployment > ประเภท **Web app**
     - Execute as: **Me**
     - Who has access: **Anyone**
     - แล้วคัดลอก URL ที่ลงท้ายด้วย `/exec`
5. ทดสอบ: เปิด URL `/exec` ในเบราว์เซอร์ ถ้าไม่มีไฟล์ `Index` จะเห็นข้อความ `API is running`

## ขั้นที่ 2: ใส่ URL ของ Apps Script ใน index.html

เปิด `index.html` ค้นหา `WEB_APP_URL` (อยู่ในส่วน `<script>` ล่างสุด) แล้วตรวจว่าเป็น URL `/exec` ของคุณ

```js
const WEB_APP_URL = 'https://script.google.com/macros/s/xxxxxxxx/exec';
```

ถ้าใช้ deployment เดิม URL ในไฟล์นี้ถูกต้องอยู่แล้ว ไม่ต้องแก้

## ขั้นที่ 3: อัปโหลดขึ้น GitHub

1. สร้าง repository ใหม่บน GitHub (ตั้งเป็น Public) เช่นชื่อ `banana-shop`
2. กด **Add file > Upload files** แล้วลากไฟล์ `index.html` และ `.nojekyll` ขึ้นไป (ชื่อ `index.html` ต้องเป็นตัวพิมพ์เล็กทั้งหมด) แล้วกด **Commit changes**
3. ไปที่ **Settings > Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** / **(root)** แล้วกด Save
4. รอประมาณ 1–2 นาที เว็บจะอยู่ที่ `https://<ชื่อผู้ใช้>.github.io/<ชื่อ repo>/`

## ขั้นที่ 4: ทดสอบ

- หน้าแรกขึ้นสินค้าและโลโก้
- ลองสั่งซื้อ 1 ครั้ง แล้วดูว่ามีแถวใหม่ใน Google Sheet
- เข้า Admin ด้วยรหัสผ่าน ดูรายการสั่งซื้อ ลองลบรายการทดสอบ
- ปุ่ม "แชร์พิกัด" จะใช้ได้บน GitHub Pages (ต่างจากลิงก์ script.google.com)

---

## หมายเหตุ

- **ชื่อร้านและชื่อแท็บ:** ชื่อร้านบน navbar อยู่ในแท็ก `<span>` ใกล้ `id="navLogo"` ส่วนชื่อแท็บเบราว์เซอร์อยู่ในแท็ก `<title>` ใน `index.html` (เมื่อโฮสต์บน GitHub Pages แก้ที่ `<title>` ได้เลย ไม่ต้องแก้ `setTitle` ใน Apps Script)
- **เปลี่ยนราคาสินค้า:** ต้องแก้ทั้ง `products` ใน `index.html` และ `PRODUCTS` ใน `Code.gs` แล้ว Deploy Apps Script เป็น New version อีกครั้ง
- **ความปลอดภัย:** URL ของ Apps Script ที่อยู่ในหน้าเว็บเป็นข้อมูลสาธารณะตามธรรมชาติ ความปลอดภัยของส่วน Admin อาศัยรหัสผ่านแบบ hash และ token ฝั่งเซิร์ฟเวอร์ใน `Code.gs` ห้ามใส่รหัสผ่านหรือ SHEET_ID ที่ต้องการปกปิดไว้ใน `index.html`
- **ถ้าขึ้น "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้":** ตรวจว่า Deploy เป็น Who has access = **Anyone** และเป็น Version ล่าสุด และ URL ใน `WEB_APP_URL` ถูกต้อง
- **ถ้าแก้ไฟล์บน GitHub แล้วไม่เปลี่ยน:** กด Ctrl+F5 เพื่อล้างแคช
