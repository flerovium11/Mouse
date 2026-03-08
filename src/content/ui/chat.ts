export class ChatUI {
  private chat: HTMLDivElement | null = null;
  private messageContainer: HTMLDivElement | null = null;
  private chatInput: HTMLInputElement | null = null;
  private activeInput: HTMLElement | null = null;
  private mode: "generate" | "ask" = "generate";
  private messageHistory: { sender: "user" | "assistant"; text: string }[] = [];

  attach(input: HTMLElement | null) {
    this.detach();
    this.activeInput = input;
    this.chat = this.buildChat();
    this.messageContainer = this.chat.querySelector(
      ".chat-messages",
    ) as HTMLDivElement;
    document.body.appendChild(this.chat);
    this.syncPosition();
    this.chatInput?.focus();
  }

  detach() {
    this.chat?.remove();
    this.chat = null;
    this.messageContainer = null;
    this.activeInput = null;
  }

  private buildChat(): HTMLDivElement {
    const chat = document.createElement("div");
    chat.className = "mouse-chat";
    chat.innerHTML = `
        <div class="chat-header">
            <div class="mode-toggle" role="group" aria-label="Mode">
            <button class="mode-btn active" data-mode="generate" aria-pressed="true">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
            </button>
            <button class="mode-btn" data-mode="ask" aria-pressed="false">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                </svg>
            </button>
            </div>
            <input type="text" name="mouse-chat-input" placeholder="Type a message..." />
            <div class="actions">
            <button class="send-button" disabled>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                </svg>
            </button>
            <button class="close-button">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
            </button>
            </div>
        </div>
        <div class="chat-messages" role="log" aria-live="polite"></div>
    `;

    chat
      .querySelector(".close-button")
      ?.addEventListener("click", () => this.detach());

    this.chatInput = chat.querySelector("input");
    const sendButton = chat.querySelector(".send-button") as HTMLButtonElement;
    this.chatInput?.addEventListener("input", () => {
      sendButton.disabled = !this.chatInput?.value.trim();
    });
    this.chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !sendButton.disabled) {
        e.preventDefault();
        this.onSend(this.chatInput?.value ?? "");
      }
    });
    sendButton.addEventListener("click", () => {
      this.onSend(this.chatInput?.value ?? "");
    });

    const modeButtons = chat.querySelectorAll(".mode-btn");
    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        modeButtons.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        this.mode = btn.getAttribute("data-mode") as "generate" | "ask";
        btn.setAttribute("aria-pressed", "true");
      });
    });

    return chat;
  }

  private onSend(message: string) {
    if (!message.trim()) return;
    this.chatInput!.value = "";
    this.addMessage(message, "user");
  }

  private addMessage(text: string, sender: "user" | "assistant") {
    if (!this.chat || !this.messageContainer) return;
    this.messageHistory.push({ sender, text });
    const messageElem = document.createElement("div");
    messageElem.className = `chat-message ${sender}`;
    messageElem.textContent = text;
    this.messageContainer.appendChild(messageElem);
    this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
  }

  syncPosition() {
    if (!this.chat) return;
    if (!this.activeInput) {
      this.chat.style.position = "fixed";
      this.chat.style.bottom = "20px";
      this.chat.style.left = "50%";
      this.chat.style.transform = "translateX(-50%)";
      this.chat.classList.add("floating");
      return;
    }

    this.chat.style.position = "absolute";
    const rect = this.activeInput.getBoundingClientRect();
    this.chat.style.top = `${rect.bottom + window.scrollY + 8}px`;
    this.chat.style.left = `${rect.left + window.scrollX}px`;
    this.chat.classList.remove("floating");
  }
}
