/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { Env, ChatMessage } from "./types";

// Model ID for Workers AI model
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Default system prompt
const SYSTEM_PROMPT =
  "You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
  /**
   * Main request handler for the Worker
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket endpoint
    if (url.pathname === "/ws") {
      return handleWebSocket(request, env);
    }

    // Handle static assets (frontend)
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // API Routes
    if (url.pathname === "/api/chat") {
      // Handle POST requests for chat
      if (request.method === "POST") {
        return handleChatRequest(request, env);
      }

      // Method not allowed for other request types
      return new Response("Method not allowed", { status: 405 });
    }

    // Handle 404 for unmatched routes
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Parse JSON request body
    const { messages = [] } = (await request.json()) as {
      messages: ChatMessage[];
    };

    // Add system prompt if not present
    if (!messages.some((msg) => msg.role === "system")) {
      messages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    const response = await env.AI.run(
      MODEL_ID,
      {
        messages,
        max_tokens: 1024,
      },
      {
        returnRawResponse: true,
        // Uncomment to use AI Gateway
        // gateway: {
        //   id: "YOUR_GATEWAY_ID", // Replace with your AI Gateway ID
        //   skipCache: false,      // Set to true to bypass cache
        //   cacheTtl: 3600,        // Cache time-to-live in seconds
        // },
      },
    );

    // Return streaming response
    return response;
  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

// Add WebSocket upgrade handler
async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  const { 0: client, 1: server } = Object.values(new WebSocketPair());

  server.accept();

  server.addEventListener("message", async (event) => {
    try {
      let dataString = event.data;
      if (dataString instanceof ArrayBuffer) {
        dataString = new TextDecoder().decode(dataString);
      }
      const { messages = [] } = JSON.parse(dataString);
      // Add system prompt if not present
      if (!messages.some((msg: any) => msg.role === "system")) {
        messages.unshift({ role: "system", content: SYSTEM_PROMPT });
      }
      // Call the LLM (streaming not supported over WS, so send full response)
      const aiResponse = await env.AI.run(
        MODEL_ID,
        {
          messages,
          max_tokens: 1024,
        }
      );
      // aiResponse may have different shapes; try to extract the text
      let text = "[No response]";
      if (typeof aiResponse === "string") {
        text = aiResponse;
      } else if (aiResponse && typeof aiResponse === "object") {
        if ("response" in aiResponse && typeof aiResponse.response === "string") {
          text = aiResponse.response;
        } else if ("result" in aiResponse && typeof aiResponse.result === "string") {
          text = aiResponse.result;
        }
      }
      server.send(JSON.stringify({ response: text }));
    } catch (err) {
      server.send(JSON.stringify({ response: "Sorry, there was an error processing your request." }));
    }
  });

  server.addEventListener("close", () => {
    // Clean up if needed
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
