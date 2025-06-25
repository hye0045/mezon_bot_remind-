//-- IMPORT LIBRARY-- 
const dotenv = require("dotenv");//Đọc các biến môi trường từ file .env
const { MezonClient } = require("mezon-sdk");//Thư viện MezonClient
const axios = require('axios');//thư viện thực hiện yêu cầu HTTP(Gọi API lấy quote)
const fs = require('fs').promises; // Sử dụng fs.promises (node.js) cho thao tác file bất đồng bộ
const path = require('path');//module path (node.js) để xử lý đường dẫn file

dotenv.config();//tải các biến từ file .env vào process.env

// --- CONFIGURATION ---
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "!";
const BOT_ID = process.env.BOT_ID;
// const REMINDERS_FILE_PATH = path.join(__dirname, 'reminders.json'); 
const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || __dirname; 
const REMINDERS_FILE_PATH = path.join(DATA_DIR, 'reminders.json'); 
// --- BOT STATE ---
let REMINDERS = [];//mảng chứa đối tượng reminder
let nextReminderId = 1;// biến đếm để tạo ID 

// --- COMMANDS DEFINITIONS ---
const SET_REMINDER_COMMAND = "nhacnho";
const LIST_REMINDERS_COMMAND = "danhsach";
const DELETE_REMINDER_COMMAND = "xoa";
const HELP_COMMAND_REMINDER = "trogiup";
const SET_DAILY_QUOTE_COMMAND = "quotehangngay";

// --- HELP MESSAGE ---
const HELP_MESSAGE_REMINDER = `LỆNH BOT NHẮC NHỞ (Tiền tố: ${COMMAND_PREFIX})
${COMMAND_PREFIX}${SET_REMINDER_COMMAND} [HH:MM] [DD/MM/YYYY] [Nội dung]
  Đặt một nhắc nhở. Ví dụ: ${COMMAND_PREFIX}${SET_REMINDER_COMMAND} 09:00 30/10/2024 Nộp báo cáo tháng

${COMMAND_PREFIX}${LIST_REMINDERS_COMMAND}
  Liệt kê các nhắc nhở của bạn trong kênh này.

${COMMAND_PREFIX}${DELETE_REMINDER_COMMAND} [ID_nhắc_nhở]
  Xóa một nhắc nhở. Ví dụ: ${COMMAND_PREFIX}${DELETE_REMINDER_COMMAND} 1

${COMMAND_PREFIX}${SET_DAILY_QUOTE_COMMAND} [HH:MM]
  Đặt lịch nhận trích dẫn hay vào HH:MM mỗi ngày. Ví dụ: ${COMMAND_PREFIX}${SET_DAILY_QUOTE_COMMAND} 07:30

${COMMAND_PREFIX}${HELP_COMMAND_REMINDER}
  Hiển thị danh sách lệnh này.
`;

// --- MEZON CLIENT ---
const client = new MezonClient(process.env.APPLICATION_TOKEN);

// --- FILE I/O FOR REMINDERS ---
async function loadRemindersFromFile() {
    try {
        await fs.access(REMINDERS_FILE_PATH); // Kiểm tra tồn tại của file 
        const data = await fs.readFile(REMINDERS_FILE_PATH, 'utf8');
        if (!data.trim()) return []; // Xử lý tệp rỗng 
        const parsedReminders = JSON.parse(data);
        return parsedReminders.map(r => ({
            ...r,
            due_time: new Date(r.due_time), // Chuyển chuỗi định dạng ISO về đối tượng Date
            // last_triggered_date được lưu dưới dạng chuỗi, không cần chuyển đổi 
        }));
    } catch (error) {
        if (error.code === 'ENOENT') {//kiểm tra lỗi file có tồn tại hay không
            console.log("Reminders file not found. Starting with an empty list.");
        } else {
            console.error("Error loading reminders:", error.message, "A new reminders file might be created or an empty list will be used.");
        }
        return [];
    }
}

async function saveRemindersToFile() {
    try {
        const dataToSave = JSON.stringify(REMINDERS, null, 2); // Hiển thị JSON dễ đọc
        await fs.writeFile(REMINDERS_FILE_PATH, dataToSave, 'utf8');
        console.log("Reminders saved to file."); 
    } catch (error) {
        console.error("Error saving reminders:", error);
    }
}
// Hàm khởi tạo danh sách nhắc nhở khi bot bắt đầu
async function initializeReminders() {
    REMINDERS = await loadRemindersFromFile();
    if (REMINDERS.length > 0) {
        const maxId = REMINDERS.reduce((max, r) => (r.id > max ? r.id : max), 0);
        nextReminderId = maxId + 1;
    } else {
        nextReminderId = 1;
    }
    console.log(`Reminders loaded. Count: ${REMINDERS.length}. Next ID: ${nextReminderId}`);
}

// --- MAIN BOT LOGIC ---
async function main() {
    await initializeReminders(); // Load reminders trước khi login
    await client.login();

    client.onChannelMessage(async (event) => {
        try {
            const originMessage = event?.content?.t;
            if (!originMessage || event?.sender_id === BOT_ID) {
                return;
            }

            if (originMessage.startsWith(COMMAND_PREFIX)) {
                const args = originMessage.slice(COMMAND_PREFIX.length).trim().split(/ +/);
                const command = args.shift().toLowerCase();
                await handleCommand(command, args, event);
            }
        } catch (error) {
            console.error("Error processing message:", error);
            sendRef(event, "Đã có lỗi xảy ra khi xử lý yêu cầu của bạn.");
        }
    });

    setInterval(checkReminders, 60000); // chech reminders mỗi phút
    console.log("Reminder check interval started.");
}

main()
    .then(() => {
        console.log("Bot nhắc nhở (JSON storage) đã khởi động!");
    })
    .catch((error) => {
        console.error("Lỗi nghiêm trọng khi khởi động bot:", error);
        process.exit(1);
    });

// --- COMMAND HANDLERS ---
async function handleCommand(command, args, event) {
    console.log("COMMAND:", command, "ARGS:", args, "CHANNEL:", event.channel_id);

    switch (command) {
        case SET_REMINDER_COMMAND:
            await handleSetReminder(args, event);
            break;
        case LIST_REMINDERS_COMMAND:
            handleListReminders(event);
            break;
        case DELETE_REMINDER_COMMAND:
            await handleDeleteReminder(args, event);
            break;
        case HELP_COMMAND_REMINDER:
            sendRef(event, HELP_MESSAGE_REMINDER);
            break;
        case SET_DAILY_QUOTE_COMMAND:
            await handleSetDailyQuote(args, event);
            break;
        default:
            sendRef(event, `Lệnh không hợp lệ. Gõ ${COMMAND_PREFIX}${HELP_COMMAND_REMINDER} để xem các lệnh.`);
    }
}

async function handleSetReminder(args, event) {
    if (args.length < 3) {
        sendRef(event, `Sai cú pháp. Ví dụ: ${COMMAND_PREFIX}${SET_REMINDER_COMMAND} 09:00 30/10/2024 Nộp báo cáo`);
        return;
    }

    const timeStr = args[0];
    const dateStr = args[1];
    const message = args.slice(2).join(" ");

    const [hours, minutes] = timeStr.split(':').map(Number);
    const [day, month, year] = dateStr.split('/').map(Number);

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59 ||
        isNaN(day) || isNaN(month) || isNaN(year) || day < 1 || day > 31 || month < 1 || month > 12 || year < new Date().getFullYear()) {
        sendRef(event, "Định dạng thời gian (HH:MM) hoặc ngày (DD/MM/YYYY) không hợp lệ.");
        return;
    }

    const dueTime = new Date(year, month - 1, day, hours, minutes, 0, 0);

    if (dueTime <= new Date()) {
        sendRef(event, "Thời gian nhắc nhở phải ở trong tương lai.");
        return;
    }

    const newReminder = {
        id: nextReminderId++,
        channel_id: event.channel_id,
        user_id: event.sender_id,
        due_time: dueTime, // Lưu trữ vào database
        message: message,
        type: 'ONCE'
    };
    REMINDERS.push(newReminder);
    await saveRemindersToFile();
    sendRef(event, `✅ Đã đặt nhắc nhở (ID: ${newReminder.id}): "${message}" vào lúc ${dueTime.toLocaleString('vi-VN')}`);
    console.log("New reminder set:", newReminder);
}

function handleListReminders(event) {
    const channelReminders = REMINDERS.filter(r => r.channel_id === event.channel_id && r.type === 'ONCE');
    const dailyQuotes = REMINDERS.filter(r => r.channel_id === event.channel_id && r.type === 'DAILY_API' && r.api_type === 'quote');

    if (channelReminders.length === 0 && dailyQuotes.length === 0) {
        sendRef(event, "Không có nhắc nhở nào trong kênh này.");
        return;
    }

    let response = "🗓️ --- NHẮC NHỞ TRONG KÊNH NÀY --- 🗓️\n";
    if (channelReminders.length > 0) {
        response += "\n📌 Nhắc nhở một lần:\n";
        channelReminders.sort((a,b) => a.due_time - b.due_time).forEach(r => { // Sort by due time
            response += `  ID ${r.id}: "${r.message}" - ${new Date(r.due_time).toLocaleString('vi-VN')}\n`;
        });
    }
    if (dailyQuotes.length > 0) {
        response += "\n💡 Nhắc nhở Quote hàng ngày:\n";
        dailyQuotes.forEach(r => {
            const timeStr = new Date(r.due_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            response += `  ID ${r.id}: Gửi quote vào ${timeStr} mỗi ngày.\n`;
        });
    }
    sendRef(event, response);
}

async function handleDeleteReminder(args, event) {
    if (args.length < 1) {
        sendRef(event, `Sai cú pháp. Ví dụ: ${COMMAND_PREFIX}${DELETE_REMINDER_COMMAND} 1`);
        return;
    }
    const reminderIdToDel = parseInt(args[0]);
    if (isNaN(reminderIdToDel)) {
        sendRef(event, "ID nhắc nhở không hợp lệ.");
        return;
    }

    const initialLength = REMINDERS.length;
    REMINDERS = REMINDERS.filter(r => !(r.id === reminderIdToDel && r.channel_id === event.channel_id));

    if (REMINDERS.length < initialLength) {
        await saveRemindersToFile();
        sendRef(event, `🗑️ Đã xóa nhắc nhở có ID ${reminderIdToDel}.`);
    } else {
        sendRef(event, `Không tìm thấy nhắc nhở có ID ${reminderIdToDel} trong kênh này.`);
    }
}

async function fetchQuote() {
    try {
        const response = await axios.get('https://api.quotable.io/random');
        if (response.data && response.data.content) {
            return `"${response.data.content}"\n      – ${response.data.author}`;
        }
        return "Không thể lấy được trích dẫn hôm nay. API có thể đang gặp sự cố.";
    } catch (error) {
        console.error("Error fetching quote:", error.message);
        return "Đã có lỗi khi cố gắng lấy trích dẫn.";
    }
}

async function handleSetDailyQuote(args, event) {
    if (args.length < 1) {
        sendRef(event, `Sai cú pháp. Ví dụ: ${COMMAND_PREFIX}${SET_DAILY_QUOTE_COMMAND} 08:00`);
        return;
    }
    const timeStr = args[0];
    const [hours, minutes] = timeStr.split(':').map(Number);

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        sendRef(event, "Định dạng thời gian không hợp lệ. Phải là HH:MM (ví dụ: 07:30).");
        return;
    }

    // Xóa các cài đặt quote hàng ngày cũ trong kênh này để tránh trùng lặp
    REMINDERS = REMINDERS.filter(r => !(r.channel_id === event.channel_id && r.type === 'DAILY_API' && r.api_type === 'quote'));
    
    const dueTime = new Date(); // Ngày tháng năm không quan trọng, chỉ giờ phút
    dueTime.setHours(hours, minutes, 0, 0); 

    const newDailyReminder = {
        id: nextReminderId++,
        channel_id: event.channel_id,
        user_id: event.sender_id,
        due_time: dueTime,
        message: "Trích dẫn hay hàng ngày",
        type: 'DAILY_API',
        api_type: 'quote',
        last_triggered_date: null // Sẽ được cập nhật khi trigger lần đầu
    };
    REMINDERS.push(newDailyReminder);
    await saveRemindersToFile();
    sendRef(event, `💡 Đã đặt lịch gửi trích dẫn hay vào ${timeStr} mỗi ngày (ID: ${newDailyReminder.id}).`);
    console.log("New daily quote reminder set:", newDailyReminder);
}

// --- REMINDER CHECKING ---
async function checkReminders() {
    const now = new Date();
    const todayDateStr = now.toDateString(); // Dùng để so sánh cho daily tasks
    let remindersModified = false;

    const newRemindersList = [];

    for (const reminder of REMINDERS) {
        let keepReminder = true;
        // Đảm bảo due_time là đối tượng Date
        const reminderDueTime = (reminder.due_time instanceof Date) ? reminder.due_time : new Date(reminder.due_time);

        if (reminder.type === 'ONCE') {
            if (reminderDueTime <= now) {
                const userMention = `<@${reminder.user_id}>`;
                sendToChannel(reminder.channel_id, `🔔 ${userMention} ơi, đến giờ rồi nè! \nNội dung: ${reminder.message}`);
                console.log(`Triggered ONCE reminder ID ${reminder.id}: ${reminder.message} for user ${reminder.user_id} in channel ${reminder.channel_id}`);
                keepReminder = false;
                remindersModified = true;
            }
        } else if (reminder.type === 'DAILY_API' && reminder.api_type === 'quote') {
            if (now.getHours() === reminderDueTime.getHours() && now.getMinutes() === reminderDueTime.getMinutes()) {
                if (reminder.last_triggered_date !== todayDateStr) {
                    const quote = await fetchQuote();
                    sendToChannel(reminder.channel_id, `☀️ Chào buổi sáng! Trích dẫn hôm nay cho bạn:\n${quote}`);
                    reminder.last_triggered_date = todayDateStr; // Cập nhật trực tiếp
                    remindersModified = true;
                    console.log(`Triggered DAILY_API quote reminder ID ${reminder.id} in channel ${reminder.channel_id}`);
                }
            }
        }
        
        if (keepReminder) {
            newRemindersList.push(reminder);
        }
    }

    if (remindersModified) {
        REMINDERS = newRemindersList;
        await saveRemindersToFile();
        console.log("Reminders list updated and saved after checking.");
    }
}

// --- HÀM GỬI TIN NHẮN  ---
function sendToChannel(channelId, messageContent) {
    const channel = client.channels.get(channelId);
    if (channel) {
        channel.sendMessage({ t: messageContent })
            .catch(err => console.error(`Error sending message to channel ${channelId}:`, err));
    } else {
        console.error(`Không tìm thấy kênh với ID: ${channelId} để gửi thông báo.`);
    }
}

function sendRef(event, message) {
    if (!event || !event.channel_id || !event.message_id) {
        console.error("sendRef: Event data is incomplete. Cannot reply.", event);
        // Dự phòng:nếu thiếu dữ liệu sự kiện, gửi đến kênh nếu có thể, hoặc chỉ cần ghi log
        if (event && event.channel_id) {
            sendToChannel(event.channel_id, message);
        } else {
            console.log("Cannot send reply due to missing event data. Message:", message);
        }
        return;
    }

    const channel = client.channels.get(event.channel_id);
    if (!channel) {
        console.log("Không thể tìm thấy kênh để gửi reply. Channel ID:", event.channel_id);
        sendToChannel(event.channel_id, message); // Thử gửi dưới dạng tin nhắn thông thường
        return;
    }
    const comingMessage = channel.messages.get(event.message_id);
    if (!comingMessage) {
        console.log("Không tìm thấy message gốc để reply. Message ID:", event.message_id, "Sending as regular message.");
        sendToChannel(event.channel_id, message);
        return;
    }
    comingMessage.reply({ t: message })
        .catch(err => console.error(`Error replying to message ${event.message_id} in channel ${event.channel_id}:`, err));
}
