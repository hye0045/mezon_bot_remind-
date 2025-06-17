## Bot Nhắc Nhở Cá Nhân (Lưu trữ JSON)

Bot này giúp bạn quản lý công việc, lịch học và deadline ngay trên Mezon. Dữ liệu nhắc nhở được lưu trong file `reminders.json`.

### Cài đặt và Chạy

1.  Clone repository (nếu có).
2.  Chạy `yarn install` hoặc `npm install` để cài đặt các dependency.
3.  Sao chép file `.env.example` thành `.env` (nếu có file example) hoặc tạo file `.env` mới.
4.  Điền `APPLICATION_TOKEN` của bot bạn vào file `.env`.
    ```
    APPLICATION_TOKEN=your_mezon_bot_application_token_here
    COMMAND_PREFIX=!
    BOT_ID=your_bot_id_here_if_needed_for_self_ignore
    ```
5.  Chạy bot bằng `yarn start` hoặc `npm start`.

---

## CÁC LỆNH

Sử dụng tiền tố được định nghĩa trong `.env` (mặc định là `!`) trước mỗi lệnh.

-   `!nhacnho [HH:MM] [DD/MM/YYYY] [Nội dung]`
    Đặt một nhắc nhở.
    *Ví dụ:* `!nhacnho 09:00 30/10/2024 Nộp báo cáo tháng`

-   `!danhsach`
    Liệt kê các nhắc nhở của bạn (trong kênh hiện tại).

-   `!xoa [ID_nhắc_nhở]`
    Xóa một nhắc nhở theo ID của nó.
    *Ví dụ:* `!xoa 1`

-   `!quotehangngay [HH:MM]`
    Đặt lịch nhận một câu trích dẫn hay vào `HH:MM` mỗi ngày.
    *Ví dụ:* `!quotehangngay 07:30`

-   `!trogiup`
    Hiển thị danh sách các lệnh này.

---
**mezon-bot-reminder-json**