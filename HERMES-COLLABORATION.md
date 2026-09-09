# GuideFlow — Hermes Collaboration

โปรเจกต์นี้เป็นงานพัฒนาต่อยอดร่วมกับ Hermes Agent

- Project: GuideFlow
- Location: `D:\Work\MyProject\Dev\GuideFlow`
- Scope: Chromium extension สำหรับบันทึก workflow และ full-page capture
- ผู้พัฒนา/ผู้ดูแลโค้ด: ผู้ใช้ร่วมกับ Hermes Agent
- สถานะ: Local development; ยังไม่ได้ commit หรือ push

## Verification

Regression tests:

```text
PASS Auto Focus feature and keyboard shortcut 'A' verified independently
PASS captures a short page once
PASS captures every viewport and includes the bottom edge
PASS handles invalid metrics safely
PASS stale content scripts guard invalidated extension context
PASS Dark Mode feature, toggle button, keyboard shortcut, and persistence verified successfully
PASS export images to directory with highlight toggle verified
PASS Toggle Focus Spotlight Visibility and keyboard shortcut 'H' verified independently
PASS JSON Import/Export feature and documentation verified successfully
PASS pointer arrow/icon is removed; spotlight remains available
PASS recording bootstrap injects content script when needed
PASS responsive and adaptive layout rules verified for all viewports (HD, FHD, 2K/4K)
PASS Screen Capture Tab and manual snapshot workflow verified independently
PASS Mode cards (Visible Part, Full Page, Selected Area) verified independently
PASS Full-page auto-recovery, high-res stitching, and standalone Editor verified independently
PASS Focus Spotlight Color Picker feature verified independently
```

- `editor.js` และ `background.js` เพิ่มกลไก Messaging `GET_PENDING_EDIT_IMAGE` และ delay popup close เพื่อให้เปิดหน้าต่างแก้ไขและโหลดรูปภาพได้ 100% เสมอโดยไม่มีปัญหาหน้าต่างไม่ขึ้นหรือภาพขาวว่างเปล่า
- อัปเกรดหน้าแสดงตัวอย่างของแท็บ "แคปภาพหน้าจอ" โดยแยกสร้างหน้าใหม่เป็น `capture-preview.html` และ `capture-preview.js` โดยเฉพาะ ไม่ทับซ้อนกับ viewer.html เดิม ใช้โครงสร้าง UI และดีไซน์คลีนสไตล์เดียวกัน มีพื้นที่ดูรูปชัดเจน พร้อมปุ่ม **คัดลอก (Copy)**, **ดาวน์โหลด (Download)**, และ **เพิ่มเข้าคู่มือ** บน Header พร้อมฟังก์ชัน Pan & Zoom ชัดเจน โหลดรูปภาพขึ้นทันที 100% เสมอ
- ปรับปรุงให้ทุกตัวเลือกใน Dropdown เมื่อแคปเสร็จ (ไม่ว่าจะเลือก ดาวน์โหลดทันที, คัดลอกลงคลิปบอร์ด, เพิ่มเป็น Step หรือ เปิดดูตัวอย่าง) ระบบจะ **เปิดหน้าต่างแสดงตัวอย่าง (View / Preview) ขึ้นมาให้ดูรูปเสร็จสรรพทุกรายการเสมอ** พร้อมทำงานตามคำสั่งที่เลือกควบคู่กันไป และรองรับการ Edit ตกแต่งภาพก่อนดาวน์โหลดหรือคัดลอกได้ทันที
