import { ConversationService } from './ConversationService';
import { SupabaseService } from './SupabaseService';
import { ConversationContext, StartConversationRequest, AddMessageRequest, AIRule } from '../types/conversation';
import OpenAI from 'openai';


const ActivitySummaryJsonOutputSchema = {
  type: "object",
  properties: {
    // Pour ActivityDetailsStep
    shortDescription: {
      type: "string",
      description: "Description courte et accrocheuse de l'activité, mettant en avant ce qui la rend unique (max 200 caractères)."
    },
    longDescription: {
      type: "string", 
      description: "Description détaillée de l'activité expliquant le déroulement, l'approche et ce que vivront les participants (max 500 caractères)."
    },
    title: {
      type: "string",
      description: "Titre optimisé et descriptif de l'activité (max 100 caractères)."
    },
    
    // Pour ActivityKeywordsStep
    selectedKeywords: {
      type: "array",
      items: { type: "string" },
      description: "Liste des mots-clés les plus pertinents pour cette activité."
    },
    
    // Pour ActivitySummaryStep (uniquement benefits)
    benefits: {
      type: "array",
      items: { type: "string" },
      description: "Liste des bénéfices concrets et mesurables que les participants peuvent attendre de cette activité."
    },
    
    // Nouveau champ pour décrire la situation idéale
    typicalSituations: {
      type: "string",
      description: "Description de la situation idéale d'un utilisateur qui serait à même de profiter pleinement de cette pratique. Inclure le profil psychologique, les expériences vécues, les besoins spécifiques, etc."
    },

  },
  required: ["shortDescription", "longDescription", "title", "selectedKeywords", "benefits", "typicalSituations"],
  additionalProperties: false
};


export class ChatBotService {
  private conversationService: ConversationService;
  private supabaseService: SupabaseService;
  private openai: OpenAI;
  private AI_MODEL = "gpt-4o-mini";
  private AI_MODEL_QUALITY = "gpt-4o-mini";

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
   * Générer une réponse IA basée sur le contexte de la conversation
   */
  private async generateAIResponse(context: ConversationContext, userMessage: string): Promise<{ response: string; messageId: string | undefined }> {
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
      
      const result = await this.openai.responses.create({
        model: this.AI_MODEL,
        previous_response_id: previousCallId,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage }],
          },
        ],
      });
      const messageId =  result.id

      // Récupérer le messageId du nouveau résultat de type "message"
      const messageOutput = result.output.find(output => output.type === "message");

      // Extraire le texte de la réponse en gérant les types
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

      console.log('🔍 Réponse IA via API responses:', resultText);
      console.log('🔍 OutputID OpenAI:', messageId);

      return { 
        response: resultText, 
        messageId 
      };

    } catch (error) {
      console.error('❌ Erreur lors de la génération de la réponse IA:', error);
      throw new Error(`Erreur lors de la génération de la réponse IA: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Générer un résumé structuré de la conversation pour les activités
   */
  async generateConversationSummary(context: ConversationContext): Promise<any> {
    try {
      // Vérifier s'il y a un callID dans le contexte pour référencer l'appel précédent
      const previousCallId = context.metadata?.['previousCallId'];
      
      if(!previousCallId) {
        throw new Error('No previous call ID found');
      }

      if (context.type === 'activity') {
        // Utiliser l'API responses pour référencer l'appel précédent
        console.log('🔍 Génération du résumé via API responses avec callID:', previousCallId);
        
        try {
          const systemPrompt = `Tu es un assistant spécialisé dans l'analyse de conversations entre praticiens et experts. 
          Analyse la conversation et génère un résumé structuré qui permettra de remplir automatiquement les formulaires d'activité.`;

          const conversationText = context.messages
            .map(msg => `${msg.type === 'user' ? 'Utilisateur' : 'Assistant'}: ${msg.content}`)
            .join('\n');

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
            text: {
              format: { 
                type: "json_schema",
                name: "ActivitySummary",
                schema: ActivitySummaryJsonOutputSchema,
                strict: true
              }
            }
          });

          const resultText = result.output
            .filter((output) => output.type === "message")
            .map((output) => (output as any).content?.[0]?.text)[0];

          if (resultText) {
            try {
              const parsedSummary = JSON.parse(resultText);
              console.log('🔍 Résumé structuré généré:', parsedSummary);
              return parsedSummary;
            } catch (parseError) {
              console.warn('⚠️ Erreur de parsing JSON, fallback vers résumé simple:', parseError);
            }
          }
        } catch (responseError) {
          console.warn('⚠️ Erreur avec l\'API responses, fallback vers chat classique:', responseError);
        }
      }

      
    } catch (error) {
      console.error('❌ Erreur lors de la génération du résumé:', error);
      return {
        summary: "Résumé de la conversation généré automatiquement."
      };
    }
  }

  /**
   * Générer une première réponse IA basée sur le contexte de la conversation
   */
  private async generateFirstResponse(context: ConversationContext): Promise<{ response: string; messageId: string | undefined }> {
    try {

      console.log('🔍 Génération de la première réponse IA pour la conversation:', context.id);

      const systemPrompt = this.buildSystemPrompt(context);
      
      let userPrompt = "Salue l'utilisateur et présente-toi brièvement en tant qu'assistant Howana.";
      
      // Personnaliser le prompt selon le type de conversation et les données disponibles
      if (context.type === 'activity' && context.activityData) {
        userPrompt = `Salue le praticien et présente-toi en tant qu'assistant Howana spécialisé dans l'accompagnement des praticiens experts.
        
        Fais un petit état des lieux résumé de ce qui a été déclaré :
        - Activité : "${context.activityData.title}"
        ${context.activityData.shortDescription ? `- Description : ${context.activityData.shortDescription}` : ''}
        
        Indique que tu es là pour l'aider à compléter et optimiser sa déclaration d'activité.
        
        OBJECTIF SPÉCIFIQUE: Collecter les informations nécessaires pour générer automatiquement un résumé structuré avec:
        - Titre optimisé, descriptions (courte et détaillée), mots-clés, bénéfices, et profil utilisateur idéal.
        
        Commence par un accueil chaleureux et pose une première question engageante pour mieux comprendre son activité et commencer à établir la conformité avec sa pratique associée.`;
      } else if (context.type === 'bilan') {
        userPrompt = `Salue le praticien et présente-toi en tant qu'assistant Howana spécialisé dans l'accompagnement des praticiens experts.
        
        Indique que tu es là pour l'aider à faire un bilan approfondi de son activité ou de sa pratique.
        
        Commence par un accueil chaleureux et pose une première question engageante pour l'accompagner dans cette réflexion.`;
      }

      console.log('🔍 System prompt:', systemPrompt);
      console.log('🔍 Génération de la première réponse IA:', userPrompt);

      // Utiliser l'API responses pour la première réponse
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
      });

      // Récupérer le messageId du premier résultat de type "message"
      const messageOutput = result.output.find(output => output.type === "message");
      const messageId = result.id;
      
      // Extraire le texte de la réponse en gérant les types
      let response = "Bonjour ! Je suis Howana, votre assistant personnel spécialisé dans le bien-être. Comment puis-je vous aider aujourd'hui ?";
      if (messageOutput?.content?.[0]) {
        const content = messageOutput.content[0];
        if ('text' in content) {
          response = content.text;
        }
      }

      console.log('🔍 Première réponse IA via API responses:', response);
      console.log('🔍 MessageID OpenAI:', messageId);

      return { 
        response, 
        messageId 
      };
    } catch (error) {
      console.error('❌ Erreur lors de la génération de la première réponse:', error);
      return { 
        response: "Bonjour ! Je suis Howana, votre assistant personnel. Comment puis-je vous aider aujourd'hui ?",
        messageId: undefined
      };
    }
  }

  /**
   * Construire le prompt système basé sur le contexte
   */
  private buildSystemPrompt(context: ConversationContext): string {
    let basePrompt = `Tu es Howana, un assistant personnel spécialisé dans le bien-être et les activités de santé. 
    Tu es bienveillant et professionnel.`;

    // Règles de comportement et d'information spécifiques à respecter
    basePrompt += `\n\nRègles de comportement et d'information spécifiques à respecter :`;

    if (context.aiRules && Array.isArray(context.aiRules) && context.aiRules.length > 0) {
      // Filtrer seulement les règles actives
      const activeRules = context.aiRules.filter((rule: AIRule) => rule.isActive);
      
      if (activeRules.length > 0) {
        // Trier les règles par priorité (priorité élevée en premier)
        const sortedRules = activeRules.sort((a: AIRule, b: AIRule) => b.priority - a.priority);
        
        sortedRules.forEach((rule: AIRule, index: number) => {
          basePrompt += `\n${index + 1}. [${rule.type.toUpperCase()}] ${rule.name}: ${rule.description}`;
        });
      }
    } else if(context.type === 'activity') {
      // COMPORTEMENT PAR DÉFAUT : Howana experte des pratiques
      basePrompt += `\n1. [EXPERTISE] Expertise des pratiques: Tu es experte des pratiques de bien-être et de santé. 
      Ton objectif est d'aider à valider la cohérence entre l'activité et la pratique qui lui est associée.
      
      OBJECTIFS SPÉCIFIQUES POUR LE RÉSUMÉ STRUCTURÉ:
      Tu dois collecter des informations précises pour générer automatiquement un résumé structuré avec ces 6 éléments:
      
      A) TITRE (max 100 caractères): Un titre optimisé et descriptif de l'activité
      B) DESCRIPTION COURTE (max 200 caractères): Description accrocheuse mettant en avant l'unicité
      C) DESCRIPTION DÉTAILLÉE (max 500 caractères): Déroulement, approche et expérience des participants
      D) MOTS-CLÉS: Liste des termes les plus pertinents pour cette activité
      E) BÉNÉFICES: Liste des bénéfices concrets et mesurables pour les participants
      F) PROFIL IDÉAL: Description du profil psychologique et situation idéale de l'utilisateur cible
      
      STRATÉGIE DE COLLECTE:
      -Tu n'as le droit de poser qu'une seule question ou demade d'information dans chacune de tes réponses pour ne pas surcharger l'utilisateur.
      - Pose des questions ciblées pour chaque élément
      - Demande des exemples concrets et spécifiques
      - Vérifie la cohérence avec la pratique associée
      - Collecte des détails qui permettront de remplir automatiquement les formulaires`;
    } else /* bilan */ {
       // COMPORTEMENT PAR DÉFAUT : Howana analyste du mood et de l'état du jour
       basePrompt += `\n1. [ANALYSE] Analyse du mood et de l'état du jour: Tu es spécialisée dans l'analyse approfondie du bien-être quotidien. 
       Ton objectif est d'aider l'utilisateur à faire un bilan détaillé de son état du jour et de son mood, 
       en identifiant les points importants que l'analyse statique n'a pas vus.`;
     }

    // Ajouter le contexte de l'activité et de la pratique si disponible
    if (context.type === 'activity' && context.activityData) {
      basePrompt += `\n\nINFORMATIONS DE L'ACTIVITÉ (déclarées par le praticien):
      - Titre: "${context.activityData.title}"`;
      
      if (context.activityData.shortDescription) {
        basePrompt += `\n- Description courte: ${context.activityData.shortDescription}`;
      }
      if (context.activityData.longDescription) {
        basePrompt += `\n- Description détaillée: ${context.activityData.longDescription}`;
      }

      // Intégrer les informations de la pratique si disponibles
      if (context.activityData.practice) {
        const practice = context.activityData.practice;
        basePrompt += `\n\nPRATIQUE ASSOCIÉE (référentiel certifié):
        - Nom: ${practice.title}
        - Description courte: ${practice.shortDescription || 'Non disponible'}
        - Description détaillée: ${practice.longDescription || 'Non disponible'}`;
      }
      
      // Ajouter des instructions pour la collecte des informations manquantes
      basePrompt += `\n\nOBJECTIF DE LA CONVERSATION:
      Collecter les informations manquantes pour générer un résumé structuré complet.
      Vérifier et enrichir les informations existantes pour optimiser l'auto-remplissage des formulaires.
      
      POINTS D'ATTENTION:
      - Si des informations sont déjà présentes, demande des précisions ou des améliorations
      - Si des informations manquent, pose des questions ciblées pour les collecter
      - Assure-toi que chaque élément du résumé sera suffisamment détaillé et précis
      - Le format de sortie doit etre un texte adapté à un chat sur mobile`;
      
    } else if (context.type === 'bilan') {

       if (context.aiRules && Array.isArray(context.aiRules) && context.aiRules.length > 0) {
         basePrompt += `\n\nL'utilisateur fait un bilan de son état du jour et de son mood. Utilise ces informations pour appliquer tes règles personnalisées.`;
       } else {
         basePrompt += `\n\nL'utilisateur fait un bilan de son état du jour et de son mood. 
         Aide-le à approfondir son analyse pour identifier les points importants que l'analyse statique n'a pas vus.`;
       }
    
    }

    // Règles générales (toujours présentes)
    basePrompt += `\n\nRègles importantes:
    - Réponds toujours en français
    - Sois concis mais utile
    - Reste professionnel et bienveillant
    - Si tu ne sais pas quelque chose, dis-le honnêtement
    - L'échange doit contenir environ 10 questions maximum
    - Chaque réponse doit TOUJOURS contenir une question pertinente`;
    
    // Règles contextuelles spécifiques (uniquement si pas d'aiRules)
    if (!context.aiRules || !Array.isArray(context.aiRules) || context.aiRules.length === 0) {
      if (context.type === 'activity') {
        basePrompt += `
    - Ton objectif principal est d'aider le praticien à valider la conformité de son activité avec la pratique associée
    - Pose des questions pertinentes pour mieux comprendre l'activité et établir la conformité
    - Identifie le profil d'utilisateur idéal pour cette activité/pratique
    - Suggère des ajustements si nécessaire pour optimiser la synergie
    
    COLLECTE POUR LE RÉSUMÉ STRUCTURÉ:
    - Guide la conversation pour collecter les 6 éléments requis du résumé
    - Demande des précisions sur chaque aspect (titre, descriptions, mots-clés, bénéfices, profil cible)
    - Vérifie que les informations sont suffisamment détaillées pour l'auto-remplissage
    - Adapte tes questions selon les informations déjà fournies
    
    - IMPORTANT: L'échange doit se limiter à environ 10 questions maximum
    - Chaque réponse doit impérativement contenir une question pour maintenir l'engagement`;
             } else if (context.type === 'bilan') {
         basePrompt += `
     - Aide l'utilisateur à faire un bilan approfondi de son état du jour et de son mood
     - Identifie les points importants que l'analyse statique n'a pas vus
     - Approfondis pour comprendre les nuances et les détails significatifs
     - IMPORTANT: L'échange doit se limiter à environ 10 questions maximum
     - Chaque réponse doit impérativement contenir une question pour maintenir l'engagement`;
       }
    }

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
