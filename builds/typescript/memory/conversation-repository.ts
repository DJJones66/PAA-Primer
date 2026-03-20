import type { ConversationDetail, ConversationMessage, ConversationRecord } from "../contracts.js";

export type ConversationListResult = {
  conversations: ConversationRecord[];
  total: number;
  limit: number;
  offset: number;
};

export interface ConversationRepository {
  createConversation(id: string, initialMessage: ConversationMessage): string;
  appendMessage(conversationId: string, message: ConversationMessage): void;
  listConversations(limit?: number, offset?: number): ConversationListResult;
  getConversation(conversationId: string): ConversationDetail | null;
}
