import { ConversationService } from './ConversationService';
import { SupabaseService } from './SupabaseService';
import { ConversationContext, StartConversationRequest, AddMessageRequest, AIRule } from '../types/conversation';
import OpenAI from 'openai';

export class ChatBotService {
  private conversationService: ConversationService;
  private supabaseService: SupabaseService;
  private openai: OpenAI;
  private AI_MODEL = "gpt-3.5-turbo";

  constructor() {
    this.conversationService = new ConversationService();
    this.supabaseService = new SupabaseService();
    
    // Initialiser OpenAI
    this.openai = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'],
    });
  }

  /**
   * Démarrer une nouvelle conversation avec l'IA
   */
  async startConversation(request: StartConversationRequest): Promise<{
    success: boolean;
    conversationId: string;
    expiresIn: number;
    context?: ConversationContext;
    error?: string;
  }> {
    try {
      // Démarrer la conversation via le service local
      const result = await this.conversationService.startConversation({
        userId: request.userId,
        type: request.type,
        initialContext: request.initialContext || {}
      });

      // Générer automatiquement une première réponse IA basée sur le contexte
      try {
        const firstResponse = await this.generateFirstResponse(result.context);
        if (firstResponse) {
          // Ajouter le message à la conversation Redis
          await this.conversationService.addMessage(
            result.conversationId,
            {
              content: firstResponse,
              type: 'bot',
                             metadata: { source: 'ai', model: this.AI_MODEL, type: 'first_response' }
            }
          );
          
          // Enregistrer la réponse IA dans Supabase
          await this.supabaseService.createAIResponse({
            conversation_id: result.conversationId,
            user_id: request.userId,
            response_text: firstResponse,
            message_type: 'text'
          });
          
          // Récupérer le contexte mis à jour avec le premier message
          const updatedContext = await this.conversationService.getContext(result.conversationId);
          if (updatedContext) {
            result.context = updatedContext;
          }
        } else {

          console.error('❌ Erreur lors de la génération de la première réponse:', 'Réponse vide');

        }
      } catch (aiError) {
        console.error('❌ Erreur lors de la génération de la première réponse:', aiError);
        // Continuer même si l'IA échoue
      }

      return {
        success: true,
        conversationId: result.conversationId,
        expiresIn: 1800, // 30 minutes par défaut
        context: result.context
      };

    } catch (error) {
      console.error('❌ Erreur dans ChatBotService.startConversation:', error);
      return {
        success: false,
        conversationId: '',
        expiresIn: 0,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Ajouter un message et obtenir la réponse de l'IA
   */
  async addMessage(
    conversationId: string,
    request: AddMessageRequest
  ): Promise<{
    success: boolean;
    messageId: string;
    context?: ConversationContext;
    error?: string;
  }> {
    try {
      // Ajouter le message utilisateur
      const addResult = await this.conversationService.addMessage(
        conversationId,
        {
          content: request.content,
          type: request.type,
          metadata: request.metadata || {}
        }
      );

      // Si c'est un message utilisateur, appeler l'IA pour obtenir une réponse
      if (request.type === 'user') {
        try {
          // Récupérer le contexte de la conversation
          const context = await this.conversationService.getContext(conversationId);
          if (context) {
            // Générer une réponse IA
            const aiResponse = await this.generateAIResponse(context, request.content);
            
            if (aiResponse) {
              // Ajouter le message à la conversation Redis
              await this.conversationService.addMessage(
                conversationId,
                {
                  content: aiResponse,
                  type: 'bot',
                  metadata: { source: 'ai', model: this.AI_MODEL }
                }
              );
              
              // Enregistrer la réponse IA dans Supabase
              await this.supabaseService.createAIResponse({
                conversation_id: conversationId,
                user_id: context.userId,
                response_text: aiResponse,
                message_type: 'text'
              });
            }
          }
        } catch (aiError) {
          console.error('❌ Erreur lors de l\'appel IA:', aiError);
          // Continuer même si l'IA échoue
        }
      }

      // Récupérer le contexte mis à jour
      const context = await this.conversationService.getContext(conversationId);
      
      return {
        success: true,
        messageId: addResult.messageId,
        ...(context && { context })
      };

    } catch (error) {
      console.error('❌ Erreur dans ChatBotService.addMessage:', error);
      return {
        success: false,
        messageId: '',
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Récupérer le contexte d'une conversation
   */
  async getContext(conversationId: string): Promise<{
    success: boolean;
    context?: ConversationContext;
    error?: string;
  }> {
    try {
      const context = await this.conversationService.getContext(conversationId);
      if (!context) {
        return {
          success: false,
          error: 'Conversation not found'
        };
      }
      
      return {
        success: true,
        context
      };
    } catch (error) {
      console.error('❌ Erreur dans ChatBotService.getContext:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Terminer une conversation et générer un résumé
   */
  async endConversation(conversationId: string): Promise<{
    success: boolean;
    summary?: any;
    error?: string;
  }> {
    try {
      // Récupérer le contexte final
      const context = await this.conversationService.getContext(conversationId);
      if (!context) {
        return {
          success: false,
          error: 'Impossible de récupérer le contexte de la conversation'
        };
      }

      // Générer un résumé IA
      const summary = await this.generateConversationSummary(context);
      
      // Terminer la conversation
      const endResult = await this.conversationService.endConversation(conversationId);
      
      return {
        success: true,
        summary: {
          ...endResult,
          aiSummary: summary
        }
      };

    } catch (error) {
      console.error('❌ Erreur dans ChatBotService.endConversation:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Générer une réponse IA basée sur le contexte de la conversation
   */
  private async generateAIResponse(context: ConversationContext, userMessage: string): Promise<string> {
    try {
      const systemPrompt = this.buildSystemPrompt(context);
      
      // Construire l'historique des messages
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...context.messages.map(msg => ({
          role: (msg.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: msg.content
        })),
        { role: "user" as const, content: userMessage }
      ];

      console.log('🔍 Génération d\'une nouvelle réponse IA pour la conversation:', context.id);
      console.log('Dernier message de l\'utilisateur:', userMessage);

      const completion = await this.openai.chat.completions.create({
        model: this.AI_MODEL,
        messages,
        max_tokens: 500,
        temperature: 0.7
      });

      console.log('🔍 Réponse IA:', completion.choices[0]?.message?.content || 'Aucune réponse générée');

      return completion.choices[0]?.message?.content || "Je n'ai pas pu générer de réponse. Pouvez-vous reformuler votre question ?";
    } catch (error) {
      console.error('❌ Erreur lors de la génération de la réponse IA:', error);
      return "Je rencontre des difficultés techniques. Pouvez-vous réessayer dans un moment ?";
    }
  }

  /**
   * Générer un résumé de la conversation
   */
  private async generateConversationSummary(context: ConversationContext): Promise<string> {
    try {
      const systemPrompt = `Tu es un assistant spécialisé dans la création de résumés concis et utiles de conversations. 
      Analyse la conversation et fournis un résumé en 2-3 phrases maximum, en français.`;

      const conversationText = context.messages
        .map(msg => `${msg.type === 'user' ? 'Utilisateur' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      const completion = await this.openai.chat.completions.create({
        model: this.AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Résume cette conversation:\n${conversationText}` }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      return completion.choices[0]?.message?.content || "Résumé de la conversation généré automatiquement.";
    } catch (error) {
      console.error('❌ Erreur lors de la génération du résumé:', error);
      return "Résumé de la conversation généré automatiquement.";
    }
  }

  /**
   * Générer une première réponse IA basée sur le contexte de la conversation
   */
  private async generateFirstResponse(context: ConversationContext): Promise<string> {
    try {

      console.log('🔍 Génération de la première réponse IA pour la conversation:', context.id);

      const systemPrompt = this.buildSystemPrompt(context);
      
      let userPrompt = "Salue l'utilisateur et présente-toi brièvement en tant qu'assistant Howana.";
      
      // Personnaliser le prompt selon le type de conversation et les données disponibles
      if (context.type === 'activity' && context.activityData) {
        userPrompt = `Salue l'utilisateur et présente-toi en tant qu'assistant Howana spécialisé dans les activités de bien-être. 
        L'utilisateur souhaite discuter de l'activité: "${context.activityData.title}".
        ${context.activityData.description ? `Description: ${context.activityData.description}` : ''}
        Commence par un accueil chaleureux et propose de l'aider avec cette activité.`;
      } else if (context.type === 'bilan') {
        userPrompt = `Salue l'utilisateur et présente-toi en tant qu'assistant Howana spécialisé dans le bilan de bien-être. 
        L'utilisateur souhaite faire un bilan de sa situation. 
        Commence par un accueil chaleureux et propose de l'accompagner dans cette réflexion.`;
      }

      console.log('🔍 System prompt:', systemPrompt);
      console.log('🔍 Génération de la première réponse IA:', userPrompt);

      const completion = await this.openai.chat.completions.create({
        model: this.AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 200,
        temperature: 0.7
      });

      console.log('🔍 Première réponse IA:', completion.choices[0]?.message?.content || 'Aucune réponse générée');

      return completion.choices[0]?.message?.content || "Bonjour ! Je suis Howana, votre assistant personnel spécialisé dans le bien-être. Comment puis-je vous aider aujourd'hui ?";
    } catch (error) {
      console.error('❌ Erreur lors de la génération de la première réponse:', error);
      return "Bonjour ! Je suis Howana, votre assistant personnel. Comment puis-je vous aider aujourd'hui ?";
    }
  }

  /**
   * Construire le prompt système basé sur le contexte
   */
  private buildSystemPrompt(context: ConversationContext): string {
    let basePrompt = `Tu es Howana, un assistant personnel spécialisé dans le bien-être et les activités de santé. 
    Tu es bienveillant, professionnel et tu aides les utilisateurs à améliorer leur qualité de vie.`;

    // Ajouter les règles IA spécifiques si elles existent
    if (context.aiRules && Array.isArray(context.aiRules)) {
      // Filtrer seulement les règles actives
      const activeRules = context.aiRules.filter((rule: AIRule) => rule.isActive);
      
      if (activeRules.length > 0) {
        basePrompt += `\n\nRègles de comportement et d'information spécifiques à respecter :`;
        
        // Trier les règles par priorité (priorité élevée en premier)
        const sortedRules = activeRules.sort((a: AIRule, b: AIRule) => b.priority - a.priority);
        
        sortedRules.forEach((rule: AIRule, index: number) => {
          basePrompt += `\n${index + 1}. [${rule.type.toUpperCase()}] ${rule.name}: ${rule.description}`;
        });
      }
    }

    // Ajouter le contexte de l'activité si disponible
    if (context.type === 'activity' && context.activityData) {
      basePrompt += `\n\nL'utilisateur discute d'une activité spécifique: "${context.activityData.title}". 
      ${context.activityData.description ? `Description: ${context.activityData.description}` : ''}
      Aide-le à optimiser cette activité, réponds à ses questions et donne des conseils pratiques.`;
    } else if (context.type === 'bilan') {
      basePrompt += `\n\nL'utilisateur fait un bilan de son bien-être. 
      Aide-le à analyser sa situation et propose des améliorations personnalisées.`;
    }

    basePrompt += `\n\nRègles importantes:
    - Réponds toujours en français
    - Sois concis mais utile
    - Adapte tes conseils au contexte de l'utilisateur
    - Reste professionnel et bienveillant
    - Si tu ne sais pas quelque chose, dis-le honnêtement
    - Respecte strictement toutes les règles de comportement et d'information spécifiées ci-dessus`;

    return basePrompt;
  }

  /**
   * Changer le modèle IA utilisé (pour la configuration dynamique)
   */
  setAIModel(model: string): void {
    this.AI_MODEL = model;
    console.log(`🤖 Modèle IA changé vers: ${model}`);
  }

  /**
   * Obtenir le modèle IA actuellement utilisé
   */
  getAIModel(): string {
    return this.AI_MODEL;
  }
}
