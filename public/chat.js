/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

// Chat state
let chatHistory = [
  {
    role: "assistant",
    content:
      "Hello! I'm an LLM chat app powered by Cloudflare Workers AI. How can I help you today?",
  },
];
let isProcessing = false;

// WebSocket setup
let socket;
let socketReady = false;

function connectWebSocket() {
  socket = new WebSocket(
    (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws"
  );

  socket.addEventListener("open", () => {
    socketReady = true;
    console.log("WebSocket connected");
  });

  socket.addEventListener("close", () => {
    socketReady = false;
    console.log("WebSocket disconnected, retrying in 2s...");
    setTimeout(connectWebSocket, 2000);
  });

  socket.addEventListener("message", (event) => {
    // Expecting JSON: { response: "..." }
    try {
      const data = JSON.parse(event.data);
      if (data.response) {
        addMessageToChat("assistant", data.response);
        chatHistory.push({ role: "assistant", content: data.response });
      }
    } catch (e) {
      console.error("WebSocket message error:", e);
    }
    typingIndicator.classList.remove("visible");
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
  });
}

connectWebSocket();

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
  const message = userInput.value.trim();
  if (message === "" || isProcessing || !socketReady) return;
  isProcessing = true;
  userInput.disabled = true;
  sendButton.disabled = true;
  addMessageToChat("user", message);
  userInput.value = "";
  userInput.style.height = "auto";
  typingIndicator.classList.add("visible");
  chatHistory.push({ role: "user", content: message });
  try {
    // Send message via WebSocket
    socket.send(
      JSON.stringify({ messages: chatHistory })
    );
  } catch (error) {
    console.error("WebSocket send error:", error);
    addMessageToChat(
      "assistant",
      "Sorry, there was an error processing your request."
    );
    typingIndicator.classList.remove("visible");
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
  }
}

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}-message`;
  messageEl.innerHTML = `<p>${content}</p>`;
  chatMessages.appendChild(messageEl);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
