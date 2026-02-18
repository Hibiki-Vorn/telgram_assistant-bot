import { convert } from "telegram-markdown-v2";

export const res = () => new Response("OK", { status: 200 });

export const setTyping = (BOT_TOKEN, chatId, message_id) => setInterval(
    () => fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                reply_to_message_id: message_id,
                chat_id: chatId,
                action: "typing"
            })
        }
    ),
    4000
);

export const sendMessage = async (BOT_TOKEN, chatId, text) => await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: convert(text),
            parse_mode: "markdownV2"
        })
    }
);

export const replyMessage = async (BOT_TOKEN, reply_to_message_id = null, chatId, text) => await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            reply_to_message_id,
            chat_id: chatId,
            text: convert(text),
            parse_mode: "markdownV2"
        })
    }
);

export const sendPhoto = async (BOT_TOKEN, chatId, photo, caption) => await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            photo,
            caption: convert(caption),
            parse_mode: "markdownV2"
        })
    }
)

export const sendHTMLMessage = async (BOT_TOKEN, chatId, html) => await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: html,
            parse_mode: "HTML"
        })
    }
);

export const photo_handle = async (BOT_TOKEN, photo_file_id) => {
    const getFileResp = await (await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${photo_file_id}`
    )).json()

    if (getFileResp.ok) {
        const filePath = getFileResp.result.file_path;
        const imageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        const imageResponse = await fetch(imageUrl);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const input = {
            image: [...uint8Array],
            prompt: "Generate a caption for this image in detail.",
            max_tokens: 512
        };

        const imageResp = await globalThis.AI.run(
            "@cf/unum/uform-gen2-qwen-500m",
            input
        );

        return imageResp.description || "";
    }
}

export const toJSON = (str) => {
    if (typeof str !== "string") return null;
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}
