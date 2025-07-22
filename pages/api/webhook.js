// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import {
	showMainInterface,
	summaryCommand,
	handleNumberInput,
	showHelp,
	setExpectedInputMode,
	setReceivedInputMode,
	answerCallbackQuery,
	deleteMessage,
} from "@/utils/telegram";

// Простое хранилище ID главного сообщения для каждого чата
const mainMenuMessages = new Map();

export const config = {
	maxDuration: 60,
};

export default async function handler(req, res) {
	if (req.method === "POST") {
		const body = req.body;

		// Обработка обычных сообщений
		if (body.message) {
			const chatId = body.message.chat.id;
			const text = body.message.text?.trim();
			const messageId = body.message.message_id;

			console.log("ChatID", chatId);
			console.log("Message:", text);

			if (!text) {
				res.status(200).send("OK");
				return;
			}

			// Команда /start показывает главное меню
			if (text.startsWith("/start")) {
				const mainMenuResponse = await showMainInterface(chatId);
				// Сохраняем ID главного сообщения
				if (mainMenuResponse && mainMenuResponse.result) {
					mainMenuMessages.set(chatId, mainMenuResponse.result.message_id);
				}
			}
			// Все остальные текстовые сообщения обрабатываем как числа
			else {
				const mainMenuMessageId = mainMenuMessages.get(chatId);
				await handleNumberInput(chatId, text, messageId, mainMenuMessageId);
			}
		}

		// Обработка callback queries (нажатия на кнопки)
		else if (body.callback_query) {
			const callbackQuery = body.callback_query;
			const chatId = callbackQuery.message.chat.id;
			const messageId = callbackQuery.message.message_id;
			const data = callbackQuery.data;

			console.log("Callback data:", data);

			// Отвечаем на callback query
			await answerCallbackQuery(callbackQuery.id);

			// Обрабатываем разные действия
			switch (data) {
				case "main_menu":
					await showMainInterface(chatId, messageId);
					// Обновляем сохраненный ID
					mainMenuMessages.set(chatId, messageId);
					break;

				case "input_expected":
					await setExpectedInputMode(chatId, messageId);
					break;

				case "input_received":
					await setReceivedInputMode(chatId, messageId);
					break;

				case "show_summary":
					await summaryCommand(chatId, messageId);
					break;

				case "reset_sum":
					// Просто обновляем главное меню (суммы обнуляются при проверке даты)
					await showMainInterface(chatId, messageId);
					break;

				case "help":
					await showHelp(chatId, messageId);
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
