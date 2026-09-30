# Hướng dẫn deploy (dành cho Antigravity)

> Copy nguyên phần **PROMPT** dưới đây dán vào Antigravity, sau khi đã mở thư mục chứa bộ source này.

---

## PROMPT

Đây là site tĩnh (HTML/CSS/JS thuần, không có bước build, không cần npm install). Hãy deploy theo các bước:

1. **Đẩy code lên GitHub**
   - Repo đích: `https://github.com/trantanphata5-source/quan-ly-cong-viec` (nhánh `main`).
   - Nếu thư mục chưa là git repo:
     ```bash
     git init
     git branch -M main
     git remote add origin https://github.com/trantanphata5-source/quan-ly-cong-viec.git
     ```
   - Nếu repo trên GitHub đã có sẵn commit (VD: README tạo tự động), chạy `git pull origin main --allow-unrelated-histories` trước; khi xung đột thì **giữ bản của thư mục local**.
   - Commit toàn bộ file (`index.html`, `style.css`, `app.js`, `google_apps_script.js`, `vercel.json`, `README.md`, `DEPLOY.md`, `.gitignore`) rồi `git push -u origin main`.

2. **Deploy lên Vercel**
   - Import repo `trantanphata5-source/quan-ly-cong-viec` vào Vercel (hoặc dùng `npx vercel --prod` trong thư mục này).
   - Project name: `quan-ly-cong-viec`.
   - Framework Preset: **Other**. Build Command: **để trống**. Output Directory: **`.`** (thư mục gốc). Install Command: **để trống**.
   - Bật tự động deploy khi push lên nhánh `main`.

3. **Kiểm tra sau deploy**
   - Mở URL Vercel (dự kiến `https://quan-ly-cong-viec.vercel.app`).
   - Trang hiện 4 cột: Kinh doanh, Kỹ thuật, Đầu tư, Quản trị.
   - Nút góc phải trên chuyển sang chấm xanh "Đã đồng bộ Sheet hh:mm" sau vài giây.
   - Mở Google Sheet https://docs.google.com/spreadsheets/d/1oswJXBFTpD04-iby6A-Qh0gmQyTdEhKTGuQDXU2TJ1M/edit → có 2 sheet `NhomCongViec` và `CongViec` với dữ liệu.

**Lưu ý**
- KHÔNG sửa `DEFAULT_API` trong `app.js` (đã trỏ tới Apps Script đang chạy).
- KHÔNG deploy `google_apps_script.js` lên Vercel như một API — file này chỉ để lưu bản code backend, đã được dán vào Google Apps Script.
- Không thêm framework, không chuyển sang React/Next.js.

---

## Thông tin cấu hình hiện tại

| Mục | Giá trị |
|---|---|
| GitHub repo | https://github.com/trantanphata5-source/quan-ly-cong-viec |
| Google Sheet | https://docs.google.com/spreadsheets/d/1oswJXBFTpD04-iby6A-Qh0gmQyTdEhKTGuQDXU2TJ1M/edit |
| Apps Script Web App | https://script.google.com/macros/s/AKfycbxOE9NrhtST_pSCAy6wRJBcfVa0UMRaL6R6Ow3caMwtxibJQjrp1Ne2K6-jWSXmk93_Lw/exec |
| Vercel project | `quan-ly-cong-viec` |
