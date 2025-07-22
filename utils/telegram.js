// msg, chatd
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

// Модуль для работы с файловой системой
import fs from 'fs';
import path from 'path';

// Путь к файлу с данными пользователей
const USERS_FILE_PATH = path.join(process.cwd(), 'users.json');

// Функция для загрузки пользователей из файла
function loadUsers() {
	try {
		if (fs.existsSync(USERS_FILE_PATH)) {
			const data = fs.readFileSync(USERS_FILE_PATH, 'utf8');
			return JSON.parse(data);
		}
	} catch (error) {
		console.error('Ошибка загрузки пользователей:', error.message);
	}
	return [];
}

// Функция для сохранения пользователей в файл
function saveUsers(users) {
	try {
		fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2), 'utf8');
	} catch (error) {
		console.error('Ошибка сохранения пользователей:', error.message);
	}
}

// Функция для добавления или обновления пользователя
function trackUser(chatId, userInfo = {}) {
	const users = loadUsers();
	const polandTime = getPolandTime();
	
	// Ищем существующего пользователя
	const existingUserIndex = users.findIndex(user => user.chatId === chatId);
	
	if (existingUserIndex !== -1) {
		// Обновляем существующего пользователя
		users[existingUserIndex].lastSeen = polandTime.toISOString();
		users[existingUserIndex].totalInteractions = (users[existingUserIndex].totalInteractions || 0) + 1;
		
		// Обновляем дополнительную информацию, если она есть
		if (userInfo.username) users[existingUserIndex].username = userInfo.username;
		if (userInfo.firstName) users[existingUserIndex].firstName = userInfo.firstName;
		if (userInfo.lastName) users[existingUserIndex].lastName = userInfo.lastName;
	} else {
		// Добавляем нового пользователя
		const newUser = {
			chatId: chatId,
			firstSeen: polandTime.toISOString(),
			lastSeen: polandTime.toISOString(),
			totalInteractions: 1,
			username: userInfo.username || null,
			firstName: userInfo.firstName || null,
			lastName: userInfo.lastName || null
		};
		users.push(newUser);
	}
	
	saveUsers(users);
}

// Функция для получения статистики пользователей
function getUserStats() {
	const users = loadUsers();
	const now = getPolandTime();
	const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	
	const activeToday = users.filter(user => new Date(user.lastSeen) > oneDayAgo).length;
	const activeThisWeek = users.filter(user => new Date(user.lastSeen) > oneWeekAgo).length;
	const totalInteractions = users.reduce((sum, user) => sum + (user.totalInteractions || 0), 0);
	
	return {
		totalUsers: users.length,
		activeToday,
		activeThisWeek,
		totalInteractions
	};
}

// Получение текущего времени в польском часовом поясе
function getPolandTime() {
	const now = new Date();
	return new Date(now.toLocaleString("en-US", {timeZone: "Europe/Warsaw"}));
}

// Переменные для хранения данных
let expectedSum = 0; // Сумма, которую должны получить
let receivedSum = 0; // Сумма, которую получили
let lastResetDate = getPolandTime().toISOString(); // Время последнего сброса в польском часовом поясе
let lastInput = null; // 'expected' или 'received' - что было введено последним

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
function updateBotStats(chatId, userInfo = {}) {
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
	
	// Отслеживаем пользователя в файле
	trackUser(chatId, userInfo);
	
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
			[{ text: "📊 Показать итог", callback_data: "show_summary" }],
			[
				{ text: "🔄 Сбросить всё", callback_data: "reset_sum" },
				{ text: "↩️ Сбросить последнее", callback_data: "reset_last" },
			],
			[{ text: "ℹ️ Справка", callback_data: "help" }],
		],
	};
}

// Главное сообщение с текущими суммами
export async function showMainInterface(chatId, messageId = null, userInfo = {}) {
	checkDateAndReset();
	updateBotStats(chatId, userInfo); // Обновляем статистику

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

	const text = `💰 <b>Калькулятор чая для Dominos</b>
	
📅 <i>${date}</i>
🎯 Ожидаемая сумма: <b>${expectedSum}</b>
💸 Полученная сумма: <b>${receivedSum}</b>
📊 Твой напивек: <b>${differenceText}</b>

🕐 <i>Автосброс ${nextResetInfo} (польское время)</i>

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
	updateBotStats(chatId, userInfo); // Обновляем статистику

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

	// Создаем отдельное сообщение с итогом
	const summaryText = `${statusEmoji} <b>${statusText}</b>

📅 Дата: <i>${date}</i>
🎯 Ожидалось: <b>${expectedSum}</b>
🏧 Получено: <b>${receivedSum}</b>
📊 Разность: <b>${differenceText}</b>

🤖 <b>Статус системы:</b>
${timeStatus} • ${loadStatus}
⏱️ Работает: ${uptime} • 👥 Всего пользователей: ${botStats.totalUsers.size}

✅ <i>Данные сброшены</i>`;

	// Отправляем отдельное сообщение с итогом
	const summaryMessage = await sendMessage(chatId, summaryText);

	// Закрепляем сообщение с итогом
	if (summaryMessage && summaryMessage.result) {
		await pinMessage(chatId, summaryMessage.result.message_id);

		// Планируем удаление закрепленного сообщения через 8 секунд
		scheduleDelete(chatId, summaryMessage.result.message_id, 8000);
	}

	// Сбрасываем суммы
	expectedSum = 0;
	receivedSum = 0;
	lastResetDate = new Date().toISOString();
	userStates.clear();

	// Обновляем главное меню (показываем обнуленные суммы)
	if (messageId) {
		await showMainInterface(chatId, messageId);
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
	updateBotStats(chatId, userInfo); // Обновляем статистику

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

	let notification = "";

	if (userState.mode === "waiting_expected") {
		expectedSum = number;
		lastInput = "expected";
		notification = `🎯 Ожидаемая сумма: ${number}`;
		userStates.delete(chatId); // Очищаем режим
	} else if (userState.mode === "waiting_received") {
		receivedSum = number;
		lastInput = "received";
		notification = `💸 Полученная сумма: ${number}`;
		userStates.delete(chatId); // Очищаем режим
	}

	// Обновляем главное меню с новыми суммами
	if (mainMenuMessageId) {
		await showMainInterface(chatId, mainMenuMessageId);
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
	updateBotStats(chatId, userInfo); // Обновляем статистику
	
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
	updateBotStats(chatId, userInfo); // Обновляем статистику
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
	updateBotStats(chatId, userInfo); // Обновляем статистику
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

// Сброс всех данных
export async function resetData(chatId, messageId = null, userInfo = {}) {
	updateBotStats(chatId, userInfo); // Обновляем статистику
	
	expectedSum = 0;
	receivedSum = 0;
	lastInput = null;
	userStates.delete(chatId); // Очищаем состояние пользователя

	// Отправляем уведомление о сбросе
	const notification = await sendMessage(chatId, "🔄 Все данные сброшены");
	if (notification && notification.result) {
		scheduleDelete(chatId, notification.result.message_id, 1500);
	}

	// Обновляем главное меню
	if (messageId) {
		await showMainInterface(chatId, messageId);
	}
}

// Сброс последнего ввода
export async function resetLastInput(chatId, messageId = null, userInfo = {}) {
	updateBotStats(chatId, userInfo); // Обновляем статистику
	
	if (!lastInput) {
		// Если нет последнего ввода
		const notification = await sendMessage(chatId, "❌ Нет данных для сброса");
		if (notification && notification.result) {
			scheduleDelete(chatId, notification.result.message_id, 2000);
		}
		return;
	}

	let resetText = "";
	if (lastInput === "expected") {
		expectedSum = 0;
		resetText = "↩️ Ожидаемая сумма сброшена";
	} else if (lastInput === "received") {
		receivedSum = 0;
		resetText = "↩️ Полученная сумма сброшена";
	}

	lastInput = null; // Очищаем информацию о последнем вводе
	userStates.delete(chatId); // Очищаем состояние пользователя

	// Отправляем уведомление о сбросе
	const notification = await sendMessage(chatId, resetText);
	if (notification && notification.result) {
		scheduleDelete(chatId, notification.result.message_id, 1500);
	}

	// Обновляем главное меню
	if (messageId) {
		await showMainInterface(chatId, messageId);
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
		const userStats = getUserStats();
		
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

// Экспорт функций для работы с пользователями
export { loadUsers, saveUsers, trackUser, getUserStats };

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
