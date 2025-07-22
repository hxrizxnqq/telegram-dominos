// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

import { helpCommand } from "@/utils/commands/help";
import { summaryCommandHandler } from "@/utils/commands/summary";
import { sendMessage, addToSum } from "@/utils/telegram";

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method=="POST") {
    const chatId = req.body.message.chat.id;
    const text = req.body.message.text?.trim();
    console.log("ChatID", chatId);
    console.log("text", text);
    
    if (!text) {
      res.status(200).send("OK");
      return;
    }
    
    if (text.startsWith("/start") || text.startsWith("/help") ) {
      await helpCommand(chatId)
    }
    else if (text === "/итог") {
      await summaryCommandHandler(chatId);
    }
    else {
      // Попробуем обработать как число
      const numberAdded = await addToSum(chatId, text);
      if (!numberAdded) {
        await sendMessage(chatId, "Пожалуйста, отправь число или команду /итог");
      }
    }
    res.status(200).send("OK")
  } else {
      res.setHeader('Allow', ['POST']);
      res.status(500).send('Method Not Allowed');
  }
}
