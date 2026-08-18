export interface Agent {
  respond(message: string): Promise<string>;
}

/**
 * Replace this implementation with your own model, tools, memory, and context.
 */
export function createExampleAgent(): Agent {
  return {
    async respond(message) {
      if (message === "foo") {
        return "foo";
      }

      return `Agent logic is not implemented yet. Received: ${JSON.stringify(message)}`;
    },
  };
}
