// Thin outbound-only Telegram client for the M1 consumer. Raw fetch, no
// framework: the consumer never receives webhooks (the capture edge function
// owns ingress), so all we need is send/react/edit/answer. Failures are
// logged, not thrown — a failed reaction must never poison the queue row.

// Telegram restricts reactions to a fixed emoji set (no 🥛, no 🍋 — the
// Script 1 fantasy meets the API). The confirmations we use, all allowed:
export const REACTIONS = {
  added: "👍",
  checked: "👌",
  removed: "🫡",
  love: "❤",
} as const;

export interface InlineButton {
  text: string;
  callback_data: string;
}

export class TelegramApi {
  private base: string;

  constructor(botToken: string) {
    this.base = `https://api.telegram.org/bot${botToken}`;
  }

  private async call(method: string, payload: Record<string, unknown>): Promise<unknown> {
    try {
      const res = await fetch(`${this.base}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
      if (!body.ok) console.error(`telegram ${method} failed: ${body.description}`);
      return body.result;
    } catch (err) {
      console.error(`telegram ${method} error:`, err);
      return undefined;
    }
  }

  sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<unknown> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  }

  react(chatId: number, messageId: number, emoji: string): Promise<unknown> {
    return this.call("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji }],
    });
  }

  editMessageText(chatId: number, messageId: number, text: string): Promise<unknown> {
    return this.call("editMessageText", { chat_id: chatId, message_id: messageId, text });
  }

  answerCallbackQuery(callbackQueryId: string): Promise<unknown> {
    return this.call("answerCallbackQuery", { callback_query_id: callbackQueryId });
  }
}
