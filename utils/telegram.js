// msg, chatd
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`

// Переменные для хранения суммы и даты
let currentSum = 0;
let lastResetDate = getTodayDate();

// Получение текущей даты в формате YYYY-MM-DD
function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

// Получение читаемой даты
function getReadableDate() {
  return new Date().toLocaleDateString('ru-RU');
}

// Проверка смены дня
function checkDateAndReset() {
  const today = getTodayDate();
  if (today !== lastResetDate) {
    currentSum = 0;
    lastResetDate = today;
  }
}

export async function sendMessage(chatid, text) {
    const url = `${TELEGRAM_API_URL}/sendMessage`;
    try {
        const respose = await fetch(url, {
            method: "POST",
            headers: {
                'Content-type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatid,
                text: text
            })
        })
        if (!respose.ok){
            console.log("Failed to send message to telegram user", await respose.text());
        }
        return await respose.json();
    } catch (err) {
        console.log("Error occured while sending message to telegram user", err);
        return null;
    }
}

// Функция для закрепления сообщения
export async function pinMessage(chatid, messageId) {
    const url = `${TELEGRAM_API_URL}/pinChatMessage`;
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                'Content-type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatid,
                message_id: messageId
            })
        });
        if (!response.ok) {
            console.log("Failed to pin message", await response.text());
            return false;
        }
        return true;
    } catch (err) {
        console.log("Error occurred while pinning message", err);
        return false;
    }
}

// Функция для обработки команды /итог
export async function summaryCommand(chatId) {
    checkDateAndReset();
    
    const date = getReadableDate();
    const response = `📅 Итог за ${date}:\n🔢 Сумма: ${currentSum}`;

    try {
        const sentMessage = await sendMessage(chatId, response);
        if (sentMessage && sentMessage.result) {
            const pinSuccess = await pinMessage(chatId, sentMessage.result.message_id);
            if (!pinSuccess) {
                await sendMessage(chatId, '❗ Не удалось закрепить сообщение (возможно, нет прав).');
            }
        }
    } catch (err) {
        console.error('Ошибка при отправке или закреплении:', err);
    }

    currentSum = 0;
    lastResetDate = getTodayDate();
}

// Функция для добавления числа к сумме
export async function addToSum(chatId, text) {
    checkDateAndReset();
    
    // Попробуем распознать число
    const number = parseFloat(text.replace(',', '.'));
    if (!isNaN(number)) {
        currentSum += number;
        await sendMessage(chatId, `Добавлено: ${number}. Текущая сумма: ${currentSum}`);
        return true;
    }
    return false;
}