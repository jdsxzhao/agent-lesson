import OpenAI from "openai";
import { executeTool, toolDefinitions, toOpenAITools } from "./tools.js";

export type AgentEvent =
  | {
    type: "tool_call";
    id: string;
    name: string;
    arguments: string;
  }
  | {
    type: "tool_result";
    id: string;
    name: string;
    result: string;
  };

export type AgentEventHandler = (event: AgentEvent) => void;

export interface Agent {
  respond(message: string, onEvent?: AgentEventHandler,): Promise<OpenAI.Chat.Completions.ChatCompletionMessage>;
}

const API_KEY = process.env.API_KEY;
const request = async (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => {
  const response = await fetch("https://antchat.alipay.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: "DeepSeek-V4-Pro", messages, tools: toOpenAITools(toolDefinitions) }),
  });
  const data = await response.json();
  // console.log('data', JSON.stringify(data, null, 2));
  return data.choices?.[0]?.message;
};

export function createExampleAgent(): Agent {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  return {
    async respond(message, onEvent) {
      if (message === "foo") {
        return {
          role: "assistant",
          content: "foo",
          refusal: null,
        };
      }

      messages.push({ role: "user", content: message });
      while (true) {
        const response = await request(messages);

        // 必须把包含 tool_calls 的 assistant 消息放回历史
        messages.push({
          role: "assistant",
          content: response.content,
          tool_calls: response.tool_calls,
        });
        if (response.tool_calls) {
          for (const toolCall of response.tool_calls) {
            const name = toolCall.function.name;
            const args = toolCall.function.arguments;

            onEvent?.({
              type: "tool_call",
              id: toolCall.id,
              name,
              arguments: args,
            });
            const toolResponse = await executeTool(name, args);
            onEvent?.({
              type: "tool_result",
              id: toolCall.id,
              name,
              result: toolResponse,
            });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResponse });
          }
        } else {
          return response;
        }
      }
    },
  };
}
