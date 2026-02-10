import { create, all } from "mathjs";

export const execTool = async (tool_call) => {
    switch (tool_call.name) {
        case "date": {
            const timeZone = tool_call?.arguments?.timeZone || "UTC";

            return new Intl.DateTimeFormat("en-US", {
                timeZone,
                dateStyle: "full",
                timeStyle: "long",
            }).format(new Date());
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

            return response.response;
        }

        case "math_calculator": {
            const expression = tool_call?.arguments?.expression;
            if (!expression) return "Error: Missing expression argument for math_calculator tool.";

            try {
                return create(all,{number: 'BigNumber',precision: 64}).evaluate(expression)
            } catch (error) {
                return `Error: Invalid mathematical expression. Details: ${error.message}`;
            }
        }

        default:
            return null;
    }
};
