// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import {
	showMainInterface,
	summaryCommand,
	addToSum,
	showHelp,
	answerCallbackQuery,
	deleteMessage,
} from "@/utils/telegram";

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
				await showMainInterface(chatId);
			}
			// Все остальные текстовые сообщения обрабатываем как числа
			else {
				await addToSum(chatId, text, messageId);
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
					break;

				case "show_summary":
					await summaryCommand(chatId, messageId);
					break;

				case "reset_sum":
					// Просто обновляем главное меню (сумма обнуляется при проверке даты)
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
