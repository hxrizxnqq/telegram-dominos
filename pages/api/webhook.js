// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import {
	showMainInterface,
	summaryCommand,
	handleNumberInput,
	showHelp,
	setExpectedInputMode,
	setReceivedInputMode,
	resetData,
	resetLastInput,
	answerCallbackQuery,
	deleteMessage,
	initializeBotProfileSystem,
} from "@/utils/telegram";

// Простое хранилище ID главного сообщения для каждого чата
const mainMenuMessages = new Map();

// Флаг для отслеживания инициализации системы профиля
let profileSystemInitialized = false;

export const config = {
	maxDuration: 60,
};

export default async function handler(req, res) {
	// Инициализируем систему автоматического обновления профиля при первом запросе
	if (!profileSystemInitialized) {
		profileSystemInitialized = true;
		initializeBotProfileSystem().catch(err => 
			console.log("Ошибка инициализации системы профиля:", err.message)
		);
	}

	if (req.method === "POST") {
		const body = req.body;

		// Обработка обычных сообщений
		if (body.message) {
			const chatId = body.message.chat.id;
			const text = body.message.text?.trim();
			const messageId = body.message.message_id;
			
			// Извлекаем информацию о пользователе
			const userInfo = {
				username: body.message.from?.username || null,
				firstName: body.message.from?.first_name || null,
				lastName: body.message.from?.last_name || null
			};

			console.log("ChatID", chatId);
			console.log("Message:", text);

			if (!text) {
				res.status(200).send("OK");
				return;
			}

			// Удаляем сообщение пользователя сразу после получения
			await deleteMessage(chatId, messageId);

			// Команда /start показывает главное меню
			if (text.startsWith("/start")) {
				const mainMenuResponse = await showMainInterface(chatId, null, userInfo);
				// Сохраняем ID главного сообщения
				if (mainMenuResponse && mainMenuResponse.result) {
					mainMenuMessages.set(chatId, mainMenuResponse.result.message_id);
				}
			}
			// Все остальные текстовые сообщения обрабатываем как числа
			else {
				const mainMenuMessageId = mainMenuMessages.get(chatId);
				await handleNumberInput(chatId, text, messageId, mainMenuMessageId, userInfo);
			}
		}

		// Обработка callback queries (нажатия на кнопки)
		else if (body.callback_query) {
			const callbackQuery = body.callback_query;
			const chatId = callbackQuery.message.chat.id;
			const messageId = callbackQuery.message.message_id;
			const data = callbackQuery.data;
			
			// Извлекаем информацию о пользователе
			const userInfo = {
				username: callbackQuery.from?.username || null,
				firstName: callbackQuery.from?.first_name || null,
				lastName: callbackQuery.from?.last_name || null
			};

			console.log("Callback data:", data);

			// Отвечаем на callback query
			await answerCallbackQuery(callbackQuery.id);

			// Обрабатываем разные действия
			switch (data) {
				case "main_menu":
					await showMainInterface(chatId, messageId, userInfo);
					// Обновляем сохраненный ID
					mainMenuMessages.set(chatId, messageId);
					break;

				case "input_expected":
					await setExpectedInputMode(chatId, messageId, userInfo);
					break;

				case "input_received":
					await setReceivedInputMode(chatId, messageId, userInfo);
					break;

				case "show_summary":
					await summaryCommand(chatId, messageId, userInfo);
					break;

				case "reset_sum":
					// Полный сброс данных
					await resetData(chatId, messageId, userInfo);
					break;

				case "reset_last":
					// Сброс только последнего ввода
					await resetLastInput(chatId, messageId, userInfo);
					break;

				case "help":
					await showHelp(chatId, messageId, userInfo);
					break;

				default:
					console.log("Unknown callback data:", data);
			}
		}

		res.status(200).send("OK");
	} else {
		res.setHeader("Allow", ["POST"]);
		res.status(405).send("Method Not Allowed");
	}
}
