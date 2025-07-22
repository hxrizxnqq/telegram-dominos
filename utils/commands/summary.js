import { summaryCommand } from "../telegram";

export async function summaryCommandHandler(chatId) {
    await summaryCommand(chatId);
}
