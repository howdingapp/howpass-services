import { ConversationService } from './ConversationService';
import { SupabaseService } from './SupabaseService';
import { StartConversationRequest, OpenAIToolsDescription } from '../types/conversation';
import { HowanaContext } from '../types/repositories';
import { ChatBotOutputSchema, IAMessageResponse, ExtractedRecommandations } from '../types/chatbot-output';
import type { Response } from 'openai/resources/responses/responses';
import OpenAI from 'openai';

export abstract class BaseChatBotService<T extends IAMessageResponse = IAMessageResponse> {
  protected conversationService: ConversationService;
  protected supabaseService: SupabaseService;
  protected openai: OpenAI;
  protected AI_MODEL = "gpt-4o-mini";
  protected AI_MODEL_QUALITY = "gpt-4o";

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
    updatedContext?: HowanaContext;
    error?: string;
  }> {
    try {
      // Démarrer la conversation via le service local
      const result = await this.conversationService.startConversation(request);

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
   * Générer une première réponse IA basée sur le contexte de la conversation
   */
  public async generateFirstResponse(context: HowanaContext): Promise<T> {
    try {
      console.log('🔍 Génération de la première réponse IA pour la conversation:', context.id);

      const systemPrompt = await this.buildSystemPrompt(context);
      const userPrompt = this.buildFirstUserPrompt(context);

      console.log('🔍 System prompt:', systemPrompt);
      console.log('🔍 Génération de la première réponse IA:', userPrompt);

      // Utiliser l'API responses pour la première réponse avec le même schéma que les messages suivants
      const outputSchema = this.getWelcomeMessageOutputSchema(context);
      
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
      
      // Extraire le nombre de tokens depuis la réponse OpenAI
      const totalTokens = result.usage?.total_tokens || null;
      if (totalTokens) {
        console.log(`💰 Nombre de tokens utilisés: ${totalTokens}`);
      }
      
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
             messageId,
             updatedContext: context,
             cost: totalTokens, // Stocker le nombre de tokens dans le champ cost
             haveNext: false,
           } as unknown as T;
         } catch (parseError) {
           console.warn('⚠️ Erreur de parsing JSON, fallback vers réponse simple:', parseError);
         }
       }

       // Fallback : réponse simple sans JSON
       console.log('🔍 Première réponse IA via API responses (simple):', resultText);
       console.log('🔍 MessageID OpenAI:', messageId);

       return { 
         response: resultText, 
         messageId,
         updatedContext: context,
         cost: totalTokens, // Stocker le nombre de tokens dans le champ cost
         haveNext: false,
       } as unknown as T;  
         } catch (error) {
       console.error('❌ Erreur lors de la génération de la première réponse:', error);
       return { 
         response: "Bonjour ! Je suis Howana, votre assistant personnel. Comment puis-je vous aider aujourd'hui ?",
         messageId: "error",
         updatedContext: context,
         cost: null, // Pas de tokens en cas d'erreur
         haveNext: false,
       } as unknown as T;
    }
  }

  /**
   * Générer une réponse IA basée sur le contexte de la conversation
   * Gère la validation et le retry si nécessaire
   */
  public async generateAIResponse(
    context: HowanaContext, 
    userMessage: string,
  ): Promise<T> {
    // Appeler _generateAIResponse pour obtenir la réponse
    const response = await this._generateAIResponse(context, userMessage, false, false, false, undefined, true);
    
    // Valider la réponse
    const validation = await this.validateResponse(response, context);
    
    if (validation.isValid) {
      // Si un finalObject est fourni, l'utiliser
      if (validation.finalObject) {
        console.log('✅ Validation réussie avec finalObject fourni');
        return validation.finalObject;
      }
      // Sinon, retourner la réponse initiale
      console.log('✅ Validation réussie');
      return response;
    }

    // Validation échouée
    console.warn('⚠️ Validation échouée:', validation.reason);
    
    // Si un finalObject est fourni, l'utiliser même si la validation a échoué
    if (validation.finalObject) {
      console.log('✅ Utilisation du finalObject fourni malgré l\'échec de validation');
      return validation.finalObject;
    }

    // Réessayer une seule fois avec les erreurs détectées
    console.log('🔄 Retry de la génération avec les erreurs détectées');
    
    // Construire le message enrichi avec les erreurs de validation
    const validationErrorsText = `\n\n[ERREURS DE VALIDATION DÉTECTÉES]
La réponse précédente n'a pas passé la validation. Voici les erreurs détectées :

${validation.reason || 'Erreur de validation non spécifiée'}

Merci de corriger la réponse en tenant compte de ces erreurs.`;

    // Enrichir le message utilisateur original avec les erreurs
    const enrichedUserMessage = userMessage + validationErrorsText;

    // Mettre à jour le contexte avec le previousCallId de la réponse qui a échoué
    context.previousCallId = response.messageId;

    // Relancer via _generateAIResponse avec le message enrichi
    // On désactive la récursion pour éviter les boucles infinies
    const retryResponse = await this._generateAIResponse(
      context,
      enrichedUserMessage,
      false, // forceSummaryToolCall
      true,  // toolsAllowed
      false, // recursionAllowed (pour éviter les boucles)
      undefined, // toolResults
      true   // useSchemaWithToolResults
    );

    // Valider à nouveau la réponse du retry
    const retryValidation = await this.validateResponse(retryResponse, context);
    
    if (retryValidation.isValid) {
      if (retryValidation.finalObject) {
        return retryValidation.finalObject;
      }
      return retryResponse;
    }

    // Si le retry échoue aussi, lancer une erreur au lieu de retourner une réponse invalide
    const errorMessage = `La validation a échoué après retry. Raison: ${retryValidation.reason || validation.reason || 'Erreur de validation non spécifiée'}`;
    console.error('❌ Validation échouée après retry:', errorMessage);
    throw new Error(errorMessage);
  }

  /**
   * Générer une réponse IA basée sur le contexte de la conversation
   */
  protected async _generateAIResponse(
    context: HowanaContext, 
    userMessage: string, 
    forceSummaryToolCall:boolean = false, 
    toolsAllowed: boolean = true, 
    recursionAllowed: boolean = true, 
    toolResults?: Array<{ tool_call_id: string; tool_name?: string; output: any }>,
    useSchemaWithToolResults: boolean = true,
  ): Promise<T> {
    try {
      console.log('🔍 Génération d\'une nouvelle réponse IA pour la conversation:', context.id);
      console.log(`🔍 Paramètres => forceSummaryToolCall: ${forceSummaryToolCall}, toolsAllowed: ${toolsAllowed}, recursionAllowed: ${recursionAllowed}, toolResults: ${!!toolResults}, useSchemaWithToolResults: ${useSchemaWithToolResults}`);
      console.log('Dernier message de l\'utilisateur:', userMessage);

      // Vérifier s'il y a un callID dans le contexte pour référencer l'appel précédent
      const previousCallId = context.previousCallId;
      
      if (!previousCallId) {
        throw new Error('Aucun previousCallId trouvé dans le contexte. Impossible de générer une réponse sans référence à la conversation précédente.');
      }

      // Utiliser exclusivement l'API responses pour référencer l'appel précédent
      console.log('🔍 Utilisation de l\'API responses avec callID:', previousCallId);
      
      // Déterminer le schéma de sortie approprié
      let outputSchema: ChatBotOutputSchema | null = null;

      if(toolResults && toolResults.length > 0) {
      
        if(useSchemaWithToolResults) {
          // Chercher le premier outil de type "response"
          const firstResponseToolName = this.findFirstResponseTool(toolResults, context);
          
          if (firstResponseToolName) {
            // Utiliser le schéma de l'outil de type "response"
            outputSchema = this.getSchemaByUsedTool(firstResponseToolName, context, forceSummaryToolCall);
            console.log(`🔧 Utilisation du schéma de l'outil "response": ${firstResponseToolName}`);
          } else {
            // Fallback vers le schéma par défaut
            outputSchema = this.getAddMessageOutputSchema(context, forceSummaryToolCall);
            console.log('🔧 Aucun outil "response" trouvé, utilisation du schéma par défaut');
          }
        }

      } else {

        outputSchema = this.getAddMessageOutputSchema(context, forceSummaryToolCall);

      }
      
      const toolsDescription = toolsAllowed ? this.getToolsDescription(context, forceSummaryToolCall, false) : null;
      const toolUseGuidance = toolsAllowed ? this.buildToolUseSystemPrompt(context) : null;
      
      // Déterminer les paramètres d'appel à l'IA selon le contexte
      let apiCallParams: any;
      
      console.log("Have toolsResults: ", toolResults && toolResults.length > 0);

      if (toolResults && toolResults.length > 0) {
        // Enchaînement : utiliser uniquement les résultats d'outils
        const toolResultInputs = this.transformToolResultsToMessage(toolResults);
        apiCallParams = {
          model: this.AI_MODEL,
          previous_response_id: previousCallId,
          input: toolResultInputs,
          ...(outputSchema && { text: outputSchema })
        };

      } else {
        // Comportement normal : message utilisateur + consignes système + outils
        // Vérifier si des intentResults sont présents pour les ajouter aux métadonnées
        const currentIntentInfos = context.metadata?.['currentIntentInfos'] as any;
        const intent = currentIntentInfos?.intent;
        const intentResults = context.metadata?.['intentResults'];
        const globalIntentInfos = context.metadata?.['globalIntentInfos'];
        
        // Construire le texte de contexte intent et l'ajouter au message ET dans les métadonnées pour le tracing
        let intentContextText = '';
        if (intent) {
          intentContextText = `\n\n[CONTEXTE INTENT ET RÉSULTATS DE RECHERCHE]\n` +
            `Intent calculé: ${JSON.stringify(intent, null, 2)}`;
          
          if (globalIntentInfos) {
            intentContextText += `\nInformations cumulées d'intent: ${JSON.stringify(globalIntentInfos, null, 2)}`;
          }
          
          if (intentResults) {
            intentContextText += `\nRésultats de recherche suite au dernier message de l'utilisateur: ${JSON.stringify(intentResults, null, 2)}`;
          }
          
          // Mettre à jour intentContextText dans currentIntentInfos
          context.metadata = {
            ...context.metadata,
            ['currentIntentInfos']: {
              ...currentIntentInfos,
              intentContextText: intentContextText
            }
          };
        }

        const baseInputs = [
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage + intentContextText }],
          },
          ...(toolUseGuidance
            ? [{
                type: "message",
                role: "system",
                content: [{ type: "input_text", text: toolUseGuidance }],
                status: "completed",
              } as any]
            : []),
        ];

        apiCallParams = {
          model: this.AI_MODEL,
          previous_response_id: previousCallId,
          input: baseInputs,
          ...(outputSchema && { text: outputSchema }),
          ...(toolsDescription && { tools: toolsDescription.tools.map(tool => tool.description), tool_choice: 'auto' })
        };
      }

      console.log("Final output schema => ", JSON.stringify(outputSchema));

      // Appel unifié à l'API
      const result = await this.openai.responses.create(apiCallParams);

      console.log('🔍 Réponse raw IA:', result);

      const messageId = result.id;

      // Extraire le coût (nombre de tokens) de cet appel
      const currentCallTokens = result.usage?.total_tokens ?? 0;
      let totalTokens = currentCallTokens;

      // Vérifier si l'IA demande l'exécution d'un outil (seulement si les outils sont autorisés)
      const toolCalls = toolsAllowed ? result.output.filter(output => output.type === "function_call") : [];
      let extractedData:ExtractedRecommandations|undefined = undefined;

      if (toolCalls.length > 0 && toolsAllowed) {
        console.log('🔧 Outils demandés par l\'IA:', toolCalls);

        // Exécuter les outils et extraire les résultats
        const { toolResults, extractedData: extractedDataFromTools } = await this.executeToolsAndExtractResults(toolCalls, context);
        extractedData = extractedDataFromTools;

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
            // Vérifier s'il y a un outil de type "response"
            const firstResponseToolName = this.findFirstResponseTool(validToolResults, context);
            
            if (firstResponseToolName) {
              // Il y a un outil de type "response" - faire un appel récursif
              console.log(`🔧 Outil "response" trouvé: ${firstResponseToolName}, appel récursif`);
              
              // Mettre à jour le contexte avec le nouveau messageId
              context.previousCallId = messageId;
              
              // Appel récursif avec les résultats des outils
              const finalResponse = (
                await this._generateAIResponse(
                  context, 
                  "", 
                  false, 
                  recursionAllowed && toolsAllowed, 
                  recursionAllowed, 
                  validToolResults,
                  useSchemaWithToolResults,
                )
              );
              
              // Cumuler le coût de l'appel récursif
              const recursiveTokens = finalResponse.cost ?? 0;
              totalTokens += recursiveTokens;
              
              console.log('🔍 Réponse finale IA après exécution des outils:', finalResponse.response);
              console.log('🔍 MessageID final OpenAI:', finalResponse.messageId);
              console.log(`💰 Coût cumulé: ${currentCallTokens} + ${recursiveTokens} = ${totalTokens} tokens`);

              return {
                ...finalResponse,
                response: finalResponse.response,
                messageId: finalResponse.messageId,
                extractedData: this.mergeExtractedData(extractedData, finalResponse.extractedData),
                updatedContext: finalResponse.updatedContext,
                cost: totalTokens, // Coût total cumulé
              } as T;
            } else {
              // Aucun outil de type "response" - refaire un appel avec le contexte enrichi
              console.log('🔧 Aucun outil "response" trouvé, refaire un appel avec contexte enrichi');
              
              // Formater les résultats d'outils en contexte
              const contextHints = this.formatToolResultsAsContext(validToolResults, context);
              
              // Construire le message utilisateur enrichi
              const enrichedUserMessage = userMessage + (contextHints ? `\n\n${contextHints}` : '');
              
              // Faire un nouvel appel sans changer le previousCallId
              const finalResponse = await this._generateAIResponse(
                context, 
                enrichedUserMessage, 
                false, 
                recursionAllowed && toolsAllowed, 
                recursionAllowed, 
                undefined, // Pas de toolResults
                useSchemaWithToolResults // Pas de schéma avec toolResults
              );
              
              // Cumuler le coût de l'appel récursif
              const recursiveTokens = finalResponse.cost ?? 0;
              totalTokens += recursiveTokens;
              
              console.log('🔍 Réponse finale IA avec contexte enrichi:', finalResponse.response);
              console.log('🔍 MessageID final OpenAI:', finalResponse.messageId);
              console.log(`💰 Coût cumulé: ${currentCallTokens} + ${recursiveTokens} = ${totalTokens} tokens`);

              return {
                ...finalResponse,
                response: finalResponse.response,
                messageId: finalResponse.messageId,
                extractedData: this.mergeExtractedData(extractedData, finalResponse.extractedData),
                updatedContext: finalResponse.updatedContext,
                cost: totalTokens, // Coût total cumulé
              } as T;
            }
          }
        }
      }

      // Traitement unifié de la réponse (avec ou sans outils exécutés)
      const processedResponse = this.processAIResponse(result, messageId, extractedData, context);
      
      // Remplacer le coût par le coût total cumulé (qui inclut déjà les appels récursifs s'il y en a eu)
      return {
        ...processedResponse,
        cost: totalTokens, // Coût total cumulé (inclut les appels récursifs)
      } as T;

    } catch (error) {
      console.error('❌ Erreur lors de la génération de la réponse IA:', error);
      throw new Error(`Erreur lors de la génération de la réponse IA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Générer un résumé structuré de la conversation
   */
  async generateConversationSummary(context: HowanaContext): Promise<{summary: string, extractedData: ExtractedRecommandations|undefined, updatedContext: HowanaContext, cost?: number | null}> {
    let totalTokens = 0; // Coût total cumulé (déclaré en dehors du try pour être accessible dans le catch)
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
          recommendationResponse = await this._generateAIResponse(context, explicitRequest, true);
          extractedData = recommendationResponse?.extractedData;
          
          // Cumuler le coût de l'appel de recommandations
          const recommendationTokens = recommendationResponse?.cost ?? 0;
          totalTokens += recommendationTokens;
          
          console.log('🔧 Réponse IA avec recommandations générée (we will only use tool data):', recommendationResponse);
          console.log(`💰 Coût des recommandations: ${recommendationTokens} tokens`);
          
          // Ajouter immédiatement les extractedData au contexte pour que getSummaryOutputSchema puisse y accéder
          if (extractedData) {
            context = this.enrichContext(context, { extractedData });
          }
          
        } catch (error) {
          console.error('❌ Erreur lors de la génération des recommandations:', error);
        }
      }

      console.log("RecommendationResponse.messageId", recommendationResponse?.messageId);
      console.log("context.previousCallId", context.previousCallId);

      // Vérifier s'il y a un callID dans le contexte pour référencer l'appel précédent
      const previousCallId = recommendationResponse?.messageId || context.previousCallId;
      
      if (!previousCallId) {
        throw new Error('No previous call ID found');
      }

      // Utiliser l'API responses pour référencer l'appel précédent
      console.log('🔍 Génération du résumé via API responses avec callID:', previousCallId);
      
      try {
        const systemPrompt = this.buildSummarySystemPrompt(context);
        const conversationText = (context.messages || [])
          .map((msg: any) => `${msg.type === 'user' ? 'Utilisateur' : 'Assistant'}: ${msg.content}`)
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

        // Cumuler le coût de l'appel de résumé
        const summaryTokens = result.usage?.total_tokens ?? 0;
        totalTokens += summaryTokens;
        console.log(`💰 Coût du résumé: ${summaryTokens} tokens, coût total: ${totalTokens} tokens`);

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
              updatedContext: context,
              cost: totalTokens, // Coût total cumulé
            };
          } catch (parseError) {
            console.warn('⚠️ Erreur de parsing JSON, fallback vers résumé simple:', parseError, resultText);
          }
        }
      } catch (responseError) {
        console.warn('⚠️ Erreur avec l\'API responses, fallback vers chat classique:', responseError);
      }

      return {
        summary: "Résumé de la conversation généré automatiquement.",
        extractedData,
        updatedContext: context,
        cost: totalTokens, // Coût total cumulé (peut être 0 si aucune recommandation n'a été générée)
      };
      
    } catch (error) {
      console.error('❌ Erreur lors de la génération du résumé:', error);
      return {
        summary: "Résumé de la conversation généré automatiquement.",
        extractedData: { activities: [], practices: [] },
        updatedContext: context,
        cost: totalTokens, // Coût cumulé jusqu'à l'erreur
      };
    }
  }

  /**
   * Règles communes à tous les services
   */
  protected getCommonRules(): string {
    return `Règles importantes:
    - Réponds toujours en français
    - Sois concis mais utile
    - Reste professionnel et bienveillant
    - Si tu ne sais pas quelque chose, dis-le honnêtement`;
  }

  /**
   * Récupère et formate les règles IA spécifiques au type de conversation
   * @param contextType Type de contexte de conversation
   * @param defaultRules Règles par défaut à utiliser si aucune règle IA n'est trouvée
   * @returns Tableau de règles IA prêt à être ajouté au prompt
   */
  protected async getIaRules(contextType: string, defaultRules: string[]): Promise<string[]> {
    try {
      const iaRulesResult = await this.supabaseService.getIARules(contextType);
      if (iaRulesResult.success && iaRulesResult.data && iaRulesResult.data.length > 0) {
        // Filtrer seulement les règles actives
        const activeRules = iaRulesResult.data.filter((rule) => rule.isActive);
        
        if (activeRules.length > 0) {
          // Trier les règles par priorité (priorité 1 = plus forte)
          const sortedRules = activeRules.sort((a, b) => a.priority - b.priority);
          
          const rulesArray: string[] = [];
          sortedRules.forEach((rule) => {
            rulesArray.push(`${rule.name}:\n${rule.description}`);
          });
          return rulesArray;
        }
      }
      
      // Si aucune règle active trouvée, utiliser les règles par défaut
      return defaultRules;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des règles IA:', error);
      // En cas d'erreur, utiliser les règles par défaut
      return defaultRules;
    }
  }

  /**
   * Méthode généralisée pour construire le prompt système
   */
  protected async buildSystemPrompt(context: HowanaContext): Promise<string> {
    // Récupérer les règles IA (format tableau)
    const rules = await this.getIaRules(context.type, this.getDefaultRules());
    
    // Récupérer le contexte système
    const systemContext = await this.getSystemContext(context);
    
    // Combiner les règles et le contexte
    return rules.join('\n\n') + '\n\n' + systemContext;
  }

  /**
   * Méthodes abstraites à implémenter dans les classes enfants
   */
  protected abstract getDefaultRules(): string[];
  protected abstract getSystemContext(context: HowanaContext): Promise<string>;
  protected abstract buildFirstUserPrompt(context: HowanaContext): string;
  protected abstract buildSummarySystemPrompt(context: HowanaContext): string;
  protected abstract getSummaryOutputSchema(context: HowanaContext): ChatBotOutputSchema;
  
  /**
   * Valide une réponse IA générée
   * @param response La réponse IA à valider
   * @param context Le contexte de la conversation
   * @returns Un objet contenant isValid (boolean), reason (string optionnel) et finalObject (T optionnel)
   */
  protected abstract validateResponse(response: T, context: HowanaContext): Promise<{
    isValid: boolean;
    reason?: string;
    finalObject?: T;
  }>;
  
  /**
   * Schéma de sortie pour startConversation (null si pas de schéma spécifique)
   */
  protected abstract getStartConversationOutputSchema(context: HowanaContext): ChatBotOutputSchema;
  
  /**
   * Schéma de sortie pour le calcul d'intent (null si pas de schéma spécifique)
   * Chaque service doit définir sa propre structure d'intent
   */
  protected abstract getIntentSchema(context: HowanaContext): ChatBotOutputSchema;
  
  /**
   * Calcule le globalIntentInfos à partir de l'intent courant et du contexte
   * @param intent L'intent calculé par computeIntent
   * @param context Le contexte de la conversation
   * @returns Le globalIntentInfos calculé
   */
  protected abstract computeGlobalIntentInfos(intent: any, context: HowanaContext): Promise<any>;
  
  /**
   * Schéma de sortie pour addMessage (par défaut avec un champ response obligatoire)
   */
  protected getFirstMessageOutputSchema(_context: HowanaContext): ChatBotOutputSchema {
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

  protected getWelcomeMessageOutputSchema(_context: HowanaContext): ChatBotOutputSchema {
    return {
      format: { 
        type: "json_schema",
        name: "BaseChatBotResponse",
        schema: {
          type: "object",
          properties: {
            response: {
              type: "string",
              description: "Réponse principale de l'assistant, très courte (2 phrases maximum)"
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
  protected getAddMessageOutputSchema(_context: HowanaContext, _forceSummaryToolCall:boolean = false): ChatBotOutputSchema {
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
  protected getSchemaByUsedTool(_toolName: string, context: HowanaContext, _forceSummaryToolCall:boolean = false): ChatBotOutputSchema {
    // Par défaut, utiliser le schéma de base
    return this.getAddMessageOutputSchema(context);
  }

  /**
   * Trouve le premier outil de type "response" dans les résultats d'outils
   * @param toolResults Liste des résultats d'outils
   * @param context Contexte de la conversation
   * @returns Le nom du premier outil de type "response" ou null si aucun trouvé
   */
  protected findFirstResponseTool(toolResults: Array<{ tool_call_id: string; tool_name?: string; output: any }>, context: HowanaContext): string | null {
    if (!toolResults || toolResults.length === 0) {
      return null;
    }

    // Récupérer la description des outils pour connaître leur type d'usage
    const toolsDescription = this.getToolsDescription(context, false, false);
    if (!toolsDescription || !toolsDescription.tools) {
      return null;
    }

    // Créer un map des noms d'outils vers leur type d'usage
    const toolUsageMap = new Map<string, "context" | "response">();
    toolsDescription.tools.forEach(tool => {
      const toolName = tool.description.name;
      if (toolName) {
        toolUsageMap.set(toolName, tool.usage);
      }
    });

    // Chercher le premier outil de type "response" dans les résultats
    for (const toolResult of toolResults) {
      const toolName = toolResult.tool_name || this.extractToolNameFromCallId(toolResult.tool_call_id || '');
      if (toolName && toolUsageMap.get(toolName) === "response") {
        console.log(`🔧 Premier outil de type "response" trouvé: ${toolName}`);
        return toolName;
      }
    }

    console.log('🔧 Aucun outil de type "response" trouvé dans les résultats');
    return null;
  }

  /**
   * Formate les résultats d'outils en contexte structuré pour l'IA
   * @param toolResults Liste des résultats d'outils
   * @param context Contexte de la conversation
   * @returns Contexte structuré sous forme de string
   */
  protected formatToolResultsAsContext(toolResults: Array<{ tool_call_id: string; tool_name?: string; output: any }>, context: HowanaContext): string {
    if (!toolResults || toolResults.length === 0) {
      return '';
    }

    // Récupérer la description des outils pour avoir les noms complets
    const toolsDescription = this.getToolsDescription(context, false, false);
    const toolNameMap = new Map<string, string>();
    if (toolsDescription && toolsDescription.tools) {
      toolsDescription.tools.forEach(tool => {
        const toolName = tool.description.name;
        const toolDescription = tool.description.description;
        if (toolName) {
          toolNameMap.set(toolName, toolDescription);
        }
      });
    }

    let contextHints = 'SUGGESTIONS CALCULÉES PAR LA PLATEFORME (ces informations ont été générées automatiquement par nos algorithmes comme potentiellement intéressantes, mais nous n\'en sommes pas certains. C\'est à toi, l\'IA, de décider si elles sont pertinentes pour la situation de l\'utilisateur ou non. IMPORTANT: Ces données sont pour ton analyse interne uniquement - ne les recrache pas telles quelles à l\'utilisateur. Utilise-les avec tact et profondeur pour découvrir ses centres d\'intérêt et évoquer brièvement les éléments pertinents dans ta conversation):\n\n';
    
    toolResults.forEach((toolResult, index) => {
      const toolName = toolResult.tool_name || this.extractToolNameFromCallId(toolResult.tool_call_id || '');
      const toolDescription = toolName ? toolNameMap.get(toolName) : 'Outil inconnu';
      
      contextHints += `--- Résultat ${index + 1}: ${toolName || 'Outil inconnu'} ---\n`;
      if (toolDescription) {
        contextHints += `Description: ${toolDescription}\n`;
      }
      
      // Formater la sortie de l'outil
      let formattedOutput = '';
      if (typeof toolResult.output === 'string') {
        formattedOutput = toolResult.output;
      } else if (typeof toolResult.output === 'object') {
        try {
          formattedOutput = JSON.stringify(toolResult.output, null, 2);
        } catch (error) {
          formattedOutput = String(toolResult.output);
        }
      } else {
        formattedOutput = String(toolResult.output);
      }
      
      contextHints += `Données: ${formattedOutput}\n\n`;
    });

    return contextHints.trim();
  }



  /**
   * Description des outils disponibles pour l'IA (null si pas d'outils)
   */
  protected abstract getToolsDescription(context: HowanaContext, forceSummaryToolCall:boolean, forWoo:boolean): OpenAIToolsDescription | null;

  /**
   * Exécuter un outil spécifique
   */
  protected abstract callTool(toolName: string, toolArgs: any, context: HowanaContext): Promise<any>;

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
  protected recommendationRequiredForSummary(_context: HowanaContext): boolean {
    // Par défaut, pas de recommandations requises
    return false;
  }

  /**
   * Lignes directrices (system) sur l'utilisation des outils lors des réponses suivantes
   * Par défaut, aucune consigne. Les classes enfants peuvent surcharger pour orienter l'appel d'outils.
   */
  protected buildToolUseSystemPrompt(_context: HowanaContext): string {
    return '';
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

  /**
   * Transforme les résultats d'outils en format de message pour l'API OpenAI
   * @param toolResults Résultats des outils à transformer
   * @returns Liste d'inputs formatés pour l'API responses
   */
  protected transformToolResultsToMessage(toolResults: Array<{ tool_call_id: string; tool_name?: string; output: any }>): Array<{ type: "function_call_output"; call_id: string; output: string }> {
    return toolResults
      .filter(r => !!r.tool_call_id)
      .map(r => ({
        type: "function_call_output" as const,
        call_id: r.tool_call_id,
        output: typeof r.output === 'string' ? r.output : JSON.stringify(r.output)
      }));
  }

  /**
   * Fusionne les données extraites en évitant les doublons basés sur l'ID
   * @param extractedData1 Première source de données extraites
   * @param extractedData2 Deuxième source de données extraites
   * @returns Données extraites fusionnées sans doublons
   */
  protected mergeExtractedData(
    extractedData1: ExtractedRecommandations | undefined,
    extractedData2: ExtractedRecommandations | undefined
  ): ExtractedRecommandations {
    const mergeItems = (items1: any[], items2: any[]) => {
      const merged = [...items1];
      const existingIds = new Set(items1.map(item => item.id));
      
      items2.forEach(item => {
        if (!existingIds.has(item.id)) {
          merged.push(item);
        }
      });
      
      return merged;
    };

    return {
      activities: mergeItems(
        extractedData1?.activities ?? [],
        extractedData2?.activities ?? []
      ),
      practices: mergeItems(
        extractedData1?.practices ?? [],
        extractedData2?.practices ?? []
      )
    };
  }

  /**
   * Exécute les outils demandés et extrait les résultats
   * @param toolCalls Liste des appels d'outils à exécuter
   * @param context Contexte de la conversation
   * @returns Résultats des outils et données extraites
   */
  protected async executeToolsAndExtractResults(
    toolCalls: any[],
    context: HowanaContext
  ): Promise<{
    toolResults: Array<{ tool_call_id: string; tool_name: string; output: any }>;
    extractedData: ExtractedRecommandations | undefined;
  }> {
    const toolResults = [];
    let extractedData: ExtractedRecommandations | undefined = undefined;

    for (const toolCall of toolCalls) {
      if (toolCall.type === "function_call") {
        console.log("Find tool to call: ", toolCall.id, toolCall.call_id, toolCall.name);
        context.metadata['requestedTools'] = [...(context.metadata['requestedTools'] ?? []), toolCall.name];
      
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
          const currentExtractedData = this.extractFromToolResult(toolCall.call_id, toolCall.name, toolResult);
          
          // Fusionner les données extraites
          extractedData = this.mergeExtractedData(extractedData, currentExtractedData);
          
          // Stocker les données extraites dans le résultat pour utilisation ultérieure
          toolResults.push({
            tool_call_id: toolCall.call_id,
            tool_name: toolCall.name,
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

    return { toolResults, extractedData };
  }

  /**
   * Traitement unifié de la réponse IA
   * @param result Résultat de l'API OpenAI
   * @param messageId ID du message
   * @param extractedData Données extraites des outils
   * @param context Contexte de la conversation
   * @returns Réponse IA formatée
   */
  protected processAIResponse(
    result: Response, 
    messageId: string, 
    extractedData: ExtractedRecommandations | undefined, 
    context: HowanaContext
  ): T {
    const messageOutput = result.output.find((output) => output.type === "message");
    
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

    console.log('🔍 Réponse raw IA:', resultText);

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

    // Extraire le nombre de tokens depuis la réponse OpenAI
    const totalTokens = result.usage?.total_tokens ?? null;
    if (totalTokens) {
      console.log(`💰 Nombre de tokens utilisés: ${totalTokens}`);
    }

    // Retourner la réponse parsée avec le messageId et le nombre de tokens
    return {
      ...parsedResponse,
      extractedData,
      messageId,
      updatedContext: context,
      haveNext: false,
      cost: totalTokens, // Stocker le nombre de tokens dans le champ cost
    } as T;
  }

  /**
   * Récupère et formate les pratiques HOW PASS disponibles
   */
  protected async getAvailablePracticesContext(): Promise<string> {
    try {
      console.log('🔍 Récupération des pratiques HOW PASS disponibles');
      
      const result = await this.supabaseService.getAllAvailablePractices();
      
      if (!result.success || !result.data || result.data.length === 0) {
        console.warn('⚠️ ReWOO: Aucune pratique HOW PASS récupérée');
        return 'PRATIQUES HOW PASS DISPONIBLES: Aucune pratique disponible pour le moment.';
      }

      const practicesList = result.data.map(practice => `- ${practice.title}`).join('\n');
      
      console.log(`✅ ${result.data.length} pratiques HOW PASS récupérées`);
      
      return `PRATIQUES HOW PASS DISPONIBLES:
A titre d'information, voici la liste complète des pratiques de bien-être disponibles sur la plateforme HOW PASS :
${practicesList}`;

    } catch (error) {
      console.error('❌ ReWOO: Erreur lors de la récupération des pratiques HOW PASS:', error);
      return 'PRATIQUES HOW PASS DISPONIBLES: Erreur lors de la récupération des pratiques.';
    }
  }
  
  /**
   * Enrichit le contexte avec les données extraites
   * @param context Le contexte de conversation à enrichir
   * @param data Objet contenant les données à ajouter au contexte
   * @param data.extractedData Les données extraites contenant les activités et pratiques
   */
  protected enrichContext(context: HowanaContext, data: { extractedData?: any }): HowanaContext {
    if (!data || !data.extractedData) {
      console.warn('⚠️ Aucune extractedData fournie pour enrichir le contexte');
      return context;
    }

    const { extractedData } = data;
    const recommendations = {
      activities: extractedData.activities || [],
      practices: extractedData.practices || []
    };
    
    // Mettre à jour le contexte avec les recommandations
    context.recommendations = recommendations;
    context.hasRecommendations = (recommendations.activities.length > 0 || recommendations.practices.length > 0);
    
    console.log('📋 Contexte enrichi avec les recommandations:', recommendations);

    return context;

  }

  /**
   * Calcule l'intent de la conversation en parallèle de la génération de réponse
   * @param context Le contexte de la conversation
   * @param userMessage Le dernier message de l'utilisateur
   * @returns L'intent calculé selon le schéma défini par le service, le coût (nombre de tokens) et le globalIntentInfos
   */
  public async computeIntent(context: HowanaContext, userMessage: string): Promise<{ intent: any; intentCost: number | null; globalIntentInfos: any }> {
    try {
      console.log('🎯 Calcul de l\'intent pour la conversation:', context.id);
      
      // Récupérer le schéma d'intent spécifique au service
      const intentSchema = this.getIntentSchema(context);
      
      if (!intentSchema) {
        console.warn('⚠️ Aucun schéma d\'intent défini pour ce service, retour d\'un intent vide');
        return { intent: null, intentCost: null, globalIntentInfos: null };
      }

      // Construire le prompt pour l'analyse d'intent
      const conversationText = (context.messages || [])
        .map((msg: any) => `${msg.type === 'user' ? 'Utilisateur' : 'Assistant'}: ${msg.content}`)
        .join('\n');
      
      const intentPrompt = `Analyse cette conversation et le dernier message de l'utilisateur pour déterminer l'intent actuel de la conversation.

CONVERSATION:
${conversationText}

DERNIER MESSAGE UTILISATEUR:
${userMessage}

Détermine l'intent actuel de l'utilisateur basé sur le contexte de la conversation et son dernier message.`;

      // Utiliser l'API responses pour calculer l'intent
      const result = await this.openai.responses.create({
        model: this.AI_MODEL,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: intentPrompt }],
          },
        ],
        ...(intentSchema && { text: intentSchema })
      });

      // Extraire le coût (nombre de tokens) de l'appel d'intent
      const intentCost = result.usage?.total_tokens ?? null;
      if (intentCost) {
        console.log(`💰 Coût du calcul d'intent: ${intentCost} tokens`);
      }

      // Extraire le texte de la réponse
      const messageOutput = result.output.find((output: any) => output.type === "message") as any;
      let resultText = "";
      
      if (messageOutput?.content?.[0]) {
        const content = messageOutput.content[0];
        if ('text' in content) {
          resultText = content.text;
        }
      }

      if (!resultText) {
        console.warn('⚠️ Aucune réponse générée pour l\'intent');
        return { intent: null, intentCost: intentCost, globalIntentInfos: null };
      }

      // Parser le JSON de l'intent
      try {
        const parsedIntent = JSON.parse(resultText);
        console.log('✅ Intent calculé avec succès:', JSON.stringify(parsedIntent, null, 2));
        
        // Calculer le globalIntentInfos en utilisant la fonction abstraite
        const globalIntentInfos = await this.computeGlobalIntentInfos(parsedIntent, context);
        
        return { intent: parsedIntent, intentCost: intentCost, globalIntentInfos: globalIntentInfos };
      } catch (parseError) {
        console.error('❌ Erreur de parsing JSON de l\'intent:', parseError);
        return { intent: null, intentCost: intentCost, globalIntentInfos: null };
      }

    } catch (error) {
      console.error('❌ Erreur lors du calcul de l\'intent:', error);
      // Ne pas faire échouer la génération de réponse si l'intent échoue
      return { intent: null, intentCost: null, globalIntentInfos: null };
    }
  }

  /**
   * Traite l'intent calculé et effectue les recherches nécessaires
   * Peut générer plusieurs réponses consécutives en appelant onIaResponse pour chaque réponse
   * @param intent L'intent calculé par computeIntent
   * @param context Le contexte de la conversation
   * @param userMessage Le message de l'utilisateur
   * @param onIaResponse Callback appelé pour chaque réponse IA générée (peut être appelé plusieurs fois pour des messages consécutifs)
   * @returns Promise<void> - La méthode doit attendre que toutes les réponses soient générées
   */
  protected async handleIntent(
    context: HowanaContext,
    userMessage: string,
    onIaResponse: (response: any) => Promise<void>
  ): Promise<HowanaContext> {
    // Implémentation par défaut : génère une réponse IA et la passe au callback
    const aiResponse = await this.generateAIResponse(context, userMessage);
    await onIaResponse(aiResponse);
    return context;
  }
}
