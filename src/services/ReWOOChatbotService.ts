import { BaseChatBotService } from './BaseChatBotService';
import { StartConversationRequest, OpenAIToolsDescription } from '../types/conversation';
import { HowanaContext } from '../types/repositories';
import { IAMessageResponse, ExtractedRecommandations, ChatBotOutputSchema } from '../types/chatbot-output';

export abstract class ReWOOChatbotService<T extends IAMessageResponse> extends BaseChatBotService<T> {
  
  // Constante pour le cycle de rafraîchissement du contexte
  private static readonly CONTEXT_REFRESH_CYCLE = 3;
  
  /**
   * Démarrer une nouvelle conversation avec l'IA
   * Redéfini pour initialiser toolsCallIn à 2
   */
  override async startConversation(request: StartConversationRequest): Promise<{
    success: boolean;
    conversationId: string;
    expiresIn: number;
    updatedContext?: HowanaContext;
    error?: string;
  }> {
    try {
      // Démarrer la conversation via le service local
      const result = await this.conversationService.startConversation(request);

      // Initialiser toolsCallIn dans le contexte
      if (result.context) {
        result.context.metadata = result.context.metadata || {};
        result.context.metadata["toolsCallIn"] = ReWOOChatbotService.CONTEXT_REFRESH_CYCLE;
        console.log(`🔧 ReWOO: toolsCallIn initialisé à ${ReWOOChatbotService.CONTEXT_REFRESH_CYCLE}`);
      }

      // Générer automatiquement une première réponse IA basée sur le contexte
      try {
        const firstResponseResult = await this.generateFirstResponse(result.context);
        if (firstResponseResult.response) {
          // Utiliser le messageId d'OpenAI si disponible
          const messageId = firstResponseResult.messageId;
          
          // Sauvegarder le messageId d'OpenAI dans le contexte pour les réponses suivantes
          if (messageId) {
            result.context.previousCallId = messageId;
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
        updatedContext: result.context
      };

    } catch (error) {
      console.error('❌ Erreur dans ReWOOChatbotService.startConversation:', error);
      return {
        success: false,
        conversationId: '',
        expiresIn: 0,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Générer une réponse IA basée sur le contexte de la conversation
   * Redéfini pour gérer la logique toolsCallIn
   */
  protected override async _generateAIResponse(
    context: HowanaContext, 
    userMessage: string, 
    forceSummaryToolCall: boolean = false, 
    _toolsAllowed: boolean = true, 
    _recursionAllowed: boolean = true, 
    _toolResults?: Array<{ tool_call_id: string; tool_name?: string; output: any }>,
    _useSchemaWithToolResults: boolean = true,
  ): Promise<T> {
    try {
      console.log('🔍 ReWOO: Génération d\'une nouvelle réponse IA pour la conversation:', context.id);
      console.log('Dernier message de l\'utilisateur:', userMessage);

      // Récupérer le compteur toolsCallIn depuis le contexte
      const toolsCallIn = context.metadata["toolsCallIn"] != undefined ? context.metadata["toolsCallIn"] : ReWOOChatbotService.CONTEXT_REFRESH_CYCLE;
      console.log(`🔧 ReWOO: toolsCallIn actuel: ${toolsCallIn}`);

      // Vérifier s'il y a un callID dans le contexte pour référencer l'appel précédent
      const previousCallId = context.previousCallId;
      
      if (!previousCallId) {
        throw new Error('Aucun previousCallId trouvé dans le contexte. Impossible de générer une réponse sans référence à la conversation précédente.');
      }

      let response:T|null = null;

      // Si toolsCallIn atteint 0, utiliser le comportement spécial
      if (toolsCallIn <= 0) {
        console.log('🔧 ReWOO: toolsCallIn atteint 0, utilisation du comportement spécial');
        response = await this.generateResponseWithAllTools(context, userMessage, previousCallId) as T;
      } else {
        // Comportement normal - enrichir le message avec les infos de contexte
        console.log('🔧 ReWOO: Utilisation du comportement normal');
        
        // Enrichir le message utilisateur avec les informations de contexte
        const enrichedUserMessage = this.buildEnrichedUserMessageWithContextInfo(userMessage, toolsCallIn);
        
        // Appeler la méthode parente avec le message enrichi
        response = await super._generateAIResponse(context, enrichedUserMessage, forceSummaryToolCall, false, false, undefined, false);
      }

      // Mise à jour unifiée du contexte après récupération de la réponse
      if (response) {

        let updatedContext = context;

        // Mettre à jour le contexte avec le messageId de la réponse
        updatedContext.previousCallId = response.messageId;
        
        // Mettre à jour le contexte avant d'appeler la méthode parente
        updatedContext.metadata = updatedContext.metadata || {};
        updatedContext.metadata["toolsCallIn"] = ((toolsCallIn - 1) % (ReWOOChatbotService.CONTEXT_REFRESH_CYCLE + 1));
        console.log(`🔧 ReWOO: toolsCallIn décrémenté à ${updatedContext.metadata["toolsCallIn"]}`);
        
        // Mettre à jour le contexte avec les données extraites si disponibles
        if (response.extractedData) {
          updatedContext = this.enrichContext(updatedContext, { extractedData: response.extractedData });
        }
        
        response.updatedContext = updatedContext;

        console.log('🔧 ReWOO: Contexte mis à jour');
      
      }

      return response;

    } catch (error) {
      console.error('❌ Erreur lors de la génération de la réponse IA:', error);
      throw new Error(`Erreur lors de la génération de la réponse IA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Comportement spécial quand toolsCallIn atteint 0
   * Génère les meilleurs paramètres pour tous les outils disponibles et les exécute
   */
  private async generateResponseWithAllTools(
    context: HowanaContext,
    userMessage: string,
    previousCallId: string
  ): Promise<IAMessageResponse> {
    try {
      console.log('🔧 ReWOO: Génération de réponse avec outils optimaux');

      // Récupérer la description des outils disponibles
      const toolsDescription = this.getToolsDescription(context, false, true);
      if (!toolsDescription || toolsDescription.tools.length === 0) {
        console.log('⚠️ ReWOO: Aucun outil disponible, utilisation du comportement normal');
        return await super._generateAIResponse(context, userMessage, false, false, true, undefined, false);
      }

      // Demander à l'IA de générer les meilleurs paramètres pour tous les outils
      const optimalParams = await this.generateOptimalToolParameters(context, userMessage, toolsDescription, previousCallId);
      
      if (!optimalParams || optimalParams.length === 0) {
        console.log('⚠️ ReWOO: Aucun paramètre optimal généré, utilisation du comportement normal');
        return await super._generateAIResponse(context, userMessage, false, false, true, undefined, false);
      }

      // Exécuter tous les outils en parallèle avec les paramètres optimaux
      const { toolResults, extractedData } = await this.executeToolsInParallel(optimalParams, context);

      // Enrichir le message utilisateur avec le contexte des résultats d'outils
      const enrichedUserMessage = this.buildEnrichedUserMessage(userMessage, toolResults, context);

      // Utiliser la méthode parente avec le message enrichi et les outils désactivés
      const finalResponse = await super._generateAIResponse(context, enrichedUserMessage, false, false, false, undefined, false);
      
      console.log('🔍 ReWOO: Réponse finale générée avec tous les outils:', finalResponse.response);
      
      // Mise à jour unifiée du contexte (cohérente avec generateAIResponse)
      let updatedContext = context;
      
      // Mettre à jour le contexte avec le messageId de la réponse
      updatedContext.previousCallId = finalResponse.messageId;
      
      // Mettre à jour le contexte avec les données extraites si disponibles
      if (extractedData) {
        updatedContext = this.enrichContext(updatedContext, { extractedData });
      }
      
      console.log('🔧 ReWOO: Contexte mis à jour dans generateResponseWithAllTools');
      
      return {
        ...finalResponse,
        extractedData,
        updatedContext,
      } as IAMessageResponse;

    } catch (error) {

      console.error('❌ ReWOO: Erreur lors de la génération de réponse avec outils optimaux:', error);
      
      // Fallback vers le comportement normal
      return {
        response: "Je n'ai pas pu générer de réponse.",
        messageId: "",
        updatedContext: context,
      }

    }
  }

  /**
   * Construit un message utilisateur enrichi avec le contexte des résultats d'outils
   */
  private buildEnrichedUserMessage(
    userMessage: string,
    toolResults: Array<{ tool_call_id: string; tool_name?: string; output: any }>,
    context: HowanaContext
  ): string {
    if (toolResults.length === 0) {
      return userMessage;
    }

    // Utiliser la fonction formatToolResultsAsContext de la classe parente
    const contextHints = this.formatToolResultsAsContext(toolResults, context);
    
    return `${userMessage}

${contextHints}

Évalue ces suggestions avec tact et profondeur. Découvre les centres d'intérêt de l'utilisateur et évoque brièvement les éléments pertinents dans ta conversation, sans recracher les données brutes.`;
  }

  /**
   * Construit un message utilisateur enrichi avec les informations de contexte ReWOO
   */
  private buildEnrichedUserMessageWithContextInfo(userMessage: string, toolsCallIn: number): string {
    const contextInfo = `Nombre d'échanges avant rafraîchissement: ${toolsCallIn}`;

    return `${userMessage}

${contextInfo}`;
  }

  /**
   * Exécute tous les outils en parallèle avec les paramètres optimaux
   */
  private async executeToolsInParallel(
    optimalParams: Array<{ toolName: string; parameters: any }>,
    context: HowanaContext
  ): Promise<{ toolResults: Array<{ tool_call_id: string; tool_name: string; output: any }>; extractedData: ExtractedRecommandations | undefined }> {
    const toolResults = [];
    let extractedData: ExtractedRecommandations | undefined = undefined;

    const toolPromises = optimalParams.map(async (toolParam) => {
      try {
        console.log(`🔧 ReWOO: Exécution de l'outil ${toolParam.toolName} avec paramètres:`, toolParam.parameters);
        
        const toolResult = await this.callTool(toolParam.toolName, toolParam.parameters, context);
        
        // Extraire les données du résultat de l'outil
        const extracted = this.extractFromToolResult(`${toolParam.toolName}`, toolParam.toolName, toolResult);
        
        return {
          tool_call_id: `${toolParam.toolName}`,
          tool_name: toolParam.toolName,
          output: toolResult,
          extracted: extracted
        };
        
      } catch (toolError) {
        console.error(`❌ ReWOO: Erreur lors de l'exécution de l'outil ${toolParam.toolName}:`, toolError);
        return {
          tool_call_id: `${toolParam.toolName}`,
          tool_name: toolParam.toolName,
          output: `Erreur lors de l'exécution de l'outil: ${toolError instanceof Error ? toolError.message : 'Erreur inconnue'}`,
          extracted: null
        };
      }
    });

    // Attendre que tous les outils se terminent
    const toolResultsWithExtracted = await Promise.all(toolPromises);
    
    // Traiter les résultats
    for (const result of toolResultsWithExtracted) {
      toolResults.push({
        tool_call_id: result.tool_call_id,
        tool_name: result.tool_name,
        output: result.output
      });
      
      // Extraire les données si disponibles
      if (result.extracted && (result.extracted.activities.length > 0 || result.extracted.practices.length > 0)) {
        extractedData = result.extracted;
      }
    }

    return { toolResults, extractedData };
  }

  /**
   * Redéfinit getIaRules pour ajouter la règle de provision de contexte en dernière position
   */
  protected override async getIaRules(contextType: string, defaultRules: string[]): Promise<string[]> {
    // Appeler la méthode parente pour obtenir les règles de base
    const baseRules = await super.getIaRules(contextType, defaultRules);
    
    // Ajouter la règle spécifique à ReWOO en dernière position
    const contextProvisionRule = `PROVISION DE CONTEXTE:
Tous les ${ReWOOChatbotService.CONTEXT_REFRESH_CYCLE} échanges, les informations contextuelles sont rafraîchies et pourront être utilisées pour mieux répondre à l'utilisateur. Dans l'attente, il faut temporiser en essayant de récupérer un maximum d'informations du client pour mieux comprendre ses besoins et ses préférences.`;

    return [...baseRules, contextProvisionRule];
  }


  /**
   * Génère un schéma de sortie basé sur la description des outils disponibles
   */
  private generateToolParametersOutputSchema(toolsDescription: OpenAIToolsDescription): ChatBotOutputSchema {
    // Créer un schéma dynamique où chaque outil devient une propriété de l'objet
    const toolProperties: Record<string, any> = {};
    const requiredTools: string[] = [];
    
    // Construire dynamiquement les propriétés pour chaque outil
    toolsDescription.tools.forEach(tool => {
      const toolName = tool.description.name;
      toolProperties[toolName] = {
        type: "object",
        description: `Paramètres optimaux pour l'outil ${toolName}: ${tool.description.description}`,
        properties: tool.description.parameters.properties,
        required: tool.description.parameters.required || [],
        additionalProperties: false
      };
      requiredTools.push(toolName);
    });
    
    return {
      format: {
        type: "json_schema",
        name: "ToolParametersResponse",
        schema: {
          type: "object",
          properties: toolProperties,
          required: requiredTools,
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  /**
   * Génère les paramètres optimaux pour tous les outils disponibles
   */
  private async generateOptimalToolParameters(
    context: HowanaContext,
    userMessage: string,
    toolsDescription: OpenAIToolsDescription,
    previousCallId: string
  ): Promise<Array<{ toolName: string; parameters: any }>> {
    try {
      console.log('🔧 ReWOO: Génération des paramètres optimaux pour les outils');

      const prompt = `Génère les MEILLEURS paramètres pour les outils disponibles en fonction du message utilisateur et du contexte de la conversation.

Message utilisateur: "${userMessage}"
Type de conversation: ${context.type}

Outils disponibles:
${toolsDescription.tools.map(tool => `- ${tool.description.name}: ${tool.description.description}`).join('\n')}

Pour chaque outil pertinent, fournis des paramètres qui maximiseront la pertinence et l'utilité de la réponse. Chaque outil aura sa propre propriété dans l'objet de réponse avec ses paramètres spécifiques.`;

      // Générer le schéma de sortie basé sur toolsDescription
      const outputSchema = this.generateToolParametersOutputSchema(toolsDescription);

      console.log('🔧 ReWOO: Schéma de sortie:', JSON.stringify(outputSchema, null, 2));

      const result = await this.openai.responses.create({
        model: this.AI_MODEL,
        previous_response_id: previousCallId,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          }
        ],
        ...(outputSchema && { text: outputSchema })
      });

      const messageOutput = result.output.find(output => output.type === "message");
      if (!messageOutput?.content?.[0]) {
        throw new Error('Aucune réponse générée pour les paramètres optimaux');
      }

      const responseText = (messageOutput.content[0] as any).text;
      console.log('🔧 ReWOO: Réponse IA pour paramètres optimaux:', responseText);

      // Parser la réponse JSON structurée
      const response = JSON.parse(responseText);
      
      // Convertir la nouvelle structure en format attendu par le reste du code
      const optimalParams: Array<{ toolName: string; parameters: any }> = [];
      
      toolsDescription.tools.forEach(tool => {
        const toolName = tool.description.name;
        if (response[toolName]) {
          optimalParams.push({
            toolName: toolName,
            parameters: response[toolName]
          });
        }
      });

      console.log('🔧 ReWOO: Paramètres optimaux générés:', optimalParams);
      return optimalParams;

    } catch (error) {
      console.error('❌ ReWOO: Erreur lors de la génération des paramètres optimaux:', error);
      return [];
    }
  }

}