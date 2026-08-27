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

// Either a callback button or a link button (the p4-03 lock announcement's
// "🖨 Öppna i appen" points at the Cook Mode deep-link base).
export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

// p4-10: one photo in the menu card's album — an external imageUrl (or the
// already-absolute placeholder), which Telegram fetches itself.
export interface MediaGroupPhoto {
  url: string;
  caption?: string;
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

  // `parseMode` is opt-in (undefined = today's plain-text behavior for every
  // existing caller); the p4-10 menu message is the first HTML sender, since
  // Telegram never auto-detects markup.
  sendMessage(
    chatId: number,
    text: string,
    buttons?: InlineButton[][],
    parseMode?: "HTML",
  ): Promise<unknown> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  }

  // p4-10: one dish photo, for the (batch has exactly one distinct dish)
  // case — Telegram's sendMediaGroup rejects anything under 2 items, so
  // the caller (bot/menu.ts) uses this instead of a 1-item album.
  sendPhoto(chatId: number, url: string, caption?: string): Promise<unknown> {
    return this.call("sendPhoto", {
      chat_id: chatId,
      photo: url,
      ...(caption ? { caption } : {}),
    });
  }

  // p4-10: the menu card's photo album — Telegram requires 2..10 items
  // (the caller must not call this with 0 or 1; use sendPhoto for 1, skip
  // for 0). src/lib/menuCard.ts's `buildMenuCard` already caps the upper
  // end at 10.
  sendMediaGroup(chatId: number, photos: MediaGroupPhoto[]): Promise<unknown> {
    return this.call("sendMediaGroup", {
      chat_id: chatId,
      media: photos.map((p) => ({
        type: "photo",
        media: p.url,
        ...(p.caption ? { caption: p.caption } : {}),
      })),
    });
  }

  // p4-10: the menu PDF is a local Buffer (Playwright's render output), not
  // a URL — the one outbound call that needs a multipart body instead of
  // `call()`'s JSON, so it's implemented separately with the same
  // log-don't-throw failure shape.
  async sendDocument(
    chatId: number,
    filename: string,
    content: Buffer,
    caption?: string,
  ): Promise<unknown> {
    try {
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) form.append("caption", caption);
      form.append(
        "document",
        new Blob([new Uint8Array(content)], { type: "application/pdf" }),
        filename,
      );
      const res = await fetch(`${this.base}/sendDocument`, { method: "POST", body: form });
      const body = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
      if (!body.ok) console.error(`telegram sendDocument failed: ${body.description}`);
      return body.result;
    } catch (err) {
      console.error("telegram sendDocument error:", err);
      return undefined;
    }
  }

  react(chatId: number, messageId: number, emoji: string): Promise<unknown> {
    return this.call("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji }],
    });
  }

  // Editing the text and replacing the keyboard are SEPARATE intents:
  // `buttons` present (including `[]`, which clears) rewrites the keyboard,
  // `buttons` omitted leaves whatever the message already shows. p4-03 first
  // sent `inline_keyboard: []` unconditionally, which turned every text-only
  // edit into a silent keyboard wipe — see that plan's live-20260827 evidence.
  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    buttons?: InlineButton[][],
  ): Promise<unknown> {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  }

  answerCallbackQuery(callbackQueryId: string): Promise<unknown> {
    return this.call("answerCallbackQuery", { callback_query_id: callbackQueryId });
  }
}
