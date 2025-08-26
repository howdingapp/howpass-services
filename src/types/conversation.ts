export interface AIRule {
  id: string;
  type: 'bilan' | 'activity';
  name: string;
  description: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityData {
  id: string;
  title: string;
  description?: string;
  type?: string;
  category?: string;
}

export interface ConversationContext {
  id: string;
  userId: string;
  type: 'bilan' | 'activity';
  startTime: string;
  lastActivity: string;
  messages: ChatMessage[];
  metadata: Record<string, any>;
  status: 'active' | 'completed' | 'expired';
  aiRules?: AIRule[];
  activityData?: ActivityData;
}

export interface ChatMessage {
  id: string;
  content: string;
  type: 'user' | 'bot';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface StartConversationRequest {
  userId: string;
  type: 'bilan' | 'activity';
  initialContext?: {
    aiRules?: AIRule[];
    activityData?: ActivityData;
    [key: string]: any;
  };
}

export interface StartConversationResponse {
  success: boolean;
  conversationId: string;
  expiresIn: number; // secondes
  context?: ConversationContext;
  error?: string;
}

export interface AddMessageRequest {
  content: string;
  type: 'user' | 'bot';
  metadata?: Record<string, any>;
}

export interface AddMessageResponse {
  success: boolean;
  messageId: string;
  context?: ConversationContext;
  error?: string;
}

export interface GetContextResponse {
  success: boolean;
  context?: ConversationContext;
  error?: string;
}

export interface GenerateSummaryResponse {
  success: boolean;
  message: string;
  jobId: string;
  estimatedTime: string;
  queuePosition?: number;
  cleanupScheduled: string;
  error?: string;
}

export interface ConversationSummary {
  conversationId: string;
  userId: string;
  type: 'bilan' | 'activity';
  startTime: string;
  endTime: string;
  duration: number; // millisecondes
  messageCount: number;
  summary: string;
}

export interface ConversationStats {
  activeConversations: number;
  totalConversations: number;
  memoryUsage: number; // bytes
  timestamp: string;
}
