# GuideFlow (Local Step Recorder)

A local, client-side browser extension for capturing step-by-step web workflows and generating interactive HTML documentation.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Interactive%20Preview-brightgreen?style=for-the-badge&logo=googlechrome)](https://subwatg.github.io/GuideFlow/)
[![Version](https://img.shields.io/badge/version-1.1.0-blue?style=for-the-badge)](https://github.com/SubwatG/GuideFlow/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

> 🚀 **[Try Live Interactive Demo / ทดลองเล่นคู่มือตัวอย่างจริง](https://subwatg.github.io/GuideFlow/)**

---

## Language / ภาษา
- [English](#english)
- [ภาษาไทย](#ภาษาไทย)

---

<a name="english"></a>
## English Documentation

### 1. Overview
GuideFlow is an open-source, client-side Chromium extension that automates the creation of step-by-step user guides. It records user interactions (clicks, inputs), captures viewport screenshots, highlights target elements, and exports the final workflow as a standalone, portable HTML document. All data processing and storage remain local to your browser.

### 2. Key Features
- **Automated Interaction Capture:** Detects click coordinates and target element boundaries via DOM events.
- **Viewport Snapshot:** Captures visible tabs via Chrome Extension APIs without external screen capture software.
- **Interactive Viewer & Studio:**
  - Pan and Zoom navigation with dedicated focus on highlighted elements.
  - Step reordering, text editing, and custom tips/warnings annotation.
  - Export to a single standalone HTML file (zero external runtime dependencies).
  - Print-ready CSS for direct PDF export.
- **Privacy & Offline First:** Zero cloud transmission, zero tracking, and no external API dependencies.

### 3. System Requirements
- Any Chromium-based browser supporting Manifest V3:
  - Google Chrome (version 88+)
  - Microsoft Edge (version 88+)
  - Brave Browser
  - Opera / Vivaldi / Arc

---

### 4. Installation Guide

#### Windows (10 / 11)
1. **Download the Source Code:**
   - Clone the repository using Git or download and extract the ZIP archive to a permanent directory (e.g., `C:\Tools\GuideFlow` or `Documents\GuideFlow`).
   - *Note: Do not delete or move this folder after installation, as the browser loads the extension directly from this path.*
2. **Open Extensions Management:**
   - In Google Chrome or Microsoft Edge, navigate to `chrome://extensions` (or `edge://extensions`).
3. **Enable Developer Mode:**
   - Toggle the **Developer mode** switch in the top-right corner.
4. **Load Unpacked Extension:**
   - Click the **Load unpacked** button in the top-left toolbar.
   - Select the `extension` folder inside the cloned/extracted repository (the folder containing `manifest.json`).
5. **Pin Extension:**
   - Click the puzzle icon (Extensions menu) in the browser toolbar and pin **GuideFlow** for quick access.

#### macOS
1. **Extract and Place Files:**
   - Extract the downloaded ZIP or clone the repository to an appropriate directory (e.g., `~/Documents/GuideFlow`).
2. **Open Extensions Page:**
   - Open Chrome / Brave / Edge and go to `chrome://extensions`.
3. **Enable Developer Mode:**
   - Turn on **Developer mode** via the toggle switch in the top-right corner.
4. **Load Extension:**
   - Click **Load unpacked** and select the `extension` directory.
5. **Verification:**
   - Confirm that the extension card appears with the status enabled.

#### Linux (Ubuntu, Debian, Fedora, Arch Linux)
1. **Clone Repository:**
   ```bash
   git clone https://github.com/SubwatG/guide-flow.git
   cd guide-flow
   ```
2. **Open Chromium / Chrome:**
   - Navigate to `chrome://extensions`.
3. **Enable Developer Mode:**
   - Turn on the **Developer mode** toggle.
4. **Load the Unpacked Directory:**
   - Click **Load unpacked** and choose the absolute path to `guide-flow/extension`.

---

### 5. Usage Instructions
1. Navigate to the target web application you wish to document.
2. Click the **GuideFlow** extension icon in your browser toolbar.
3. Choose **Capture Mode**:
   - *Viewport (Default):* Captures only visible area.
   - *Full Page:* Automatically scrolls and stitches the entire web page.
4. Click **Start Recording**.
5. Perform the steps sequentially on the web page.
6. Return to the extension popup and click **Stop & Review**.
7. In the Interactive Studio tab:
   - **Edit:** Click step titles, descriptions, or add helpful **Tips (💡)**.
   - **Zoom & Focus:** Use mouse wheel, pan, press **F** for one-time focus, or press **A** to toggle **Auto Focus (🎯)** mode across all steps.
   - **Zen Mode (Z):** Hide navigation bars for distraction-free presentation.
   - **Dark Mode (T):** Toggle between Light and Dark themes anytime.
   - **Export HTML:** Save as a single, self-contained interactive web page.
   - **Export Images:** Save all screenshot steps directly into a local folder (with optional click-highlight overlay and `README.md` summary).
   - **Export / Import JSON:** Backup your full guide dataset to `.json` or load an existing `.json` file back into the editor anytime.
   - **Print / PDF:** Generate an A4 print-ready document or save directly as PDF.

---

### 6. Repository Structure
```text
guide-flow/
├── extension/             # Chromium Manifest V3 extension source
│   ├── manifest.json      # Extension metadata and permissions
│   ├── background.js      # Background service worker & tab capture
│   ├── content.js         # DOM click listener and bounding box extraction
│   ├── popup.html / .js   # Extension control interface
│   ├── viewer.html / .js  # Interactive editor and guide viewer
│   └── icons/             # Extension icon assets
├── viewer/                # Standalone guide demo template
│   └── demo-guide-standalone.html
├── LICENSE                # MIT License
└── README.md              # Project documentation
```

---

<a name="ภาษาไทย"></a>
## คู่มือภาษาไทย (Thai Documentation)

### 1. ภาพรวมโปรเจกต์
GuideFlow คือส่วนขยายสำหรับเว็บเบราว์เซอร์ตระกูล Chromium ที่ทำงานบนเครื่องของผู้ใช้ทั้งหมด (100% Client-side) ออกแบบมาเพื่อสร้างเอกสารและคู่มือการใช้งานระบบทีละขั้นตอนแบบอัตโนมัติ โดยระบบจะจับภาพหน้าจอ พิกัดการคลิก และองค์ประกอบของหน้าเว็บ พร้อมส่งออกเป็นไฟล์ HTML แบบ Single File ที่เปิดใช้งานได้ทันทีโดยไม่ต้องพึ่งพาเซิร์ฟเวอร์ภายนอก

### 2. คุณสมบัติหลัก
- **บันทึกการทำงานอัตโนมัติ:** ตรวจจับตำแหน่งการคลิกและขอบเขตของ Element บนหน้าเว็บแบบเรียลไทม์
- **จับภาพหน้าจอความละเอียดสูง:** บันทึกภาพเฉพาะแท็บที่กำลังทำงานผ่าน Chrome Extension API
- **สตูดิโอตรวจสอบและแก้ไข (Interactive Studio):**
  - รองรับการซูมและเลื่อนภาพ (Pan & Zoom) พร้อมปุ่ม Focus ไปยังตำแหน่งที่คลิก
  - แก้ไขหัวข้อ คำอธิบาย ลำดับขั้นตอน และเพิ่มกล่องข้อความแนะนำ (Tip / Warning)
  - ส่งออกเอกสารเป็นไฟล์ HTML แบบ Standalone ภายในไฟล์เดียว
  - รองรับการพิมพ์เอกสารหรือบันทึกเป็น PDF ขนาด A4
- **ความปลอดภัยและความเป็นส่วนตัว:** ข้อมูลทั้งหมดถูกประมวลผลและจัดเก็บบนเครื่องของผู้ใช้งานเท่านั้น ไม่มีการส่งข้อมูลออกสู่ภายนอก

### 3. เบราว์เซอร์ที่รองรับ
- Google Chrome (เวอร์ชัน 88 ขึ้นไป)
- Microsoft Edge (เวอร์ชัน 88 ขึ้นไป)
- Brave Browser
- Opera / Vivaldi / Arc

---

### 4. ขั้นตอนการติดตั้งอย่างละเอียด

#### สำหรับ Windows (10 / 11)
1. **ดาวน์โหลดโค้ด:**
   - ดาวน์โหลดไฟล์ ZIP จากปุ่ม Code หรือ Clone repository
   - แตกไฟล์ ZIP และย้ายโฟลเดอร์ไปไว้ในตำแหน่งที่ปลอดภัย เช่น `C:\Tools\GuideFlow` หรือ `Documents\GuideFlow`
   - *ข้อสำคัญ: ห้ามลบหรือย้ายโฟลเดอร์นี้หลังการติดตั้ง เนื่องจากเบราว์เซอร์จะอ่านไฟล์โดยตรงจากตำแหน่งดังกล่าว*
2. **เข้าสู่หน้าจัดการส่วนขยาย:**
   - เปิด Chrome หรือ Edge แล้วพิมพ์ `chrome://extensions` ในช่อง URL
3. **เปิดโหมดนักพัฒนา:**
   - เลื่อนเปิดสวิตช์ **Developer mode (โหมดนักพัฒนา)** ที่มุมขวาบนของหน้าต่าง
4. **โหลดส่วนขยาย:**
   - คลิกปุ่ม **Load unpacked (โหลดส่วนขยายที่คลายการบีบอัดแล้ว)**
   - เลือกโฟลเดอร์ `extension` ที่อยู่ภายในโฟลเดอร์โปรเจกต์ (โฟลเดอร์ที่มีไฟล์ `manifest.json`)
5. **ปักหมุดส่วนขยาย:**
   - คลิกไอคอนรูปตัวต่อ (Extensions) ที่แถบเครื่องมือด้านบน แล้วคลิกไอคอนหมุดที่ชื่อ **GuideFlow**

#### สำหรับ macOS
1. **เตรียมโฟลเดอร์โปรเจกต์:**
   - แตกไฟล์ ZIP หรือ Clone repository ไปไว้ในโฟลเดอร์ เช่น `~/Documents/GuideFlow`
2. **เปิดหน้าส่วนขยายในเบราว์เซอร์:**
   - เปิด Chrome หรือ Edge แล้วเข้าที่ `chrome://extensions`
3. **เปิดโหมดนักพัฒนา:**
   - เปิดสวิตช์ **Developer mode** ที่มุมขวาบน
4. **โหลดส่วนขยาย:**
   - คลิก **Load unpacked** แล้วเลือกโฟลเดอร์ `extension`
5. **ตรวจสอบการทำงาน:**
   - ไอคอนส่วนขยายจะปรากฏบนแถบเครื่องมือของเบราว์เซอร์พร้อมใช้งาน

#### สำหรับ Linux (Ubuntu, Debian, Fedora, Arch Linux)
1. **Clone Repository:**
   ```bash
   git clone https://github.com/SubwatG/guide-flow.git
   cd guide-flow
   ```
2. **เปิดหน้าส่วนขยาย:**
   - เปิด Chromium หรือ Chrome เข้าไปที่ `chrome://extensions`
3. **เปิด Developer Mode:**
   - สลับเปิดตัวเลือก **Developer mode**
4. **โหลดโฟลเดอร์ส่วนขยาย:**
   - คลิก **Load unpacked** และระบุตำแหน่งโฟลเดอร์ `guide-flow/extension`

---

### 5. วิธีการใช้งาน
1. เปิดหน้าเว็บไซต์หรือระบบที่ต้องการจัดทำคู่มือ
2. คลิกไอคอนส่วนขยาย **GuideFlow** บนแถบเครื่องมือเบราว์เซอร์
3. เลือก **รูปแบบการจับภาพ (Capture Mode)**:
   - *เฉพาะส่วนที่มองเห็น (Viewport):* จับภาพเฉพาะหน้าต่างที่มองเห็นในขณะนั้น (ค่าเริ่มต้น)
   - *ทั้งหน้าเว็บ (Full Page):* เลื่อนเก็บภาพทั้งหน้าเว็บตั้งแต่บนสุดถึงล่างสุดอัตโนมัติ
4. คลิกปุ่ม **เริ่มบันทึก (Start Recording)**
5. ดำเนินการคลิกและใช้งานระบบตามขั้นตอนจริง
6. เมื่อเสร็จสิ้น ให้คลิกไอคอนส่วนขยายอีกครั้งและเลือก **หยุดและตรวจสอบ (Stop & Review)**
7. ในหน้าจอ Interactive Studio คุณสามารถ:
   - **แก้ไขเนื้อหา:** คลิกที่ข้อความชื่อขั้นตอนหรือคำอธิบายเพื่อพิมพ์แก้ได้ทันที พร้อมปุ่มเพิ่ม **ข้อเสนอแนะ (💡 Tip)**
   - **ซูมและเลื่อนภาพ:** หมุน Mouse Wheel เพื่อซูม, กด **F (Focus)** เพื่อขยายโฟกัสครั้งเดียว, หรือกดปุ่ม **A (Auto Focus 🎯)** เพื่อเปิดโหมดล็อกการซูมโฟกัสอัตโนมัติในทุกสเต็ปที่เปลี่ยนไป
   - **Zen Mode:** กดปุ่ม **Z** เพื่อซ่อนแถบเครื่องมือและนำเสนอคู่มือแบบเต็มจอ
   - **โหมดมืด (Dark Mode):** กดปุ่ม **T** หรือคลิกไอคอนดวงจันทร์ 🌙 เพื่อสลับธีมมืด/สว่าง สบายตา
   - **ส่งออกเป็น HTML (Export HTML):** เซฟเป็นไฟล์ `.html` หน้าเดี่ยว เปิดใช้งานได้ทุกอุปกรณ์โดยไม่ต้องมีอินเทอร์เน็ต
   - **ส่งออกรูปภาพลงโฟลเดอร์ (Export Images):** บันทึกไฟล์รูป `.png` ของทุกขั้นตอนลงโฟลเดอร์ในเครื่อง พร้อมตัวเลือกว่าจะฝังวงแหวนเน้นจุดคลิก (Highlight) หรือไม่ และสร้างไฟล์สรุป `README.md`
   - **สำรองและนำเข้าข้อมูล (Export / Import JSON):** 
     - กดปุ่ม **Export JSON** เพื่อดาวน์โหลดไฟล์ชุดข้อมูลคู่มือทั้งหมดเก็บไว้
     - กดปุ่ม **นำเข้า JSON** เพื่อโหลดไฟล์ `.json` เดิมกลับขึ้นมาเปิดดูหรือแก้ไขเพิ่มเติมได้ตลอดเวลา
   - **พิมพ์ / บันทึกเป็น PDF (Print):** กดปุ่ม **พิมพ์/PDF** เพื่อจัดหน้าสำหรับพิมพ์เอกสาร A4 หรือ Export เป็นไฟล์ PDF สวยงาม

---

## License
This project is licensed under the [MIT License](LICENSE).
