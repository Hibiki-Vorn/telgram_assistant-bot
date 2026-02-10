import { SystemPrompt } from "./config.js";
import { execTool } from "./tools.js";
import { setTyping, sendMessage, replyMessage, sendHTMLMessage, res, photo_handle, toJSON } from "./actions.js";

export default {
    async fetch(request, env) {

        globalThis.AI = globalThis.AI || env.AI;

        const body = await request.json();

        console.log(body);

        body.message = body.message || body.edited_message;

        if (!body.message || !body.message.chat) {
            return res();
        }

        const chatId = body.message.chat.id.toString();
        const userText = body.message.text || body.message.caption || "";
        const userName = `${body.message.from.first_name || ""} ${body.message.from.last_name || ""}`.trim() || "User";
        const replied = body.message.reply_to_message;
        const isReplyToBot =
            replied &&
            replied.from &&
            replied.from.is_bot;

        let typingInterval = 0

        try {

            if (body.message.chat.type !== "private") {

                await sendMessage(env.BOT_TOKEN, chatId, "Please message me privately to chat with me.");

                return res();
            }

            typingInterval = setTyping(env.BOT_TOKEN, chatId, body.message.message_id);

            if (userText === "/start") {

                await sendMessage(
                    env.BOT_TOKEN,
                    chatId,
                    `Hello ${userName},\n\nPlease tell my Master your chatID to allow me chat with you.\n\nYour chatID is ${chatId}`
                );

                return res()
            }

            let history = await env.chat_history.get(chatId, { type: "json" });

            if (!history) {

                await replyMessage(env.BOT_TOKEN, body.message.message_id, chatId, `Your chat history status is "not allow". Please contact my Master to allow me chat with you.`);

                return res();
            }

            if (history === "allow" || userText === "/new") {
                history = [
                    { role: 'system', content: SystemPrompt(userName) },
                ];

                if (userText === "/new") {

                    await env.chat_history.put(chatId, `"allow"`);

                    await sendMessage(env.BOT_TOKEN, chatId, "New conversation started.");

                    return res();
                }

            }

            if (history.length > 10) {
                const chat = {
                    messages: [
                        {
                            role: "system",
                            content: "Summarize the following conversation briefly, preserving facts, names, and user intent."
                        },
                        {
                            role: "user",
                            content: JSON.stringify(history)
                        }
                    ]

                }
                const response = await globalThis.AI.run('@cf/meta/llama-3-8b-instruct', chat);
                history = [
                    { role: 'system', content: SystemPrompt(userName) },
                    { role: "assistant", content: response.response },
                ]

            }

            let imageDescription = await (async () => {
                if (body.message.photo && body.message.photo.length > 0) {
                    return await photo_handle(env.BOT_TOKEN,body.message.photo[body.message.photo.length - 1].file_id);
                }
            })()

            if (isReplyToBot || imageDescription) {

                let content = ""

                if (isReplyToBot) {
                    content += `The user is replying to your previous message:\n"${replied.text || ""}"\n\n`
                }

                if (imageDescription !== "") {
                    content += `The user sent an image and you can see it clearly. The following is its description:\n${imageDescription}\n\n`;
                }

                content += `User says:\n"${userText}"`

                history.push({
                    role: "user",
                    content
                });
            } else {
                history.push({ role: "user", content: userText });
            }

            let chat = {
                messages: history,
            };

            let response = await globalThis.AI.run('@cf/meta/llama-3-8b-instruct', chat);
            history.push({ role: "assistant", content: response.response });

            const tool_call = toJSON(response.response)?.tool_call;
            if (tool_call && typeof tool_call.name === "string") {
                const toolResult = await execTool(tool_call);
                const toolResultObj = { toolResult };
                const toolResultString = `<b>Calling tool:</b><pre>${JSON.stringify(tool_call)}</pre><b>Results:</b><pre>${JSON.stringify(toolResultObj)}</pre>`;
                await sendHTMLMessage(env.BOT_TOKEN, chatId, toolResultString);
                history.push({ role: "user", content: JSON.stringify(toolResultObj) });
                chat = {
                    messages: history,
                };
                response = await globalThis.AI.run('@cf/meta/llama-3-8b-instruct', chat);
                history.push({ role: "assistant", content: response.response });
            }

            await env.chat_history.put(chatId, JSON.stringify(history));
            await replyMessage(env.BOT_TOKEN, body.message.message_id, chatId, response.response);
            return res();

        } catch (e) {

            await replyMessage(env.BOT_TOKEN, body.message.message_id, chatId, `Sorry, there is an error in my brain.\n${e.message}`);
            return res();

        } finally {
            clearInterval(typingInterval);
        }
    }
};
