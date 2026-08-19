/** A single message in a chat session tab. */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
};

/** A slash-command available in a chat session. */
export type AvailableCommand = {
  name: string;
  description: string;
};

/** An AI model selectable in a chat session. */
export type AvailableModel = {
  id: string;
  name: string;
};
