import OpenAI from "openai";
import { executeTool, toolDefinitions, toOpenAITools } from "./tools.js";
import { buildDefaultSystemPrompt, buildUserContextReminder } from "./systemPrompt.js";

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
  respond(
    message: string,
    onEvent?: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage>;
}

const request = async (
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  signal?: AbortSignal,
) => {
  const apiKey = process.env.API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "缺少 API_KEY，请在启动 yl 的终端中设置内部模型网关的 API Key。",
    );
  }

  const response = await fetch(
    "https://antchat.alipay.com/v1/chat/completions",
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "DeepSeek-V4.1-Flash-1017",
        messages,
        tools: toOpenAITools(toolDefinitions),
      }),
    },
  );
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(`模型网关返回非 JSON 响应（HTTP ${response.status}）。`);
  }

  const errorMessage = data?.error?.message ?? data?.message;
  const detail =
    typeof errorMessage === "string"
      ? `：${errorMessage.replaceAll(apiKey, "[REDACTED]").slice(0, 500)}`
      : "";
  if (!response.ok) {
    throw new Error(`模型请求失败（HTTP ${response.status}）${detail}`);
  }

  const message = data?.choices?.[0]?.message;
  if (
    !message ||
    message.role !== "assistant" ||
    !(typeof message.content === "string" || message.content === null)
  ) {
    throw new Error(
      `模型网关响应缺少有效的 choices[0].message（HTTP ${response.status}）${detail}`,
    );
  }
  return message as OpenAI.Chat.Completions.ChatCompletionMessage;
};

export function createExampleAgent(): Agent {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildDefaultSystemPrompt(),
    },
  ];
  return {
    async respond(message, onEvent, signal) {
      if (message === "foo") {
        return {
          role: "assistant",
          content: "foo",
          refusal: null,
        };
      }

      // 此时只有一条 system 消息，说明还没添加过用户消息。
      const isFirstMessage = messages.length === 1;

      const content = isFirstMessage
        ? `${buildUserContextReminder()}\n\n${message}`
        : message;

      messages.push({ role: "user", content });
      while (true) {
        signal?.throwIfAborted();
        const response = await request(messages, signal);
        // 必须把包含 tool_calls 的 assistant 消息放回历史
        messages.push({
          role: "assistant",
          content: response.content,
          tool_calls: response.tool_calls,
        });
        if (response.tool_calls) {
          for (const toolCall of response.tool_calls) {
            if (toolCall.type !== "function") {
              throw new Error(`不支持的工具调用类型：${toolCall.type}`);
            }
            const name = toolCall.function.name;
            const args = toolCall.function.arguments;

            onEvent?.({
              type: "tool_call",
              id: toolCall.id,
              name,
              arguments: args,
            });
            let toolResponse: string;
            try {
              toolResponse = await executeTool(name, args);
            } catch (error) {
              const detail =
                error instanceof Error ? error.message : String(error);
              toolResponse = `Tool ${name} 调用失败: ${detail}`;
            }
            onEvent?.({
              type: "tool_result",
              id: toolCall.id,
              name,
              result: toolResponse,
            });
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResponse,
            });
          }
        } else {
          return response;
        }
      }
    },
  };
}
