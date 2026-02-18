import { create, all, im } from "mathjs";
import { sendPhoto } from "./actions.js";
import cryptoJs from "crypto-js";

export const tools = [
    {
        name: "date",
        description: "Get the current date and time. Optional arguments: timeZone (e.g., 'UTC', 'America/New_York').",
        parameters: {
            type: "object",
            properties: {
                timeZone: {
                    type: "string",
                    description: "The IANA time zone identifier (e.g., 'UTC', 'America/New_York'). If not provided, defaults to UTC."
                }
            },
            required: ["timeZone"]
        }
    },
    {
        name: "web_search",
        description: "Search the web for information related to a query. Required arguments: query (the search query).",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query to find relevant information on the web."
                }
            },
            required: ["query"]
        }
    },
    {
        name: "math_calculator",
        description: "Evaluate a mathematical expression. Required arguments: expression (the mathematical expression to evaluate).",
        parameters: {
            type: "object",
            properties: {
                expression: {
                    type: "string",
                    description: "The mathematical expression to evaluate (e.g., '2 + 2 * (3 - 1)')."
                }
            },
            required: ["expression"]
        }
    },
    {
        name: "generate_image",
        description: "Generate an image based on a text prompt. Required arguments: prompt (the description of the image to generate).",
        parameters: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description: "A detailed description of the image to generate (e.g., 'A serene landscape with mountains and a river at sunset')."
                }
            },
            required: ["prompt"]
        }
    }
]

export const execTool = async (tool_call) => {
    switch (tool_call.name) {
        case "date": {
            const timeZone = tool_call?.arguments?.timeZone || "UTC";

            return {
                toolResult: new Intl.DateTimeFormat("en-US", {
                    timeZone,
                    dateStyle: "full",
                    timeStyle: "long",
                }).format(new Date())
            }
        }

        case "web_search": {
            const query = tool_call?.arguments?.query;
            if (!query) return "Error: Missing query argument for web_search tool.";

            let a = [];
            (await (await fetch(
                `https://search.hieronymus.uk/search?q=${encodeURIComponent(query)}&format=json`
            )).json()).results.map(x => a.push({ title: x.title, content: x.content }))

            const response = await globalThis.AI.run('@cf/meta/llama-3-8b-instruct', {
                messages: [
                    {
                        role: "system",
                        content: "Summarize the following search results briefly, preserving facts, names, and user intent."
                    },
                    {
                        role: "user",
                        content: JSON.stringify(a)
                    }
                ]
            })

            return {
                toolResult: response.response
            };
        }

        case "math_calculator": {
            const expression = tool_call?.arguments?.expression;
            if (!expression) return "Error: Missing expression argument for math_calculator tool.";

            try {
                return {
                    toolResult: create(all, { number: 'BigNumber', precision: 64 }).evaluate(expression)
                }
            } catch (error) {
                return {
                    toolResult: `Error: Invalid mathematical expression. Details: ${error.message}`
                }
            }
        }

        case "generate_image": {
            const prompt = tool_call?.arguments?.prompt;
            if (!prompt) return {
                toolResult: "Error: Missing prompt argument for generate_image tool."
            }

            const input = { prompt };
            let imageResp = await globalThis.AI.run(
                "@cf/bytedance/stable-diffusion-xl-lightning",
                input
            );

            // If the response is a ReadableStream, convert it to ArrayBuffer
            async function streamToArrayBuffer(stream) {
                const reader = stream.getReader();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                let length = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                let result = new Uint8Array(length);
                let offset = 0;
                for (let chunk of chunks) {
                    result.set(chunk, offset);
                    offset += chunk.length;
                }
                return result.buffer;
            }

            // Convert ArrayBuffer/Uint8Array to base64
            function arrayBufferToBase64(buffer) {
                let binary = '';
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return btoa(binary);
            }

            // Handle different response types
            let arrayBuffer;
            if (imageResp instanceof ReadableStream) {
                arrayBuffer = await streamToArrayBuffer(imageResp);
            } else if (imageResp instanceof ArrayBuffer) {
                arrayBuffer = imageResp;
            } else if (imageResp instanceof Uint8Array) {
                arrayBuffer = imageResp.buffer;
            } else {
                // Unknown type, try to stringify for debugging
                return `Error: Unexpected image response type: ${Object.prototype.toString.call(imageResp)}`;
            }

            const base64Image = arrayBufferToBase64(arrayBuffer);

            const imageName = cryptoJs.SHA256(base64Image).toString();
            
            globalThis.photo_storage.put(imageName , base64Image);

            setTimeout(() => sendPhoto(
                globalThis.BOT_TOKEN,
                tool_call.chatId,
                `https://tg-photos.3ns76ymur.workers.dev/${imageName}`,
                prompt
            ), 10)
            

            return {
                toolResult: "Image generated and sent to user.",
                hiddenResult: `<img src="data:image/jpeg;base64,${base64Image}"/>`
            };
        }

        default:
            return null;
    }
};
