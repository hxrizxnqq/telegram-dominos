// msg, chatd
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

// Переменные для хранения суммы и даты
let currentSum = 0;
let lastResetDate = getTodayDate();

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
		currentSum = 0;
		lastResetDate = today;
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
				{ text: "📊 Показать итог", callback_data: "show_summary" },
				{ text: "🔄 Сбросить", callback_data: "reset_sum" },
			],
			[{ text: "ℹ️ Справка", callback_data: "help" }],
		],
	};
}

// Главное сообщение с текущей суммой
export async function showMainInterface(chatId, messageId = null) {
	checkDateAndReset();

	const date = getReadableDate();
	const text = `� <b>Калькулятор сумм</b>
	
📅 <i>${date}</i>
� Текущая сумма: <b>${currentSum}</b>

<i>Отправьте число для добавления к сумме</i>`;

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
	const finalSum = currentSum; // Сохраняем текущую сумму

	// Создаем отдельное сообщение с итогом
	const summaryText = `📋 <b>Итоговый отчет</b>

📅 Дата: <i>${date}</i>
💰 Итоговая сумма: <b>${finalSum}</b>

✅ <i>Сумма сброшена до 0</i>`;

	// Отправляем отдельное сообщение с итогом
	const summaryMessage = await sendMessage(chatId, summaryText);

	// Закрепляем сообщение с итогом
	if (summaryMessage && summaryMessage.result) {
		await pinMessage(chatId, summaryMessage.result.message_id);

		// Планируем удаление закрепленного сообщения через 8 секунд
		scheduleDelete(chatId, summaryMessage.result.message_id, 8000);
	}

	// Сбрасываем сумму
	currentSum = 0;
	lastResetDate = getTodayDate();

	// Обновляем главное меню (показываем обнуленную сумму)
	if (messageId) {
		await showMainInterface(chatId, messageId);
	}
}

// Обработка добавления числа
export async function addToSum(
	chatId,
	text,
	userMessageId,
	mainMenuMessageId = null
) {
	checkDateAndReset();

	// Удаляем сообщение пользователя для чистоты чата
	await deleteMessage(chatId, userMessageId);

	const number = parseFloat(text.replace(",", "."));
	if (!isNaN(number)) {
		currentSum += number;

		// Обновляем главное меню с новой суммой
		if (mainMenuMessageId) {
			await showMainInterface(chatId, mainMenuMessageId);
		}

		// Отправляем уведомление которое автоматически удалится
		const notification = await sendMessage(chatId, `✅ +${number} zł`);

		// Планируем удаление уведомления через 1.5 секунды (неблокирующее)
		if (notification && notification.result) {
			scheduleDelete(chatId, notification.result.message_id, 1500);
		}

		return true;
	} else {
		// Отправляем ошибку которая автоматически удалится
		const errorMsg = await sendMessage(chatId, "❌ Неверный формат числа");

		if (errorMsg && errorMsg.result) {
			// Планируем удаление сообщения об ошибке через 2.5 секунды
			scheduleDelete(chatId, errorMsg.result.message_id, 2500);
		}

		return false;
	}
}

// Показать справку
export async function showHelp(chatId, messageId = null) {
	const text = `ℹ️ <b>Справка по боту</b>

🎯 <b>Как пользоваться:</b>
• Отправляйте числа для добавления к сумме
• Используйте кнопки для управления
• Сумма автоматически сбрасывается каждый день

🔧 <b>Команды:</b>
• <code>/start</code> - Главное меню
• Числа (100, 50.5, 25,75) - Добавление к сумме

💡 <b>Особенности:</b>
• Минималистичный интерфейс
• Автоудаление сообщений
• Компактное отображение`;

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
