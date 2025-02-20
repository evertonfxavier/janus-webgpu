export interface Message {
  // role: "assistant" | "user";
  role: string;
  content: string;
  image?: string | null;
}

export interface ChatProps {
  messages: Message[];
}
