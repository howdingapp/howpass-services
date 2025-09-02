import { ConversationService } from './ConversationService';
import { SupabaseService } from './SupabaseService';
import { ConversationContext, StartConversationRequest, AddMessageRequest, OpenAIToolsDescription } from '../types/conversation';
import { ChatBotOutputSchema, IAMessageResponse, ExtractedRecommandations } from '../types/chatbot-output';
import OpenAI from 'openai';

export abstract class BaseChatBotService<T extends IAMessageResponse = IAMessageResponse> {
  protected conversationService: ConversationService;
  protected supabaseService: SupabaseService;
  protected openai: OpenAI;
  protected AI_MODEL = "gpt-4o-mini";
  protected AI_MODEL_QUALITY = "gpt-4o-mini";

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
        ...request,
        initialContext: request.initialContext || {}
      });

      // Générer automatiquement une première réponse IA basée sur le contexte
      try {
        const firstResponseResult = await this.generateFirstResponse(result.context);
        if (firstResponseResult.response) {
          // Utiliser le messageId d'OpenAI si disponible
          const messageId = firstResponseResult.messageId;
          
          // Ajouter le message à la conversation Redis
          await this.conversationService.addMessage(
            result.conversationId,
            {
              content: firstResponseResult.response,
              type: 'bot',
              metadata: { source: 'ai', model: this.AI_MODEL, type: 'first_response', messageId: messageId }
            }
          );
          
          // Sauvegarder le messageId d'OpenAI dans le contexte pour les réponses suivantes
          if (messageId) {
            result.context.metadata = { ...result.context.metadata, previousCallId: messageId };
          }
          
          // Mettre à jour l'entrée ai_response pré-créée
          if (request.aiResponseId) {
            await this.supabaseService.updateAIResponse(request.aiResponseId, {
              response_text: firstResponseResult.response,
              metadata: { 
                source: 'ai', 
                model: this.AI_MODEL, 
                type: 'first_response', 
                messageId: messageId,
                status: 'completed'
              }
            });
            console.log('✅ Entrée ai_response mise à jour avec succès:', request.aiResponseId);
          } else {
            console.warn('⚠️ Aucun aiResponseId fourni pour la première réponse');
          }
          
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
      console.error('❌ Erreur dans BaseChatBotService.startConversation:', error);
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
                  content: aiResponse.response,
                  type: 'bot',
                  metadata: { source: 'ai', model: this.AI_MODEL, messageId: aiResponse.messageId }
                }
              );
              
              // Mettre à jour l'entrée ai_response pré-créée
              if (request.aiResponseId) {
                await this.supabaseService.updateAIResponse(request.aiResponseId, {
                  response_text: aiResponse.response,
                  metadata: { 
                    source: 'ai', 
                    model: this.AI_MODEL,
                    messageId: aiResponse.messageId,
                    status: 'completed'
                  }
                });
                console.log('✅ Entrée ai_response mise à jour avec succès:', request.aiResponseId);
              } else {
                console.warn('⚠️ Aucun aiResponseId fourni pour la réponse IA');
              }
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
      console.error('❌ Erreur dans BaseChatBotService.addMessage:', error);
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
      console.error('❌ Erreur dans BaseChatBotService.getContext:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Générer une réponse IA basée sur le contexte de la conversation
   */
  protected async generateAIResponse(context: ConversationContext, userMessage: string): Promise<T> {
    try {
      console.log('🔍 Génération d\'une nouvelle réponse IA pour la conversation:', context.id);
      console.log('Dernier message de l\'utilisateur:', userMessage);

      // Vérifier s'il y a un callID dans le contexte pour référencer l'appel précédent
      const previousCallId = context.metadata?.['previousCallId'];
      
      if (!previousCallId) {
        throw new Error('Aucun previousCallId trouvé dans le contexte. Impossible de générer une réponse sans référence à la conversation précédente.');
      }

      // Utiliser exclusivement l'API responses pour référencer l'appel précédent
      console.log('🔍 Utilisation de l\'API responses avec callID:', previousCallId);
      
      const outputSchema = this.getAddMessageOutputSchema(context);
      const toolsDescription = this.getToolsDescription(context);
      
      const result = await this.openai.responses.create({
        model: this.AI_MODEL,
        previous_response_id: previousCallId,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage }],
          },
        ],
        ...(outputSchema && { text: outputSchema }),
        ...(toolsDescription && { tools: toolsDescription.tools })
      });
      const messageId = result.id;

      // Vérifier si l'IA demande l'exécution d'un outil
      const toolCalls = result.output.filter(output => output.type === "function_call");
      let extractedData:ExtractedRecommandations|undefined = undefined;

      if (toolCalls.length > 0) {
        console.log('🔧 Outils demandés par l\'IA:', toolCalls);
        
        // Exécuter chaque outil demandé
        const toolResults = [];
        for (const toolCall of toolCalls) {
          if (toolCall.type === "function_call") {
            console.log("Find tool to call: ", toolCall.id, toolCall.call_id, toolCall.name);

            try {
              // Extraire les arguments de l'appel d'outil
              let toolArgs = {};
              if (toolCall.arguments && typeof toolCall.arguments === 'string') {
                try {
                  toolArgs = JSON.parse(toolCall.arguments);
                } catch (parseError) {
                  console.warn(`⚠️ Erreur de parsing des arguments de l'outil ${toolCall.name}:`, parseError);
                  toolArgs = {};
                }
              }
              
              const toolResult = await this.callTool(toolCall.name, toolArgs, context);
              // Extraire les activités et pratiques du résultat de l'outil
              extractedData = this.extractFromToolResult(toolCall.call_id, toolCall.name, toolResult);
              
              // Stocker les données extraites dans le résultat pour utilisation ultérieure
              toolResults.push({
                tool_call_id: toolCall.call_id,
                tool_name: toolCall.name, // Stocker le nom de l'outil pour faciliter l'accès
                output: toolResult
              });
            } catch (toolError) {
              console.error(`❌ Erreur lors de l'exécution de l'outil ${toolCall.name}:`, toolError);
              toolResults.push({
                tool_call_id: toolCall.call_id,
                tool_name: toolCall.name,
                output: `Erreur lors de l'exécution de l'outil: ${toolError instanceof Error ? toolError.message : 'Erreur inconnue'}`
              });
            }
          }
        }

        // Si des outils ont été exécutés, faire un nouvel appel à l'IA avec les résultats
        if (toolResults.length > 0) {
          console.log('🔧 Résultats des outils:', toolResults);
          
          // Filtrer les résultats avec des IDs valides et les typer correctement
          const validToolResults = toolResults
            .filter(result => result.tool_call_id)
            .map(result => ({ 
              tool_call_id: result.tool_call_id, 
              tool_name: result.tool_name,
              output: result.output 
            }));
          
            console.log("validToolResults", JSON.stringify(validToolResults))

          if (validToolResults.length > 0) {
            // Générer une nouvelle réponse IA avec les résultats des outils
            const finalResponse = await this.generateIAResponseAfterTools(messageId, validToolResults, context);
            
            console.log('🔍 Réponse finale IA après exécution des outils:', finalResponse.response);
            console.log('🔍 MessageID final OpenAI:', finalResponse.messageId);

            return { ...finalResponse, extractedData } as T;
          }
        }
      }

      // Si aucun outil n'a été exécuté, traiter la réponse normale
      const messageOutput = result.output.find(output => output.type === "message");
      
      if (!messageOutput) {
        throw new Error('Aucun message de réponse trouvé dans la sortie de l\'API');
      }

      // Extraire le texte de la réponse
      let resultText = "Je n'ai pas pu générer de réponse.";
      if (messageOutput?.content?.[0]) {
        const content = messageOutput.content[0];
        if ('text' in content) {
          resultText = content.text;
        }
      }

      if (!resultText || resultText === "Je n'ai pas pu générer de réponse.") {
        throw new Error('Aucune réponse générée par l\'API responses');
      }

      // Parser le JSON de la réponse (contient forcément le champ response)
      let parsedResponse: any;
      try {
        parsedResponse = JSON.parse(resultText);
        if (!parsedResponse.response) {
          throw new Error('La réponse JSON ne contient pas le champ "response" requis');
        }
      } catch (parseError) {
        throw new Error(`Erreur de parsing JSON de la réponse IA: ${parseError instanceof Error ? parseError.message : 'Format JSON invalide'}`);
      }

      console.log('🔍 Réponse IA via API responses:', parsedResponse);
      console.log('🔍 OutputID OpenAI:', messageId);

      // Retourner la réponse parsée avec le messageId
      return {
        ...parsedResponse,
        extractedData,
        messageId
      } as T;

    } catch (error) {
      console.error('❌ Erreur lors de la génération de la réponse IA:', error);
      throw new Error(`Erreur lors de la génération de la réponse IA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Générer une première réponse IA basée sur le contexte de la conversation
   */
  protected async generateFirstResponse(context: ConversationContext): Promise<T> {
    try {
      console.log('🔍 Génération de la première réponse IA pour la conversation:', context.id);

      const systemPrompt = this.buildSystemPrompt(context);
      const userPrompt = this.buildFirstUserPrompt(context);

      console.log('🔍 System prompt:', systemPrompt);
      console.log('🔍 Génération de la première réponse IA:', userPrompt);

      // Utiliser l'API responses pour la première réponse avec le même schéma que les messages suivants
      const outputSchema = this.getAddMessageOutputSchema(context);
      
      const result = await this.openai.responses.create({
        model: this.AI_MODEL,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
          {
            type: "message",
            role: "system",
            content: [{ 
              type: "input_text", 
              text: systemPrompt
            }],
            status: "completed",
          },
        ],
        ...(outputSchema && { text: outputSchema })
      });

      // Récupérer le messageId du premier résultat de type "message"
      const messageOutput = result.output.find(output => output.type === "message");
      const messageId = result.id;
      
             // Extraire le texte de la réponse
       let resultText = "Bonjour ! Je suis Howana, votre assistant personnel spécialisé dans le bien-être. Comment puis-je vous aider aujourd'hui ?";
       if (messageOutput?.content?.[0]) {
         const content = messageOutput.content[0];
         if ('text' in content) {
           resultText = content.text;
         }
       }

       // Si un schéma de sortie est défini, parser le JSON
       if (outputSchema) {
         try {
           const parsedResponse = JSON.parse(resultText);
           if (!parsedResponse.response) {
             throw new Error('La réponse JSON ne contient pas le champ "response" requis');
           }
           
           console.log('🔍 Première réponse IA via API responses (JSON):', parsedResponse);
           console.log('🔍 MessageID OpenAI:', messageId);
           
           return {
             ...parsedResponse,
             messageId
           } as T;
         } catch (parseError) {
           console.warn('⚠️ Erreur de parsing JSON, fallback vers réponse simple:', parseError);
         }
       }

       // Fallback : réponse simple sans JSON
       console.log('🔍 Première réponse IA via API responses (simple):', resultText);
       console.log('🔍 MessageID OpenAI:', messageId);

       return { 
         response: resultText, 
         messageId 
       } as T;
         } catch (error) {
       console.error('❌ Erreur lors de la génération de la première réponse:', error);
       return { 
         response: "Bonjour ! Je suis Howana, votre assistant personnel. Comment puis-je vous aider aujourd'hui ?",
         messageId: "error"
       } as T;
    }
  }

  /**
   * Générer une réponse IA après l'exécution des outils
   */
  protected async generateIAResponseAfterTools(
    previousResponseId: string, 
    toolResults: Array<{ tool_call_id: string; tool_name?: string; output: any }>, 
    context: ConversationContext
  ): Promise<T> {
    try {
      console.log('🔧 Génération d\'une réponse IA avec les résultats des outils');

      // Déterminer le schéma de sortie approprié selon l'outil utilisé
      const firstToolName = toolResults.length > 0 ? 
        (toolResults[0]?.tool_name || this.extractToolNameFromCallId(toolResults[0]?.tool_call_id || '')) : 
        null;
      const outputSchema = firstToolName ? this.getSchemaByUsedTool(firstToolName, context) : this.getAddMessageOutputSchema(context);

      console.log(`🔧 Soumission des tool_outputs pour: ${firstToolName || 'inconnu'}`);

      // Préparer les tool_outputs dans le format attendu par l'API Responses
      const toolOutputsPayload = toolResults
        .filter(r => !!r.tool_call_id)
        .map(r => ({
          tool_call_id: r.tool_call_id,
          output: typeof r.output === 'string' ? r.output : JSON.stringify(r.output)
        }));

      if (!toolOutputsPayload.length) {
        throw new Error('Aucun tool_output valide à soumettre');
      }

      // Construire la liste d'inputs avec les sorties des outils
      const inputList = toolResults
        .filter(r => !!r.tool_call_id)
        .map(r => ({
          type: "function_call_output",
          call_id: r.tool_call_id,
          output: typeof r.output === 'string' ? r.output : JSON.stringify(r.output)
        }));

      const result = await this.openai.responses.create({
        model: this.AI_MODEL,
        previous_response_id: previousResponseId,
        input: inputList,
        ...(outputSchema && { text: outputSchema })
      } as any);

      const messageId = result.id;
      const messageOutput = result.output.find(output => output.type === "message");
      
      // Extraire le texte de la réponse
      let resultText = "Je n'ai pas pu générer de réponse finale.";
      if (messageOutput?.content?.[0]) {
        const content = messageOutput.content[0];
        if ('text' in content) {
          resultText = content.text;
        }
      }

      if (!resultText || resultText === "Je n'ai pas pu générer de réponse finale.") {
        throw new Error('Aucune réponse finale générée par l\'API responses');
      }

      // Parser le JSON de la réponse finale (contient forcément le champ response)
      let parsedResponse: any;
      try {
        parsedResponse = JSON.parse(resultText);
        if (!parsedResponse.response) {
          throw new Error('La réponse JSON finale ne contient pas le champ "response" requis');
        }
      } catch (parseError) {
        throw new Error(`Erreur de parsing JSON de la réponse finale IA: ${parseError instanceof Error ? parseError.message : 'Format JSON invalide'}`);
      }

      console.log('🔍 Réponse finale IA générée avec succès:', parsedResponse);
      return { 
        ...parsedResponse,
        messageId
      } as T;

    } catch (error) {
      console.error('❌ Erreur lors de la génération de la réponse finale IA:', error);
      throw new Error(`Erreur lors de la génération de la réponse finale IA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Générer un résumé structuré de la conversation
   */
  async generateConversationSummary(context: ConversationContext): Promise<{summary: string, extractedData: ExtractedRecommandations|undefined}> {
    try {
      // Vérifier si des recommandations sont requises pour le résumé
      const needsRecommendations = this.recommendationRequiredForSummary(context);
      let recommendationResponse:T|undefined = undefined;
      let extractedData:ExtractedRecommandations|undefined = undefined;

      console.log(`📋 Génération du résumé - Recommandations requises: ${needsRecommendations}`);
      
      // Si des recommandations sont requises et qu'elles n'existent pas encore,
      // forcer un appel à generateIAResponse avec une demande explicite
      if (needsRecommendations) {
        console.log('🔧 Forçage d\'un appel à generateIAResponse pour générer des recommandations');
        
        // Forcer une demande explicite pour des activités ou pratiques
        const explicitRequest = "Peux-tu me recommander des activités et des pratiques adaptées à mes besoins ?";

        try {
          // Appeler generateIAResponse avec la demande explicite
          recommendationResponse = await this.generateAIResponse(context, explicitRequest);
          extractedData = recommendationResponse?.extractedData;
          console.log('🔧 Réponse IA avec recommandations générée:', recommendationResponse);
          
          // Les recommandations seront automatiquement extraites et stockées via generateIAResponse
          // Le callId sera lié aux pratiques comme souhaité
          
        } catch (error) {
          console.error('❌ Erreur lors de la génération des recommandations:', error);
        }
      }

      // Vérifier s'il y a un callID dans le contexte pour référencer l'appel précédent
      const previousCallId = recommendationResponse?.messageId || context.metadata?.['previousCallId'];
      
      if (!previousCallId) {
        throw new Error('No previous call ID found');
      }

      // Utiliser l'API responses pour référencer l'appel précédent
      console.log('🔍 Génération du résumé via API responses avec callID:', previousCallId);
      
      try {
        const systemPrompt = this.buildSummarySystemPrompt(context);
        const conversationText = context.messages
          .map(msg => `${msg.type === 'user' ? 'Utilisateur' : 'Assistant'}: ${msg.content}`)
          .join('\n');

        const summarySchema = this.getSummaryOutputSchema(context);
        const result = await this.openai.responses.create({
          model: this.AI_MODEL_QUALITY,
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text: `Analyse cette conversation et génère un résumé structuré:\n${conversationText}` }],
            },
            {
              type: "message",
              role: "system",
              content: [{ 
                type: "input_text", 
                text: systemPrompt
              }],
              status: "completed",
            },
          ],
          ...(summarySchema && { text: summarySchema })
        });

        const resultText = result.output
          .filter((output) => output.type === "message")
          .map((output) => (output as any).content?.[0]?.text)[0];

        if (resultText) {
          try {
            const parsedSummary = JSON.parse(resultText);
            console.log('🔍 Résumé structuré généré:', parsedSummary);
            return {
              summary: parsedSummary,
              extractedData,
            };
          } catch (parseError) {
            console.warn('⚠️ Erreur de parsing JSON, fallback vers résumé simple:', parseError);
          }
        }
      } catch (responseError) {
        console.warn('⚠️ Erreur avec l\'API responses, fallback vers chat classique:', responseError);
      }

      return {
        summary: "Résumé de la conversation généré automatiquement.",
        extractedData,
      };
      
    } catch (error) {
      console.error('❌ Erreur lors de la génération du résumé:', error);
      return {
        summary: "Résumé de la conversation généré automatiquement.",
        extractedData: { activities: [], practices: [] }
      };
    }
  }

  /**
   * Méthodes abstraites à implémenter dans les classes enfants
   */
  protected abstract buildSystemPrompt(context: ConversationContext): string;
  protected abstract buildFirstUserPrompt(context: ConversationContext): string;
  protected abstract buildSummarySystemPrompt(context: ConversationContext): string;
  protected abstract getSummaryOutputSchema(context: ConversationContext): ChatBotOutputSchema;
  
  /**
   * Schéma de sortie pour startConversation (null si pas de schéma spécifique)
   */
  protected abstract getStartConversationOutputSchema(context: ConversationContext): ChatBotOutputSchema;
  
  /**
   * Schéma de sortie pour addMessage (par défaut avec un champ response obligatoire)
   */
  protected getFirstMessageOutputSchema(_context: ConversationContext): ChatBotOutputSchema {
    return {
      format: { 
        type: "json_schema",
        name: "BaseChatBotResponse",
        schema: {
          type: "object",
          properties: {
            response: {
              type: "string",
              description: "Réponse principale de l'assistant"
            }
          },
          required: ["response"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  /**
   * Schéma de sortie pour addMessage (par défaut avec un champ response obligatoire)
   */
  protected getAddMessageOutputSchema(_context: ConversationContext): ChatBotOutputSchema {
    return {
      format: { 
        type: "json_schema",
        name: "BaseChatBotResponse",
        schema: {
          type: "object",
          properties: {
            response: {
              type: "string",
              description: "Réponse principale de l'assistant"
            }
          },
          required: ["response"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  /**
   * Détermine le schéma de sortie approprié selon l'outil utilisé
   */
  protected getSchemaByUsedTool(_toolName: string, context: ConversationContext): ChatBotOutputSchema {
    // Par défaut, utiliser le schéma de base
    return this.getAddMessageOutputSchema(context);
  }



  /**
   * Description des outils disponibles pour l'IA (null si pas d'outils)
   */
  protected abstract getToolsDescription(context: ConversationContext): OpenAIToolsDescription | null;

  /**
   * Exécuter un outil spécifique
   */
  protected abstract callTool(toolName: string, toolArgs: any, context: ConversationContext): Promise<any>;

  /**
   * Fonction abstraite pour extraire les activités et pratiques des réponses d'outils
   * Chaque classe fille doit implémenter cette méthode selon le schéma de sortie de ses outils
   * 
   * @example
   * // Dans RecommendationChatBotService, l'outil activities_and_practices retourne:
   * // {
   * //   results: [
   * //     { table_name: 'activities', id: 'act1', title: 'Yoga', relevanceScore: 0.9 },
   * //     { table_name: 'practices', id: 'prac1', title: 'Méditation', relevanceScore: 0.8 }
   * //   ]
   * // }
   * // Cette fonction extrait et sépare les activités des pratiques
   * 
   * @param toolId - L'identifiant de l'outil (ex: 'activities_and_practices', 'faq')
   * @param response - La réponse brute de l'outil
   * @returns Structure standardisée avec activités et pratiques séparées
   */
  protected abstract extractRecommandationsFromToolResponse(toolId: string, response: any): ExtractedRecommandations;

  /**
   * Méthode utilitaire pour extraire les activités et pratiques d'un résultat d'outil
   * Utilise la fonction abstraite implémentée par la classe fille
   */
  protected extractFromToolResult(toolCallId: string, toolName: string, toolResult: any): ExtractedRecommandations {
    console.log(`🔧 Extraction des activités et pratiques depuis l'outil: ${toolName} (ID: ${toolCallId})`);
    
    try {
      const extracted = this.extractRecommandationsFromToolResponse(toolName, toolResult);
      
      console.log(`✅ Extraction réussie: ${extracted.activities.length} activités, ${extracted.practices.length} pratiques`);
      
      return extracted;
    } catch (error) {
      console.error(`❌ Erreur lors de l'extraction des activités et pratiques:`, error);
      return { activities: [], practices: [] };
    }
  }

  /**
   * Détermine si des recommandations sont requises pour le résumé de ce type de conversation
   * Par défaut, retourne false. Peut être surchargé dans les classes enfants.
   * Cette fonction peut utiliser le contexte pour vérifier si des recommandations ont déjà été générées.
   */
  protected recommendationRequiredForSummary(_context: ConversationContext): boolean {
    // Par défaut, pas de recommandations requises
    return false;
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

  /**
   * Extrait le nom de l'outil depuis un tool_call_id
   * Cette méthode peut être surchargée dans les classes enfants si nécessaire
   */
  protected extractToolNameFromCallId(toolCallId: string): string | null {
    try {
      // L'ID est formaté comme: "toolName_originalId_randomString"
      // On extrait la première partie avant le premier underscore
      const parts = toolCallId.split('_');
      if (parts.length >= 2) {
        const toolName = parts[0];
        if (toolName) {
          console.log(`🔧 Nom de l'outil extrait depuis l'ID: ${toolName}`);
          return toolName;
        }
      }
      
      // Si le format n'est pas reconnu, retourner null
      console.warn('⚠️ Format d\'ID d\'outil non reconnu:', toolCallId);
      return null;
    } catch (error) {
      console.warn('⚠️ Impossible d\'extraire le nom de l\'outil depuis l\'ID:', toolCallId, error);
      return null;
    }
  }
}
