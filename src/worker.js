import { SystemPrompt } from "./config.js";
import { execTool, tools } from "./tools.js";
import { setTyping, sendMessage, replyMessage, sendHTMLMessage, res, photo_handle, toJSON } from "./actions.js";

export default {
    async fetch(request, env) {

        globalThis.AI = globalThis.AI || env.AI;
        globalThis.photo_storage = env.photo_storage;
        globalThis.BOT_TOKEN = env.BOT_TOKEN;

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

                await sendMessage(env.BOT_TOKEN, chatId, "I am shy. Please message me privately.");

                return res();
            }

            if (chatId === "7752465347") {
                const command = userText.split(" ")
                if (command[0] === "/allow") {
                    await env.chat_history.put(command[1], `"allow"`);
                    await sendMessage(env.BOT_TOKEN, Number(command[1]), "My master allow me to chat with you now.");
                    await sendMessage(env.BOT_TOKEN, chatId, `You have allowed me to chat with ${command[1]}.`);
                    return res();
                }
            }

            typingInterval = setTyping(env.BOT_TOKEN, chatId, body.message.message_id);

            if (userText === "/start") {

                await env.chat_history.delete(chatId);

                await sendMessage(
                    env.BOT_TOKEN,
                    chatId,
                    `Hello ${userName},\n\nPlease tell my Master your chatID to allow me chat with you.\n\nYour chatID is ${chatId}`
                );

                return res()
            }

            let history = await env.chat_history.get(chatId, { type: "json" });

            if (!history) {

                await replyMessage(env.BOT_TOKEN, body.message.message_id, chatId, `My Master has not allowed me to chat with you yet. Please tell my Master your chatID to allow me chat with you.\n\nYour chatID is ${chatId}`);

                return res();
            }

            if (history === "allow" || userText === "/clear") {
                history = [];

                if (userText === "/clear") {

                    await env.chat_history.put(chatId, `"allow"`);

                    await sendMessage(env.BOT_TOKEN, chatId, "My memory has been cleared, but I still can chat with you.");

                    return res();
                }

            }

            if (history.length > 10) {
                const chat = {
                    messages: [
                        {
                            role: "system",
                            content: `Please briefly record, in the first person as Anoma, the highlights of your recent conversation with ${userName} and your feelings at the time. This will become part of your long-term memory.`
                        },
                        {
                            role: "user",
                            content: JSON.stringify(history)
                        }
                    ]

                }
                const response = await globalThis.AI.run('@cf/meta/llama-3-8b-instruct', chat);
                history = [
                    { role: "assistant", content: response.response },
                ]

            }

            let imageDescription = await (async () => {
                if (body.message.photo && body.message.photo.length > 0) {
                    return await photo_handle(env.BOT_TOKEN, body.message.photo[body.message.photo.length - 1].file_id);
                }
            })()

            if (isReplyToBot || imageDescription) {

                let content = {};
                if (isReplyToBot) {
                    content["reply_to_message_content"] = replied.text || "";
                }
                if (imageDescription !== "") {
                    content["System_context"] = "User sent you an image and you can see it clearly."
                    content["image"] = imageDescription;
                }
                content["text"] = userText;
                // Ensure content is always a string
                history.push({
                    role: "user",
                    content: JSON.stringify(content),
                });
            } else {
                // Ensure userText is a string
                history.push({ role: "user", content: String(userText) });
            }

            let chat = () => ({
                messages: [{
                    role: "system",
                    content: String(SystemPrompt(userName))
                }].concat(
                    history.map(msg => ({
                        role: String(msg.role),
                        content: String(msg.content)
                    }))
                ),
                tools: tools
            })

            let response = await globalThis.AI.run('@hf/nousresearch/hermes-2-pro-mistral-7b', chat());
            history.push({ role: "assistant", content: response.response });

            if (response.tool_calls) {
                
                const call_and_response = response.tool_calls[0];
                call_and_response.chatId = chatId;
                const toolResult = await execTool(call_and_response);
                const toolResultObj = { toolResult: toolResult.toolResult };
                const toolResultString = `<b>Calling tool:</b><pre>${JSON.stringify(response.tool_calls)}</pre><b>Results:</b><pre>${JSON.stringify(toolResultObj)}</pre>`;
                await sendHTMLMessage(env.BOT_TOKEN, chatId, toolResultString);
                history.push({ role: "tool", content: JSON.stringify(toolResultObj) });
                env.chat_history.put(chatId, JSON.stringify(history));
                response = await globalThis.AI.run('@hf/nousresearch/hermes-2-pro-mistral-7b', chat());
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
