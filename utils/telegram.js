// msg, chatd
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

// Импорт функций для работы с базой данных
import {
	initializeDatabase,
	trackUser,
	getUserStats,
	saveUserSums,
	getUserSums,
	addTipHistory,
	getUserTipHistory,
	resetUserSums
} from './database.js';

// Получение текущего времени в польском часовом поясе
function getPolandTime() {
	const now = new Date();
	return new Date(now.toLocaleString("en-US", {timeZone: "Europe/Warsaw"}));
}

// Переменные для хранения данных - теперь используется база данных для персистентности
// Глобальные переменные остаются только для совместимости со старыми функциями
let lastResetDate = getPolandTime().toISOString(); // Время последнего сброса в польском часовом поясе

// Статистика и мониторинг бота
let botStats = {
	totalMessages: 0, // Общее количество сообщений
	totalUsers: new Set(), // Уникальные пользователи
	messagesLastHour: [], // Сообщения за последний час
	startTime: getPolandTime().toISOString(), // Время запуска бота
	lastActivity: getPolandTime().toISOString() // Последняя активность
};

// Состояние пользователя для каждого чата
const userStates = new Map(); // chatId -> { mode: 'waiting_expected' | 'waiting_received' | null }

// Очередь для отложенного удаления сообщений
const deleteQueue = [];

// Функция для отложенного удаления сообщения
function scheduleDelete(chatId, messageId, delayMs) {
	setTimeout(async () => {
		await deleteMessage(chatId, messageId);
	}, delayMs);
}

// Обновление статистики бота
// Обновление статистики бота
async function updateBotStats(chatId, userInfo = {}) {
	const now = getPolandTime();
	
	// Обновляем общую статистику
	botStats.totalMessages++;
	botStats.totalUsers.add(chatId);
	botStats.lastActivity = now.toISOString();
	
	// Добавляем сообщение в список за последний час
	botStats.messagesLastHour.push(now.getTime());
	
	// Очищаем сообщения старше часа
	const oneHourAgo = now.getTime() - (60 * 60 * 1000);
	botStats.messagesLastHour = botStats.messagesLastHour.filter(timestamp => timestamp > oneHourAgo);
	
	// Отслеживаем пользователя в базе данных
	try {
		await trackUser(chatId, userInfo);
	} catch (error) {
		console.error('Ошибка отслеживания пользователя:', error.message);
	}
	
	// Планируем обновление описания бота
	scheduleDescriptionUpdate();
}

// Получение текущего статуса бота
function getBotStatus() {
	const now = getPolandTime();
	const hour = now.getHours();
	const messagesThisHour = botStats.messagesLastHour.length;
	
	// Определяем статус по времени дня
	let timeStatus = "";
	if (hour >= 6 && hour < 12) {
		timeStatus = "🌅 Утро";
	} else if (hour >= 12 && hour < 18) {
		timeStatus = "☀️ День";
	} else if (hour >= 18 && hour < 22) {
		timeStatus = "🌆 Вечер";
	} else {
		timeStatus = "🌙 Ночь";
	}
	
	// Определяем нагрузку
	let loadStatus = "";
	if (messagesThisHour === 0) {
		loadStatus = "😴 Спящий режим";
	} else if (messagesThisHour <= 5) {
		loadStatus = "🟢 Низкая нагрузка";
	} else if (messagesThisHour <= 15) {
		loadStatus = "🟡 Средняя нагрузка";
	} else if (messagesThisHour <= 30) {
		loadStatus = "🟠 Высокая нагрузка";
	} else {
		loadStatus = "🔴 Пиковая нагрузка";
	}
	
	return { timeStatus, loadStatus, messagesThisHour };
}

// Получение времени работы бота
function getBotUptime() {
	const now = getPolandTime();
	const startTime = new Date(botStats.startTime);
	const uptimeMs = now.getTime() - startTime.getTime();
	
	const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
	const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
	
	if (hours > 0) {
		return `${hours}ч ${minutes}мин`;
	} else {
		return `${minutes}мин`;
	}
}

// Получение текущей даты в польском часовом поясе в формате YYYY-MM-DD
function getTodayDate() {
	const now = new Date();
	const polandTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Warsaw"}));
	return polandTime.toISOString().slice(0, 10);
}

// Получение текущего времени сброса (дата + время 11:00) в польском часовом поясе
function getResetTime() {
	const now = getPolandTime();
	const resetTime = new Date(now);
	resetTime.setHours(11, 0, 0, 0); // Устанавливаем 11:00:00 по польскому времени
	
	// Если сейчас время до 11:00, то берем сегодняшний сброс
	// Если после 11:00, то следующий сброс будет завтра в 11:00
	if (now.getHours() < 11) {
		// До 11:00 - берем сегодняшний сброс
		return resetTime.toISOString();
	} else {
		// После 11:00 - берем завтрашний сброс
		resetTime.setDate(resetTime.getDate() + 1);
		return resetTime.toISOString();
	}
}

// Проверка, нужен ли сброс (прошло ли время сброса в 11:00) по польскому времени
function shouldReset() {
	const now = getPolandTime();
	const lastReset = new Date(lastResetDate);
	
	// Создаем время сброса для сегодня (11:00) в польском часовом поясе
	const todayReset = new Date(now);
	todayReset.setHours(11, 0, 0, 0);
	
	// Если сейчас после 11:00 и последний сброс был до сегодняшних 11:00
	if (now >= todayReset && lastReset < todayReset) {
		return true;
	}
	
	return false;
}

// Получение читаемой даты в польском часовом поясе
function getReadableDate() {
	const polandTime = getPolandTime();
	return polandTime.toLocaleDateString("pl-PL");
}

// Проверка и выполнение сброса в 11:00 по польскому времени
function checkDateAndReset() {
	if (shouldReset()) {
		expectedSum = 0;
		receivedSum = 0;
		lastInput = null;
		lastResetDate = getPolandTime().toISOString(); // Обновляем время последнего сброса в польском часовом поясе
		// Очищаем состояния пользователей
		userStates.clear();
	}
}

// Функция для отправки сообщения с inline клавиатурой
export async function sendMessage(chatid, text, replyMarkup = null) {
	const url = `${TELEGRAM_API_URL}/sendMessage`;
	try {
		const body = {
			chat_id: chatid,
			text: text,
			parse_mode: "HTML",
		};

		if (replyMarkup) {
			body.reply_markup = replyMarkup;
		}

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.log(
				"Failed to send message to telegram user",
				errorText
			);
			return null;
		}
		return await response.json();
	} catch (err) {
		console.log("Error occurred while sending message to telegram user", err);
		return null;
	}
}

// Функция для редактирования сообщения
export async function editMessage(chatid, messageId, text, replyMarkup = null) {
	const url = `${TELEGRAM_API_URL}/editMessageText`;
	try {
		const body = {
			chat_id: chatid,
			message_id: messageId,
			text: text,
			parse_mode: "HTML",
		};

		if (replyMarkup) {
			body.reply_markup = replyMarkup;
		}

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-type": "application/json",
			},
			body: JSON.stringify(body),
		});

		return await response.json();
	} catch (err) {
		console.log("Error occurred while editing message", err);
		return null;
	}
}

// Функция для удаления сообщения
export async function deleteMessage(chatid, messageId) {
	const url = `${TELEGRAM_API_URL}/deleteMessage`;
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-type": "application/json",
			},
			body: JSON.stringify({
				chat_id: chatid,
				message_id: messageId,
			}),
		});

		return response.ok;
	} catch (err) {
		console.log("Error occurred while deleting message", err);
		return false;
	}
}

// Функция для ответа на callback query
export async function answerCallbackQuery(callbackQueryId, text = "") {
	const url = `${TELEGRAM_API_URL}/answerCallbackQuery`;
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-type": "application/json",
			},
			body: JSON.stringify({
				callback_query_id: callbackQueryId,
				text: text,
			}),
		});

		return response.ok;
	} catch (err) {
		console.log("Error occurred while answering callback query", err);
		return false;
	}
}

// Создание главного меню
function createMainMenu() {
	return {
		inline_keyboard: [
			[{ text: "1️⃣ Ввести ожидаемую сумму", callback_data: "input_expected" }],
			[{ text: "2️⃣ Ввести полученную сумму", callback_data: "input_received" }],
			[{ text: "📊 Показать итог и сбросить", callback_data: "show_summary" }],
			[{ text: "ℹ️ Справка", callback_data: "help" }],
		],
	};
}

// Главное сообщение с текущими суммами
export async function showMainInterface(chatId, messageId = null, userInfo = {}) {
	checkDateAndReset();
	await updateBotStats(chatId, userInfo); // Обновляем статистику

	// Получаем текущие суммы пользователя из базы данных
	let userSums;
	try {
		userSums = await getUserSums(chatId);
	} catch (error) {
		console.error('Ошибка получения сумм пользователя:', error.message);
		userSums = { expected_sum: 0, received_sum: 0, last_input: null };
	}

	const expectedSum = userSums.expected_sum || 0;
	const receivedSum = userSums.received_sum || 0;
	const date = getReadableDate();
	const difference = receivedSum - expectedSum;
	const differenceText =
		difference === 0
			? "0"
			: difference > 0
			? `+${difference}`
			: `${difference}`;

	// Информация о следующем сбросе
	const now = getPolandTime();
	const nextResetInfo = now.getHours() < 11 
		? "сегодня в 11:00" 
		: "завтра в 11:00";

	// Получаем динамический статус бота
	const { timeStatus, loadStatus, messagesThisHour } = getBotStatus();
	const uptime = getBotUptime();

	const text = `💰 <b>Калькулятор чаевых для Dominos</b>
	
📅 <i>${date}</i>
🎯 Ожидаемая сумма: <b>${expectedSum}</b>
💸 Полученная сумма: <b>${receivedSum}</b>
📊 Твой напивек: <b>${differenceText}</b>

🕐 <i>Автосброс ${nextResetInfo} (польское время)</i>
${timeStatus} • ${loadStatus}
📈 Сообщений за час: ${messagesThisHour} • Работает: ${uptime}

<i>Используйте кнопки для ввода сумм</i>`;

	const keyboard = createMainMenu();

	if (messageId) {
		return await editMessage(chatId, messageId, text, keyboard);
	} else {
		return await sendMessage(chatId, text, keyboard);
	}
}

// Обработка команды /итог с красивым форматированием
export async function summaryCommand(chatId, messageId = null, userInfo = {}) {
	checkDateAndReset();
	await updateBotStats(chatId, userInfo); // Обновляем статистику

	// Получаем текущие суммы пользователя из базы данных
	let userSums;
	try {
		userSums = await getUserSums(chatId);
	} catch (error) {
		console.error('Ошибка получения сумм пользователя:', error.message);
		userSums = { expected_sum: 0, received_sum: 0, last_input: null };
	}

	const expectedSum = userSums.expected_sum || 0;
	const receivedSum = userSums.received_sum || 0;
	const date = getReadableDate();
	const difference = receivedSum - expectedSum;
	const differenceText =
		difference === 0
			? "0"
			: difference > 0
			? `+${difference}`
			: `${difference}`;

	// Определяем статус
	let statusEmoji = "📊";
	let statusText = "Итоговый отчет";

	if (difference > 0) {
		statusEmoji = "💰";
		statusText = "Профит!";
	} else if (difference < 0) {
		statusEmoji = "📉";
		statusText = "Убыток";
	}

	// Получаем информацию о боте
	const { timeStatus, loadStatus } = getBotStatus();
	const uptime = getBotUptime();

	// Сохраняем в историю если есть данные
	if (expectedSum > 0 || receivedSum > 0) {
		try {
			await addTipHistory(chatId, expectedSum, receivedSum);
		} catch (error) {
			console.error('Ошибка сохранения в историю:', error.message);
		}
	}

	// Получаем историю чаевых за последние 7 дней
	let historyText = "";
	try {
		const history = await getUserTipHistory(chatId, 7);
		if (history.length > 0) {
			historyText = "\n\n📈 <b>История за неделю:</b>\n";
			history.slice(0, 5).forEach((record, index) => {
				const recordDate = new Date(record.timestamp).toLocaleDateString('ru-RU');
				const tipSign = record.tip_amount >= 0 ? "+" : "";
				historyText += `${index + 1}. ${recordDate}: ${tipSign}${record.tip_amount}\n`;
			});
			if (history.length > 5) {
				historyText += `... и еще ${history.length - 5} записей\n`;
			}
		}
	} catch (error) {
		console.error('Ошибка получения истории:', error.message);
	}

	// Создаем отдельное сообщение с итогом
	const summaryText = `${statusEmoji} <b>${statusText}</b>

📅 Дата: <i>${date}</i>
🎯 Ожидалось: <b>${expectedSum}</b>
🏧 Получено: <b>${receivedSum}</b>
📊 Разность: <b>${differenceText}</b>${historyText}

🤖 <b>Статус системы:</b>
${timeStatus} • ${loadStatus}
⏱️ Работает: ${uptime} • 👥 Всего пользователей: ${botStats.totalUsers.size}

✅ <i>Данные сброшены и сохранены в историю</i>`;

	// Отправляем отдельное сообщение с итогом
	const summaryMessage = await sendMessage(chatId, summaryText);

	// Закрепляем сообщение с итогом
	if (summaryMessage && summaryMessage.result) {
		await pinMessage(chatId, summaryMessage.result.message_id);

		// Планируем удаление закрепленного сообщения через 10 секунд
		scheduleDelete(chatId, summaryMessage.result.message_id, 10000);
	}

	// Сбрасываем суммы пользователя в базе данных
	try {
		await resetUserSums(chatId);
	} catch (error) {
		console.error('Ошибка сброса сумм пользователя:', error.message);
	}

	// Обновляем главное меню (показываем обнуленные суммы)
	if (messageId) {
		await showMainInterface(chatId, messageId, userInfo);
	}
}

// Обработка добавления числа
// Обработка ввода чисел в зависимости от режима
export async function handleNumberInput(
	chatId,
	text,
	userMessageId,
	mainMenuMessageId = null,
	userInfo = {}
) {
	checkDateAndReset();
	await updateBotStats(chatId, userInfo); // Обновляем статистику

	// Удаляем сообщение пользователя для чистоты чата
	await deleteMessage(chatId, userMessageId);

	const number = parseFloat(text.replace(",", "."));
	if (isNaN(number)) {
		// Отправляем ошибку которая автоматически удалится
		const errorMsg = await sendMessage(chatId, "❌ Неверный формат числа");
		if (errorMsg && errorMsg.result) {
			scheduleDelete(chatId, errorMsg.result.message_id, 2500);
		}
		return false;
	}

	const userState = userStates.get(chatId);

	if (!userState || !userState.mode) {
		// Если режим не установлен, показываем помощь
		const helpMsg = await sendMessage(
			chatId,
			"💡 Сначала выберите режим ввода через кнопки!"
		);
		if (helpMsg && helpMsg.result) {
			scheduleDelete(chatId, helpMsg.result.message_id, 3000);
		}
		return false;
	}

	// Получаем текущие суммы пользователя
	let userSums;
	try {
		userSums = await getUserSums(chatId);
	} catch (error) {
		console.error('Ошибка получения сумм пользователя:', error.message);
		userSums = { expected_sum: 0, received_sum: 0, last_input: null };
	}

	let notification = "";
	let newExpectedSum = userSums.expected_sum || 0;
	let newReceivedSum = userSums.received_sum || 0;
	let newLastInput = userSums.last_input;

	if (userState.mode === "waiting_expected") {
		newExpectedSum = number;
		newLastInput = "expected";
		notification = `🎯 Ожидаемая сумма: ${number}`;
		userStates.delete(chatId); // Очищаем режим
	} else if (userState.mode === "waiting_received") {
		newReceivedSum = number;
		newLastInput = "received";
		notification = `💸 Полученная сумма: ${number}`;
		userStates.delete(chatId); // Очищаем режим
	}

	// Сохраняем обновленные суммы в базу данных
	try {
		await saveUserSums(chatId, newExpectedSum, newReceivedSum, newLastInput);
	} catch (error) {
		console.error('Ошибка сохранения сумм пользователя:', error.message);
	}

	// Обновляем главное меню с новыми суммами
	if (mainMenuMessageId) {
		await showMainInterface(chatId, mainMenuMessageId, userInfo);
	}

	// Отправляем уведомление
	const notificationMsg = await sendMessage(chatId, notification);
	if (notificationMsg && notificationMsg.result) {
		scheduleDelete(chatId, notificationMsg.result.message_id, 1500);
	}

	return true;
}

// Показать справку
export async function showHelp(chatId, messageId = null, userInfo = {}) {
	await updateBotStats(chatId, userInfo); // Обновляем статистику
	
	const { timeStatus, loadStatus } = getBotStatus();
	const uptime = getBotUptime();
	
	const text = `ℹ️ <b>Справка по боту</b>

🎯 <b>Как пользоваться:</b>
• Нажмите "1️⃣" и введите ожидаемую сумму
• Нажмите "2️⃣" и введите полученную сумму  
• Посмотрите разность в главном меню
• Нажмите "📊 Показать итог" для финального отчета

🔧 <b>Команды:</b>
• <code>/start</code> - Главное меню
• Числа (1500, 1400.50) - Ввод сумм

💡 <b>Особенности:</b>
• Расчет разности между суммами
• Автоматический сброс каждый день в 11:00
• Полное автоудаление сообщений пользователя
• Мониторинг активности в реальном времени

🤖 <b>Статус бота:</b>
${timeStatus} • ${loadStatus}
⏱️ Работает: ${uptime} • 🇵🇱 Польское время`;

	const keyboard = {
		inline_keyboard: [
			[{ text: "🔙 Назад в меню", callback_data: "main_menu" }],
		],
	};

	if (messageId) {
		return await editMessage(chatId, messageId, text, keyboard);
	} else {
		return await sendMessage(chatId, text, keyboard);
	}
}

// Функция для закрепления сообщения
export async function pinMessage(chatid, messageId) {
	const url = `${TELEGRAM_API_URL}/pinChatMessage`;
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-type": "application/json",
			},
			body: JSON.stringify({
				chat_id: chatid,
				message_id: messageId,
				disable_notification: true,
			}),
		});

		return response.ok;
	} catch (err) {
		console.log("Error occurred while pinning message", err);
		return false;
	}
}

// Установка режима ввода ожидаемой суммы
export async function setExpectedInputMode(chatId, messageId = null, userInfo = {}) {
	await updateBotStats(chatId, userInfo); // Обновляем статистику
	userStates.set(chatId, { mode: "waiting_expected" });

	const text = `🎯 <b>Ввод ожидаемой суммы</b>

💡 Отправьте число - сумму, которую вы должны получить

<i>Пример: 1500 или 1500.50</i>`;

	const keyboard = {
		inline_keyboard: [
			[{ text: "🔙 Назад в меню", callback_data: "main_menu" }],
		],
	};

	if (messageId) {
		return await editMessage(chatId, messageId, text, keyboard);
	} else {
		return await sendMessage(chatId, text, keyboard);
	}
}

// Установка режима ввода полученной суммы
export async function setReceivedInputMode(chatId, messageId = null, userInfo = {}) {
	await updateBotStats(chatId, userInfo); // Обновляем статистику
	userStates.set(chatId, { mode: "waiting_received" });

	const text = `💸 <b>Ввод полученной суммы</b>

💡 Отправьте число - сумму, которую вы получили

<i>Пример: 1400 или 1400.75</i>`;

	const keyboard = {
		inline_keyboard: [
			[{ text: "🔙 Назад в меню", callback_data: "main_menu" }],
		],
	};

	if (messageId) {
		return await editMessage(chatId, messageId, text, keyboard);
	} else {
		return await sendMessage(chatId, text, keyboard);
	}
}

// Функция для обновления имени бота
async function updateBotName() {
	const { timeStatus, loadStatus } = getBotStatus();
	const now = getPolandTime();
	const hour = now.getHours().toString().padStart(2, '0');
	const minute = now.getMinutes().toString().padStart(2, '0');
	
	// Создаем динамическое имя
	let botName = "🍕 Domino's Calc";
	
	// Добавляем эмодзи времени
	if (hour >= 6 && hour < 12) {
		botName = "🌅 Domino's Calc";
	} else if (hour >= 12 && hour < 18) {
		botName = "☀️ Domino's Calc";
	} else if (hour >= 18 && hour < 22) {
		botName = "🌆 Domino's Calc";
	} else {
		botName = "🌙 Domino's Calc";
	}
	
	// Добавляем индикатор нагрузки
	const messagesThisHour = botStats.messagesLastHour.length;
	if (messagesThisHour > 15) {
		botName += " 🔥"; // Высокая активность
	} else if (messagesThisHour > 5) {
		botName += " ⚡"; // Средняя активность
	} else if (messagesThisHour > 0) {
		botName += " 💚"; // Низкая активность
	}
	
	try {
		const response = await fetch(`${TELEGRAM_API_URL}/setMyName`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: botName
			}),
		});
		
		if (response.ok) {
			console.log(`✅ Имя бота обновлено: ${botName}`);
		}
	} catch (err) {
		console.log("Ошибка обновления имени бота:", err);
	}
}

// Расширенная функция обновления имени с учетом польских праздников и событий
async function updateAdvancedBotName() {
	const now = getPolandTime();
	const hour = now.getHours();
	const date = now.getDate();
	const month = now.getMonth() + 1; // getMonth() возвращает 0-11
	const dayOfWeek = now.getDay(); // 0 = воскресенье, 1 = понедельник, и т.д.
	
	let botName = "🍕 Domino's";
	let statusEmoji = "";
	
	// Специальные даты (польские праздники)
	if (month === 12 && date >= 24 && date <= 26) {
		botName = "🎄 Domino's Calc"; // Рождество
	} else if (month === 1 && date === 1) {
		botName = "🎊 Domino's Calc"; // Новый год
	} else if (month === 5 && date === 3) {
		botName = "🇵🇱 Domino's Calc"; // День Конституции Польши
	} else if (month === 5 && date === 1) {
		botName = "💼 Domino's Calc"; // День труда
	} else {
		// Обычные дни - добавляем эмодзи времени
		if (hour >= 6 && hour < 12) {
			statusEmoji = "🌅"; // Утро
		} else if (hour >= 12 && hour < 18) {
			statusEmoji = "☀️"; // День
		} else if (hour >= 18 && hour < 22) {
			statusEmoji = "🌆"; // Вечер
		} else {
			statusEmoji = "🌙"; // Ночь
		}
		
		// Дни недели
		if (dayOfWeek === 0) { // Воскресенье
			botName = `${statusEmoji} Domino's 😴`;
		} else if (dayOfWeek === 6) { // Суббота
			botName = `${statusEmoji} Domino's 🎉`;
		} else if (dayOfWeek === 1) { // Понедельник
			botName = `${statusEmoji} Domino's 💪`;
		} else if (dayOfWeek === 5) { // Пятница
			botName = `${statusEmoji} Domino's 🎊`;
		} else {
			botName = `${statusEmoji} Domino's Calc`;
		}
	}
	
	// Добавляем индикатор активности
	const messagesThisHour = botStats.messagesLastHour.length;
	if (messagesThisHour >= 30) {
		botName += " 🔥"; // Очень высокая активность
	} else if (messagesThisHour >= 15) {
		botName += " ⚡"; // Высокая активность
	} else if (messagesThisHour >= 5) {
		botName += " 💚"; // Средняя активность
	} else if (messagesThisHour > 0) {
		botName += " 🟢"; // Низкая активность
	}
	
	try {
		const response = await fetch(`${TELEGRAM_API_URL}/setMyName`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: botName
			}),
		});
		
		if (response.ok) {
			console.log(`✅ Имя бота обновлено: ${botName}`);
		} else {
			const errorText = await response.text();
			console.log(`❌ Ошибка обновления имени: ${errorText}`);
		}
	} catch (err) {
		console.log("❌ Ошибка обновления имени бота:", err);
	}
}

// Функция для обновления описания бота
async function updateBotDescription() {
	try {
		const { timeStatus, loadStatus, messagesThisHour } = getBotStatus();
		const uptime = getBotUptime();
		const totalUsers = botStats.totalUsers.size;
		
		// Получаем статистику из базы данных
		let userStats;
		try {
			userStats = await getUserStats();
		} catch (error) {
			console.error('Ошибка получения статистики пользователей:', error.message);
			userStats = { totalUsers: 0, activeToday: 0, activeThisWeek: 0, totalInteractions: 0 };
		}
		
		// Краткое описание с нагрузкой и статистикой
		const description = `${timeStatus} • ${loadStatus}
📊 ${messagesThisHour} сообщений/час • ⏱️ ${uptime}
👥 ${userStats.totalUsers} всего • ${userStats.activeToday} активных сегодня
🇵🇱 Польское время • 💬 ${userStats.totalInteractions} взаимодействий
Калькулятор чаевых для Dominos с автосбросом в 11:00`;

		const url = `${TELEGRAM_API_URL}/setMyDescription`;
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				description: description
			}),
		});

		if (response.ok) {
			console.log("✅ Описание бота обновлено:", description.split('\n')[0]);
		} else {
			const errorText = await response.text();
			console.log("❌ Ошибка обновления описания бота:", errorText);
		}
	} catch (err) {
		console.log("❌ Ошибка при обновлении описания бота:", err.message);
	}
}

// Переменная для отслеживания последнего обновления описания
let lastDescriptionUpdate = 0;
let descriptionUpdateTimer = null;

// Запуск автоматического обновления описания каждые 5 минут
function startDescriptionUpdateTimer() {
	// Останавливаем предыдущий таймер, если он был
	if (descriptionUpdateTimer) {
		clearInterval(descriptionUpdateTimer);
	}
	
	// Запускаем новый таймер на 5 минут
	descriptionUpdateTimer = setInterval(async () => {
		try {
			console.log("🔄 Автоматическое обновление описания бота...");
			await updateBotDescription();
			lastDescriptionUpdate = Date.now();
		} catch (err) {
			console.log("❌ Ошибка автоматического обновления описания:", err.message);
		}
	}, 5 * 60 * 1000); // 5 минут
	
	console.log("✅ Автоматическое обновление описания запущено (каждые 5 минут)");
}

// Остановка автоматического обновления описания
function stopDescriptionUpdateTimer() {
	if (descriptionUpdateTimer) {
		clearInterval(descriptionUpdateTimer);
		descriptionUpdateTimer = null;
		console.log("⏹️ Автоматическое обновление описания остановлено");
	}
}

// Планирование обновления описания бота (для немедленных обновлений при активности)
function scheduleDescriptionUpdate() {
	const now = Date.now();
	
	// Немедленное обновление только если прошло более 5 минут с последнего
	if (now - lastDescriptionUpdate > 5 * 60 * 1000) {
		lastDescriptionUpdate = now;
		
		// Обновляем с небольшой задержкой, чтобы не перегружать API
		setTimeout(async () => {
			try {
				await updateBotDescription();
			} catch (err) {
				console.log("❌ Ошибка обновления описания:", err.message);
			}
		}, 2000);
	}
}

// Принудительное обновление описания бота (например, при запуске)
export async function forceUpdateBotDescription() {
	lastDescriptionUpdate = 0; // Сбрасываем ограничение времени
	try {
		await updateBotDescription();
		lastDescriptionUpdate = Date.now();
	} catch (err) {
		console.log("❌ Ошибка принудительного обновления описания:", err.message);
	}
}

// Инициализация системы автоматического обновления профиля
export async function initializeBotProfileSystem() {
	console.log("🤖 Инициализация системы обновления профиля бота...");
	
	// Немедленное обновление при запуске
	await forceUpdateBotDescription();
	
	// Запуск автоматического обновления каждые 5 минут
	startDescriptionUpdateTimer();
	
	console.log("✅ Система автоматического обновления профиля инициализирована");
}

// Остановка системы автоматического обновления профиля
export async function stopBotProfileSystem() {
	stopDescriptionUpdateTimer();
	console.log("🛑 Система автоматического обновления профиля остановлена");
}

// Обработка завершения процесса для корректной остановки таймеров
process.on('SIGINT', async () => {
	console.log("\n🔄 Завершение работы бота...");
	await stopBotProfileSystem();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	console.log("\n🔄 Завершение работы бота...");
	await stopBotProfileSystem();
	process.exit(0);
});
