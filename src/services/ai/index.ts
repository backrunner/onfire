/**
 * AI Service Entry Point
 */

export { getAIConfig, getAIProvider, clearConfigCache } from "./config";
export { prescreenTicket, batchPrescreenTickets, type PrescreeningResult } from "./prescreening";
export { generatePrereply, type PrereplyOptions, type PrereplyResult } from "./prereply";
export { chatWithAgent, getChatHistory, clearChatSession, type AgentChatOptions, type AgentChatResult } from "./agent";
export { generateEmbedding, embedKnowledge, embedTicket, searchSimilar, batchEmbedKnowledge } from "./embedding";
export { createProvider, type AIProvider, type AIMessage, type ProviderConfig } from "./providers";
