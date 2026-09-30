# Quản lý đầu việc – PC Vũng Tàu

Trang ghi nhớ và quản lý đầu việc theo nhóm (Kinh doanh, Kỹ thuật, Đầu tư, Quản trị… và các nhóm tự thêm), kéo thả trực quan, cơ sở dữ liệu là Google Sheet.

- **Mã nguồn**: https://github.com/trantanphata5-source/quan-ly-cong-viec
- **Cơ sở dữ liệu**: [Google Sheet](https://docs.google.com/spreadsheets/d/1oswJXBFTpD04-iby6A-Qh0gmQyTdEhKTGuQDXU2TJ1M/edit) qua Google Apps Script Web App (đã cấu hình sẵn trong `app.js` → `DEFAULT_API`)

---

## Tính năng

1. **Công việc**: thêm / sửa / xóa; mỗi việc có tên, nhóm, cấp độ, thời hạn, trạng thái, mức ưu tiên, nội dung chi tiết.
2. **Hai cấp trong mỗi nhóm**
   - **★ Việc chính** – ô viền màu phía trên (các việc trọng tâm).
   - **Việc khác** – danh sách bên dưới.
3. **Kéo thả**: chuyển việc giữa các nhóm, giữa Việc chính ↔ Việc khác, sắp xếp thứ tự.
4. **Nhóm công việc**: thêm nhóm mới, đổi tên / màu, chuyển trái / phải, xóa nhóm.
5. **Theo dõi**: tích hoàn thành, tự báo *Quá hạn*, thống kê nhanh, tìm kiếm (gõ không dấu được), ẩn việc đã xong, xuất CSV mở bằng Excel.
6. **Lưu & đồng bộ**: lưu ngay trên trình duyệt (F5 / mất mạng không mất dữ liệu) → tự đẩy lên Google Sheet sau 0,7 giây; tự tải bản mới từ Sheet mỗi 60 giây và khi quay lại tab.

## Cấu trúc dự án

```
quan-ly-cong-viec/
├── index.html              # Giao diện chính
├── style.css               # Giao diện, màu EVN, bảng Kanban, responsive
├── app.js                  # Logic: CRUD, kéo thả, lưu cục bộ, đồng bộ Google Sheet
├── google_apps_script.js   # Backend dán vào Apps Script của Google Sheet (không deploy lên Vercel)
├── vercel.json             # Cấu hình deploy Vercel (site tĩnh, không cần build)
├── DEPLOY.md               # Hướng dẫn / prompt giao cho Antigravity để deploy
└── README.md
```

Đây là **site tĩnh thuần HTML/CSS/JS**, không cần `npm install`, không có bước build.

## Cột dữ liệu trên Google Sheet (Apps Script tự tạo)

| Sheet | Cột |
|---|---|
| **NhomCongViec** | Mã nhóm · Tên nhóm · Màu · Thứ tự · Ngày tạo |
| **CongViec** | Mã việc · Tên công việc · Mã nhóm · Tên nhóm · Cấp độ (Việc chính/Việc khác) · Nội dung chi tiết · Thời hạn (dd/MM/yyyy) · Trạng thái (Chưa làm/Đang làm/Hoàn thành) · Ưu tiên (Bình thường/Quan trọng/Khẩn) · Thứ tự · Ngày tạo · Cập nhật lần cuối |

Có thể thêm việc trực tiếp trên sheet **CongViec**: chỉ cần điền *Tên công việc* và *Tên nhóm*, trang web tự nhận ở lần tải tiếp theo.

Lần đầu mở trang khi Sheet còn trống, 36 đầu việc mẫu (từ bản ghi chú viết tay) sẽ tự được ghi lên Sheet.

## Chạy thử trên máy

Mở trực tiếp `index.html` bằng trình duyệt, hoặc:

```bash
npx serve .
```

## Đổi URL Apps Script

- Sửa hằng `DEFAULT_API` ở đầu `app.js`, commit & push → Vercel tự deploy lại; hoặc
- Bấm nút trạng thái đồng bộ (góc phải trên) → dán URL `/exec` mới → **Lưu & kết nối** (chỉ áp dụng cho trình duyệt đó); hoặc
- Mở trang với tham số `?api=<URL /exec>`.

Khi sửa code Apps Script: **Triển khai → Quản lý triển khai → Sửa → Phiên bản mới → Triển khai** để URL cũ nhận code mới.
