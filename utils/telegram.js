// msg, chatd
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

// Переменные для хранения данных
let expectedSum = 0; // Сумма, которую должны получить
let receivedSum = 0; // Сумма, которую получили
let lastResetDate = getTodayDate();

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

// Получение текущей даты в формате YYYY-MM-DD
function getTodayDate() {
	return new Date().toISOString().slice(0, 10);
}

// Получение читаемой даты
function getReadableDate() {
	return new Date().toLocaleDateString("ru-RU");
}

// Проверка смены дня
function checkDateAndReset() {
	const today = getTodayDate();
	if (today !== lastResetDate) {
		expectedSum = 0;
		receivedSum = 0;
		lastResetDate = today;
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
			console.log(
				"Failed to send message to telegram user",
				await response.text()
			);
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
			[
				{ text: "1️⃣ Ввести ожидаемую сумму", callback_data: "input_expected" },
			],
			[
				{ text: "2️⃣ Ввести полученную сумму", callback_data: "input_received" },
			],
			[
				{ text: "📊 Показать итог", callback_data: "show_summary" },
				{ text: "🔄 Сбросить", callback_data: "reset_sum" },
			],
			[{ text: "ℹ️ Справка", callback_data: "help" }],
		],
	};
}

// Главное сообщение с текущими суммами
export async function showMainInterface(chatId, messageId = null) {
	checkDateAndReset();

	const date = getReadableDate();
	const difference = receivedSum - expectedSum;
	const differenceText = difference === 0 ? "0" : 
		difference > 0 ? `+${difference}` : `${difference}`;
	
	const text = `💰 <b>Калькулятор разности</b>
	
📅 <i>${date}</i>
🎯 Ожидаемая сумма: <b>${expectedSum}</b>
💸 Полученная сумма: <b>${receivedSum}</b>
📊 Разность: <b>${differenceText}</b>

<i>Используйте кнопки для ввода сумм</i>`;

	const keyboard = createMainMenu();

	if (messageId) {
		return await editMessage(chatId, messageId, text, keyboard);
	} else {
		return await sendMessage(chatId, text, keyboard);
	}
}

// Обработка команды /итог с красивым форматированием
export async function summaryCommand(chatId, messageId = null) {
	checkDateAndReset();

	const date = getReadableDate();
	const difference = receivedSum - expectedSum;
	const differenceText = difference === 0 ? "0" : 
		difference > 0 ? `+${difference}` : `${difference}`;
	
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

	// Создаем отдельное сообщение с итогом
	const summaryText = `${statusEmoji} <b>${statusText}</b>

📅 Дата: <i>${date}</i>
🎯 Ожидалось: <b>${expectedSum}</b>
� Получено: <b>${receivedSum}</b>
📊 Разность: <b>${differenceText}</b>

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
	lastResetDate = getTodayDate();
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
	mainMenuMessageId = null
) {
	checkDateAndReset();

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
		const helpMsg = await sendMessage(chatId, "💡 Сначала выберите режим ввода через кнопки!");
		if (helpMsg && helpMsg.result) {
			scheduleDelete(chatId, helpMsg.result.message_id, 3000);
		}
		return false;
	}

	let notification = "";
	
	if (userState.mode === 'waiting_expected') {
		expectedSum = number;
		notification = `🎯 Ожидаемая сумма: ${number}`;
		userStates.delete(chatId); // Очищаем режим
	} else if (userState.mode === 'waiting_received') {
		receivedSum = number;
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
export async function showHelp(chatId, messageId = null) {
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
• Автоматический сброс каждый день
• Красивые уведомления о прибыли/убытках`;

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
export async function setExpectedInputMode(chatId, messageId = null) {
	userStates.set(chatId, { mode: 'waiting_expected' });
	
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
export async function setReceivedInputMode(chatId, messageId = null) {
	userStates.set(chatId, { mode: 'waiting_received' });
	
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
