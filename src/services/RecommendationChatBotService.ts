import { OpenAITool, OpenAIToolsDescription } from '../types/conversation';
import { HowanaContext, HowanaRecommandationContext } from '../types/repositories';
import { 
  ChatBotOutputSchema, 
  OpenAIJsonSchema,
  RecommendationMessageResponse,
  ExtractedRecommandations,
  RecommendationIntent,
  IntentResults,
  GlobalRecommendationIntentInfos,
  ActivityItem,
  PracticeItem,
  HowerAngelItem,
  FAQItem,
} from '../types/chatbot-output';
import { BaseChatBotService } from './BaseChatBotService';

export class RecommendationChatBotService extends BaseChatBotService<RecommendationMessageResponse> {
  
  /**
   * Constantes centralisées pour les noms d'intents
   */
  protected static readonly INTENT_NAMES = {
    SEARCH_HOWER_ANGEL: 'search_hower_angel',
    SEARCH_ACTIVITIES: 'search_activities',
    SEARCH_PRACTICE: 'search_practice',
    SEARCH_SYMPTOM: 'search_symptom',
    SEARCH_OTHER_ADVICE: 'search_other_advice',
    TAKE_RDV: 'take_rdv',
    DISCOVER: 'discover',
    KNOW_MORE: 'know_more',
    CONFIRMATION: 'confirmation'
  } as const;

  /**
   * Constantes centralisées pour les types de chunks
   */
  protected static readonly CHUNK_TYPES = {
    HOWER_ANGEL_NAME_INFO: 'hower_angel_name_info',
    USER_SITUATION_CHUNK: 'user_situation_chunk',
    I_HAVE_SYMPTOME_CHUNK: 'i_have_symptome_chunk',
    WITH_BENEFIT_CHUNK: 'with_benefit_chunk',
    CATEGORY_NAME_INFO: 'category_name_info'
  } as const;

  /**
   * Règles par défaut pour les recommandations (format tableau comme iaRules)
   */
  protected getDefaultRules(): string[] {
    return [
      "Tu es Howana, l'assistant exclusif du portail bien-être HOW PASS. Tu es bienveillant et professionnel. Réponses courtes (maximum 30 mots).",
      
      "[RECOMMANDATION] Expert en recommandations personnalisées: Tu es spécialisée dans l'analyse des besoins et la recommandation d'activités et de pratiques adaptées au profil de l'utilisateur sur la plateforme HOW PASS.",
      
      `OBJECTIFS SPÉCIFIQUES:
      - Analyser l'état émotionnel et les besoins de l'utilisateur
      - Recommander les activités et pratiques HOWPASS les plus pertinentes disponibles sur la plateforme
      - Fournir une analyse détaillée de l'état de l'utilisateur
      - Donner des suggestions personnalisées et adaptées`,
      
      `STRATÉGIE DE RECOMMANDATION:
      - Pose des questions ciblées pour comprendre les besoins
      - Analyse les préférences et contraintes de l'utilisateur
      - Propose des activités HOWPASS avec un score de pertinence
      - Explique le raisonnement derrière chaque recommandation HOWPASS
      - Adapte tes suggestions selon le profil et l'expérience`,
      
      "Aide l'utilisateur à identifier ses besoins et ses objectifs, analyse son état émotionnel et ses préférences, propose des activités et pratiques avec un score de pertinence, explique le raisonnement derrière chaque recommandation, adapte tes suggestions selon son profil et son expérience.",
      
      `IMPORTANT - STRATÉGIE DE CONVERSATION:
      - Ne propose JAMAIS d'activités ou pratiques directement sans avoir d'abord creusé les besoins de l'utilisateur
      - Pose des questions ciblées pour comprendre son état émotionnel, ses contraintes, ses préférences
      - Écoute attentivement ses réponses avant de suggérer quoi que ce soit
      - L'objectif est de créer une vraie conversation, pas de donner des réponses toutes faites
      - Propose des activités/pratiques seulement après avoir bien compris ses besoins spécifiques`,
      
      "IMPORTANT: L'échange doit se limiter à environ 10 questions maximum, chaque réponse doit impérativement contenir une question pour maintenir l'engagement.",
      
      "STRATÉGIE: Commence par des questions ouvertes sur son état actuel, ses défis, ses envies, ne propose des activités/pratiques qu'après avoir bien cerné ses besoins spécifiques.",
      
      "CRUCIAL: Ne propose des activités/pratiques qu'après avoir posé au moins 3 questions pour comprendre les vrais besoins.",
      
      "L'utilisateur cherche des recommandations personnalisées d'activités et de pratiques sur la plateforme HOW PASS. Aide-le à identifier ses besoins et propose des solutions adaptées.",
      
      `Utilisation des outils:
      - Utilise l'outil 'faq_search' UNIQUEMENT pour des questions informationnelles relevant des thèmes suivants: stress, anxiété, méditation, sommeil, concentration, équilibre émotionnel, confiance en soi, débutants (pratiques/activités), parrainage, ambassadeur Howana, Aper'How bien-être (définition, participation, organisation, types de pratiques)
      - Pour toute autre question (y compris compte/connexion, abonnement/prix, sécurité/données, support/bugs), ne pas utiliser 'faq_search'
      - Si la question concerne des recommandations personnalisées d'activités/pratiques, utilise 'activities_and_practices_by_user_situation'`
    ];
  }


  /**
   * Redéfinit buildSystemPrompt pour inclure les pratiques HOW PASS existantes
   */
  protected override async buildSystemPrompt(context: HowanaContext): Promise<string> {
    // Récupérer les règles IA (format tableau)
    const rules = await this.getIaRules(context.type, this.getDefaultRules());
    
    // Récupérer le contexte système de base (qui inclut maintenant les pratiques)
    const baseSystemContext = await this.getSystemContext(context as HowanaRecommandationContext & HowanaContext);
    
    // Combiner les règles et le contexte de base
    return rules.join('\n\n') + '\n\n' + baseSystemContext;
  }

  /**
   * Fonction centralisée pour toutes les informations de contexte système
   */
  protected override async getSystemContext(context: HowanaRecommandationContext & HowanaContext): Promise<string> {
    let contextInfo = '';

    // Contexte du dernier bilan
    contextInfo += this.getLastBilanContextInfo(context);

    // Contexte de la dernière recommandation Howana
    contextInfo += this.getPreviousConversationContext(context);

    // Ajouter l'univers du bilan si disponible
    contextInfo += this.getUniversContextInfo(context);

    // Ajouter les pratiques HOW PASS existantes
    contextInfo += (await this.getAvailablePracticesContext());

    return contextInfo;
  }


  /**
   * Informations contextuelles du bilan
   */
  protected getLastBilanContextInfo(context: HowanaRecommandationContext & HowanaContext): string {
    if (!context.lastBilan) return '';

    let bilanInfo = `\n\nCONTEXTE DU DERNIER BILAN COMPLET:`;

    if (context.lastBilan.notesPersonnelles) {
      bilanInfo += `\n- Notes personnelles: ${context.lastBilan.notesPersonnelles}`;
    }

    if (context.lastHowanaRecommandation && context.lastHowanaRecommandation.userProfile) {
      const profile = context.lastHowanaRecommandation.userProfile;
      if (profile.supposedEmotionalState) {
        bilanInfo += `\n- État émotionnel précédent: ${profile.supposedEmotionalState}`;
      }
      if (profile.supposedCurrentNeeds && profile.supposedCurrentNeeds.length > 0) {
        bilanInfo += `\n- Besoins précédents: ${profile.supposedCurrentNeeds.join(', ')}`;
      }
      if (profile.supposedPreferences && profile.supposedPreferences.length > 0) {
        bilanInfo += `\n- Préférences précédentes: ${profile.supposedPreferences.join(', ')}`;
      }
    }

    return bilanInfo;
  }
  
  /**
   * Informations contextuelles de l'univers du bilan
   */
  protected getUniversContextInfo(context: HowanaRecommandationContext & HowanaContext): string {
    if (!context.univers) return '';

    return `\n\nCONTEXTE DE L'UNIVERS DU BILAN:\n${JSON.stringify(context.univers, null, 2)}`;
  }

  /**
   * Informations contextuelles des conversations précédentes
   */
  protected getPreviousConversationContext(context: HowanaRecommandationContext & HowanaContext): string {
    if (!context.lastHowanaRecommandation) return '';

    let previousContext = `\n\nCONTEXTE DE LA DERNIÈRE RECOMMANDATION HOWANA:`;
    
    if (context.lastHowanaRecommandation.userProfile) {
      const profile = context.lastHowanaRecommandation.userProfile;
      if (profile.supposedEmotionalState) {
        previousContext += `\n- État émotionnel précédent: ${profile.supposedEmotionalState}`;
      }
      if (profile.supposedCurrentNeeds && profile.supposedCurrentNeeds.length > 0) {
        previousContext += `\n- Besoins précédents: ${profile.supposedCurrentNeeds.join(', ')}`;
      }
      if (profile.supposedPreferences && profile.supposedPreferences.length > 0) {
        previousContext += `\n- Préférences précédentes: ${profile.supposedPreferences.join(', ')}`;
      }
      if (profile.supposedConstraints && profile.supposedConstraints.length > 0) {
        previousContext += `\n- Contraintes précédentes: ${profile.supposedConstraints.join(', ')}`;
      }
    }

    if (context.lastHowanaRecommandation.recommendedCategories && context.lastHowanaRecommandation.recommendedCategories.length > 0) {
      const categories = context.lastHowanaRecommandation.recommendedCategories.map(cat => cat.name).join(', ');
      previousContext += `\n- Pratiques recommandées précédemment: ${categories}`;
    }

    if (context.lastHowanaRecommandation.recommendedActivities && context.lastHowanaRecommandation.recommendedActivities.length > 0) {
      const activities = context.lastHowanaRecommandation.recommendedActivities.map(act => act.name).join(', ');
      previousContext += `\n- Activités recommandées précédemment: ${activities}`;
    }

    if (context.lastHowanaRecommandation.activitiesReasons) {
      previousContext += `\n- Raisons des activités précédentes: ${context.lastHowanaRecommandation.activitiesReasons}`;
    }

    if (context.lastHowanaRecommandation.practicesReasons) {
      previousContext += `\n- Raisons des pratiques précédentes: ${context.lastHowanaRecommandation.practicesReasons}`;
    }

    if (context.lastHowanaRecommandation.importanteKnowledge && context.lastHowanaRecommandation.importanteKnowledge.length > 0) {
      previousContext += `\n- Connaissances importantes précédentes: ${context.lastHowanaRecommandation.importanteKnowledge.join(', ')}`;
    }

    if (context.lastHowanaRecommandation.top1Recommandation) {
      const top1 = context.lastHowanaRecommandation.top1Recommandation;
      previousContext += `\n- Recommandation prioritaire précédente: ${top1.name} (${top1.type === 'activity' ? 'activité' : 'pratique'}) - ${top1.reason}`;
    }

    previousContext += `\n\nUtilise ces informations pour comprendre l'évolution de l'utilisateur et adapter tes questions et recommandations. Évite de répéter exactement les mêmes suggestions.`;

    return previousContext;
  }

  protected buildFirstUserPrompt(_context: HowanaContext): string {
    const context = _context as HowanaRecommandationContext & HowanaContext;
    const hasPreviousContext = !!(context.lastHowanaRecommandation || context.lastBilan);
  
    let prompt = hasPreviousContext
      ? `Dis bonjour chaleureusement en faisant référence au dernier bilan/recommandation.
  Propose quelqes pistes adaptées avec une micro-explication chacune.
  Ajoute aussi une option alternative qui exprime que l’utilisateur peut se laisser guider (ex. "Surprends-moi", "Choisis pour moi", "Je me laisse guider").`
      : `Salue chaleureusement et présente-toi comme Howana, assistant bien-être.
  Propose 2–3 portes d’entrée génériques (ex. "Détente immédiate", "Énergie douce", "Clarté mentale") avec micro-explications.
  Ajoute aussi une option alternative qui exprime que l’utilisateur peut se laisser guider (ex. "Surprends-moi", "Choisis pour moi", "Comme tu veux", "Je me laisse guider").`;
  
    return prompt;
  }

  protected buildSummarySystemPrompt(_context: HowanaContext): string {
    return "A partir des informations contextuelles, génère un résumé structuré détaillé qui permettra de comprendre les besoins de l'utilisateur et les recommandations proposées.";
  }

  protected getActivitiesAndPracticesConstraints(context: HowanaContext): {
    availableActivityIds: string[];
    availablePracticeIds: string[];
    allAvailableIds: string[];
  } {
    // Récupérer les recommandations des métadonnées pour contraindre les enums
    const recommendations = context.recommendations || { activities: [], practices: [] };
    
    // Extraire uniquement les IDs pour créer les enums
    const availableActivityIds = recommendations.activities?.map((item: any) => item.id).filter((id: any) => id) || [];
    const availablePracticeIds = recommendations.practices?.map((item: any) => item.id).filter((id: any) => id) || [];
    const allAvailableIds = [...availableActivityIds, ...availablePracticeIds];
    
    console.log(`📋 Contraintes générées avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques (IDs uniquement)`);

    return {
      availableActivityIds,
      availablePracticeIds,
      allAvailableIds
    };
  }

  protected getSummaryOutputSchema(context: HowanaContext): OpenAIJsonSchema {
    const constraints = this.getActivitiesAndPracticesConstraints(context);
    const { availableActivityIds, availablePracticeIds, allAvailableIds } = constraints;

    console.log(`📋 [RECOMMANDATIONS] Contraintes générées avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques (IDs uniquement):`, {
      availableActivityIds,
      availablePracticeIds,
      allAvailableIds
    });
 
    return {
      format: { 
        type: "json_schema",
        name: "RecommendationSummary",
        schema: {
          type: "object",
          properties: {
             userProfile: this.getUserProfileSchemaFragment("Profil utilisateur analysé à partir de la conversation de recommandation"),
             recommendation: this.getRecommendationSchemaFragment(
               availableActivityIds,
               availablePracticeIds,
               "Recommandation personnalisée basée sur l'analyse des besoins de l'utilisateur"
             ),
            importanteKnowledge: {
              type: "array",
              items: { type: "string" },
              description: "Messages destinés à l'utilisateur contenant les points clés à retenir pour optimiser votre parcours de bien-être (formulés en vous parlant directement)"
            }
          },
           required: ["userProfile", "recommendation", "importanteKnowledge"],
          additionalProperties: false,
          description: `Résumé personnalisé des recommandations de bien-être basé sur l'analyse des besoins de l'utilisateur. Les recommandations sont contraintes aux ${allAvailableIds.length} éléments disponibles dans le contexte.`
        },
        strict: true
      }
    };
  }

  /**
   * Redéfinit generateConversationSummary pour enrichir les recommandations avec les noms depuis context.recommendations
   */
  public override async generateConversationSummary(context: HowanaContext): Promise<{
    summary: any;
    extractedData: any;
    updatedContext: HowanaContext;
    cost_input?: number | null;
    cost_cached_input?: number | null;
    cost_output?: number | null;
  }> {
    // Appeler la méthode parente pour générer le résumé
    const result = await super.generateConversationSummary(context);

    // Récupérer les recommandations depuis le contexte pour enrichir avec les noms
    const recommendations = context.recommendations || { activities: [], practices: [] };

    // Créer des maps pour retrouver rapidement les noms par ID
    const practicesMap = new Map<string, string>();
    const activitiesMap = new Map<string, string>();
    
    (recommendations.practices || []).forEach((practice: any) => {
      if (practice.id) {
        practicesMap.set(practice.id, practice.title || practice.name || 'Pratique sans nom');
      }
    });
    
    (recommendations.activities || []).forEach((activity: any) => {
      if (activity.id) {
        activitiesMap.set(activity.id, activity.title || activity.name || 'Activité sans nom');
      }
    });

    // Enrichir les recommandations avec les noms
    if (result.summary && typeof result.summary === 'object' && !Array.isArray(result.summary)) {
      const summary = result.summary as any;
      
      // Enrichir recommendedCategories (pratiques)
      if (summary.recommendation?.recommendedCategories && Array.isArray(summary.recommendation.recommendedCategories)) {
        summary.recommendation.recommendedCategories = summary.recommendation.recommendedCategories.map((item: any) => {
          if (item.id && !item.name) {
            return { ...item, name: practicesMap.get(item.id) || 'Pratique sans nom' };
          }
          return item;
        });
      }
      
      // Enrichir recommendedActivities
      if (summary.recommendation?.recommendedActivities && Array.isArray(summary.recommendation.recommendedActivities)) {
        summary.recommendation.recommendedActivities = summary.recommendation.recommendedActivities.map((item: any) => {
          if (item.id && !item.name) {
            return { ...item, name: activitiesMap.get(item.id) || 'Activité sans nom' };
          }
          return item;
        });
      }
      
      // Enrichir top1Recommandation
      if (summary.recommendation?.top1Recommandation?.id && !summary.recommendation.top1Recommandation.name) {
        const top1Id = summary.recommendation.top1Recommandation.id;
        const top1Type = summary.recommendation.top1Recommandation.type;
        if (top1Type === 'practice') {
          summary.recommendation.top1Recommandation.name = practicesMap.get(top1Id) || 'Pratique sans nom';
        } else if (top1Type === 'activity') {
          summary.recommendation.top1Recommandation.name = activitiesMap.get(top1Id) || 'Activité sans nom';
        }
      }

      console.log('✅ [RECOMMANDATIONS] Recommandations enrichies avec les noms:', {
        practicesMapSize: practicesMap.size,
        activitiesMapSize: activitiesMap.size
      });
    } else {
      console.warn('⚠️ [RECOMMANDATIONS] Résumé non trouvé ou format inattendu pour enrichir les recommandations');
    }

    return result;
  }

  protected getStartConversationOutputSchema(_context: HowanaContext): ChatBotOutputSchema {
    // Pas de schéma de sortie spécifique pour startConversation
    // L'IA répond librement selon le prompt
    return null;
  }

  protected override getWelcomeMessageOutputSchema(_context: HowanaContext): ChatBotOutputSchema {
    return {
      format: { 
        type: "json_schema",
        name: "RecommendationResponse",
        schema: {
          type: "object",
          properties: {
            response: {
              type: "string",
              description: "Message de salutation soit nouveau context soit faisant référence à la conversation précédente de l'assistant Howana, très courte (30 mots maximum)"
            },
            quickReplies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  icon: {
                    type: "string",
                    enum: ["alert-triangle", "zap", "smile", "heart", "explore"],
                    description: "The icon that is the best to prefixe the quick reply"
                  },
                  type: {
                    type: "string",
                    enum: ["text"],
                    description: "Type de quick reply, alway text"
                  },
                  text: {
                    type: "string",
                    description: "Texte de la suggestion (max 5 mots)"
                  },
                },
                required: ["type", "icon", "text"],
                additionalProperties: false
              },
              description: "1 à 4 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur.",
              maxItems: 4,
              minItems: 1
            }
          },
          required: ["response", "quickReplies"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  protected override getAddMessageOutputSchema(context: HowanaContext, forceSummaryToolCall: boolean = false): ChatBotOutputSchema {
    if (forceSummaryToolCall) {
      // Si on force un summaryToolCall, utiliser le format idsOnly sans contraintes
      const activitiesAndPracticesSchema = this.getActivitiesAndPracticesResponseSchema(
        "Recommandations d'activités et pratiques HOW PASS spécifiques",
        3
      );

      return {
        format: { 
          type: "json_schema",
          name: "HowPassContentResponse",
          schema: {
            type: "object",
            properties: {
              ...activitiesAndPracticesSchema.properties
            },
            required: ["activities", "practices"],
            additionalProperties: false
          },
          strict: true
        }
      };
    }

    // Lire l'intent depuis le contexte
    const currentIntentInfos = context.metadata?.['currentIntentInfos'] as any;
    const intent = currentIntentInfos?.intent as RecommendationIntent | undefined;

    // Adapter le schéma selon l'intent
    if (intent?.intent === RecommendationChatBotService.INTENT_NAMES.TAKE_RDV) {
      // Schéma générique pour tous les cas de take_rdv
      return {
        format: { 
          type: "json_schema",
          name: "TakeRdvResponse",
          schema: {
            type: "object",
            properties: {
              response: {
                type: "string",
                description: "Message court (≤ 30 mots) adapté au contexte de prise de rendez-vous selon les informations disponibles dans intentResults."
              },
              quickReplies: this.getRdvQuickRepliesSchema(
                "0 à 3 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur avec IDs pour redirection (activityId pour type='activity_rdv', practiceId pour type='practice_rdv', howerAngelId pour type='hower_angel_rdv')",
                0,
                3
              )
            },
            required: ["response", "quickReplies"],
            additionalProperties: false
          },
          strict: true
        }
      };
    }

    // Schéma par défaut pour les autres cas
    return {
      format: { 
        type: "json_schema",
        name: "ConversationResponse",
        schema: {
          type: "object",
          properties: {
            response: {
              type: "string",
              description:
                "Message court (≤ 30 mots), conversationnel, adressé à l'utilisateur. Réponse personnalisée, contextualisée par l'échange et les derniers résultats d'outils si présents (ne jamais afficher une simple liste de résultat)."
            },
            quickReplies: this.getSimpleQuickRepliesSchema(
              "1 à 3 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur",
              0,
              3
            )
          },
          required: ["response", "quickReplies"],
          additionalProperties: false
        },
        strict: true
      }
    };

  }

  /**
   * Détermine le schéma de sortie approprié selon l'outil utilisé
   */
  protected override getSchemaByUsedTool(toolName: string, context: HowanaContext, forceSummaryToolCall:boolean = false): ChatBotOutputSchema {
    switch (toolName) {
      case 'activities_and_practices_by_user_situation':
        // Schéma pour les réponses après utilisation de l'outil de recherche d'activités et pratiques
        const constraints = this.getActivitiesAndPracticesConstraints(context);
        const { availableActivityIds, availablePracticeIds, allAvailableIds } = constraints;

        console.log(`📋 [OUTIL] Contraintes générées avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques (IDs uniquement):`, {
          availableActivityIds,
          availablePracticeIds,
          allAvailableIds
        });

        // Récupérer les recommandations pour obtenir les noms (pour les quickReplies)
        const recommendations = context.recommendations || { activities: [], practices: [] };
        const availableActivityNames = recommendations.activities?.map((item: any) => item.title || item.name || 'Activité sans nom') || [];
        const availablePracticeNames = recommendations.practices?.map((item: any) => item.title || item.name || 'Pratique sans nom') || [];

        return {
          format: { 
            type: "json_schema",
            name: "ActivitiesAndPracticesResponse",
            schema: {
              type: "object",
              properties: {
                response: {
                  type: "string",
                  description: "Réponse principale de l'assistant Howana. Maximum 30 mots."
                },
                quickReplies: this.getQuickRepliesWithConstraintsSchema(
                  availableActivityIds,
                  availableActivityNames,
                  availablePracticeIds,
                  availablePracticeNames,
                  "1 à 3 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur. Peuvent être de type 'text' simple ou référencer des activités/pratiques spécifiques.",
                  1,
                  3,
                  forceSummaryToolCall,
                )
              },
              required: ["response", "quickReplies"],
              additionalProperties: false,
              description: `Réponse après utilisation de l'outil activities_and_practices_by_user_situation. Les quickReplies peuvent référencer les ${allAvailableIds.length} éléments disponibles dans le contexte.`
            },
            strict: true
          }
        };

      case 'faq_search':
        // Schéma pour les réponses après utilisation de l'outil FAQ
        return {
          format: { 
            type: "json_schema",
            name: "FAQResponse",
            schema: {
              type: "object",
              properties: {
                response: {
                  type: "string",
                  description: "Réponse principale de l'assistant Howana basée sur la FAQ. Maximum 30 mots."
                },
                quickReplies: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["text"] },
                      text: { type: "string", maxLength: 5 }
                    },
                    required: ["type", "text"],
                    additionalProperties: false
                  },
                  minItems: 1,
                  maxItems: 3,
                  description: "1 à 3 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur."
                }
              },
              required: ["response", "quickReplies"],
              additionalProperties: false,
              description: "Réponse après utilisation de l'outil faq_search."
            },
            strict: true
          }
        };

      case 'last_user_activities':
        // Schéma pour les réponses après utilisation de l'outil d'historique des activités
        return {
          format: { 
            type: "json_schema",
            name: "LastUserActivitiesResponse",
            schema: {
              type: "object",
              properties: {
                response: {
                  type: "string",
                  description: "Réponse principale de l'assistant Howana basée sur l'historique de l'utilisateur. Maximum 30 mots."
                },
                quickReplies: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["text"] },
                      text: { type: "string", maxLength: 5 }
                    },
                    required: ["type", "text"],
                    additionalProperties: false
                  },
                  minItems: 1,
                  maxItems: 3,
                  description: "1 à 3 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur."
                }
              },
              required: ["response", "quickReplies"],
              additionalProperties: false,
              description: "Réponse après utilisation de l'outil last_user_activities."
            },
            strict: true
          }
        };

      default:
        // Schéma par défaut pour les autres outils ou cas non spécifiés
        return this.getAddMessageOutputSchema(context, forceSummaryToolCall);
    }
  }

  /**
   * Pour les conversations de recommandation, des recommandations sont requises dans le résumé
   * si elles n'ont pas encore été générées. Si des recommandations existent déjà dans le contexte,
   * on peut générer le résumé directement. Sinon, il faut forcer un appel aux outils.
   */
  protected override recommendationRequiredForSummary(context: HowanaContext): boolean {
    const hasRecommendations = context.metadata?.['hasRecommendations'] || false;
    const recommendations = context.metadata?.['recommendations'] || { activities: [], practices: [] };
    
    console.log(`📋 Vérification des recommandations pour le résumé:`, {
      hasRecommendations,
      activitiesCount: recommendations.activities?.length || 0,
      practicesCount: recommendations.practices?.length || 0,
      totalCount: (recommendations.activities?.length || 0) + (recommendations.practices?.length || 0),
      needToolsCall: !hasRecommendations
    });
    
    // Si des recommandations existent déjà, pas besoin de forcer un appel aux outils
    // Sinon, il faut forcer un appel aux outils pour générer des recommandations
    return !hasRecommendations;
  }

  protected getToolsDescription(_context: HowanaContext, forceSummaryToolCall:boolean, forWoo:boolean = false): OpenAIToolsDescription | null {
    
    const activitiesAndPracticesTool:OpenAITool = {
      type: 'function',
      name: 'activities_and_practices_by_user_situation',
      description: 'Rechercher des activités et pratiques HOW PASS pertinentes pour l\'utilisateur',
      parameters: {
        type: 'object',
        properties: {
          searchTerm: {
            type: 'string',
            description: 'Description de l\'état émotionnel et des besoins de l\'utilisateur, formulée de son point de vue avec des expressions comme "Je me sens...", "J\'ai besoin de...", "Je voudrais...". Ce format facilite la recherche vectorielle en alignant la formulation des besoins avec celle des descriptions d\'activités.'
          }
        },
        required: ['searchTerm']
      },
      strict: false
    };

    const faqTool:OpenAITool = {
      type: 'function',
      name: 'faq_search',
      description: 'Rechercher des informations dans la FAQ HOW PASS pour répondre aux questions de l\'utilisateur',
      parameters: {
        type: 'object',
        properties: {
          faqSearchTerm: {
            type: 'string',
            description: 'Question ou sujet à rechercher dans la FAQ HOWPASS, formulé du point de vue de l\'utilisateur (ex: "Comment gérer le stress?", "Qu\'est-ce que la méditation?", "Améliorer mon sommeil")'
          }
        },
        required: ['faqSearchTerm']
      },
      strict: false
    };

    const lastUserActivitiesTool:OpenAITool = {
      type: 'function',
      name: 'last_user_activities',
      description: 'Récupérer les 5 dernières activités de l\'utilisateur pour comprendre son historique et ses préférences',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      strict: false
    };

    const getAllAvailablePracticesTool:OpenAITool = {
      type: 'function',
      name: 'get_all_available_practices',
      description: 'Récupérer toutes les pratiques de bien-être disponibles sur la plateforme HOW PASS',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      strict: false
    };

    const howerAngelByUserSituationTool:OpenAITool = {
      type: 'function',
      name: 'hower_angel_by_user_situation',
      description: 'Rechercher des hower angels (utilisateurs experts) correspondant à la situation de l\'utilisateur',
      parameters: {
        type: 'object',
        properties: {
          searchTerm: {
            type: 'string',
            description: 'Description de la situation de l\'utilisateur pour trouver des hower angels pertinents (ex: "Je traverse une période de stress au travail", "J\'ai des difficultés avec la méditation")'
          }
        },
        required: ['searchTerm']
      },
      strict: false
    };

    if (forceSummaryToolCall) {
      return {
        tools: [{ description: activitiesAndPracticesTool, usage: "response" }]
      };
    }

    if (forWoo) {
      return {
        tools: [
          { description: activitiesAndPracticesTool, usage: "context" },
          { description: faqTool, usage: "context" },
          { description: lastUserActivitiesTool, usage: "context" },
          { description: howerAngelByUserSituationTool, usage: "context" },
        ]
      };
    }

    return {
      tools: [
        { description: activitiesAndPracticesTool, usage: "context" },
        { description: faqTool, usage: "context" },
        { description: lastUserActivitiesTool, usage: "context" },
        { description: getAllAvailablePracticesTool, usage: "context" },
        { description: howerAngelByUserSituationTool, usage: "context" },
      ]
    };
    
  }

  protected async callTool(toolName: string, toolArgs: any, context: HowanaContext): Promise<any> {
    switch (toolName) {
      case 'activities_and_practices_by_user_situation':
        return await this.searchActivitiesAndPractices(toolArgs.searchTerm);
      
      case 'faq_search':
        return await this.searchFAQ(toolArgs.faqSearchTerm);
      
      case 'last_user_activities':
        return await this.getLastUserActivities(context.userId);
      
      case 'get_all_available_practices':
        return await this.getAllAvailablePractices();
      
      case 'hower_angel_by_user_situation':
        return await this.searchHowerAngelsByUserSituation(toolArgs.searchTerm);
      
      default:
        throw new Error(`Outil non supporté: ${toolName}`);
    }
  }

  private async searchActivitiesAndPractices(searchTerm: string): Promise<any> {
    try {
      console.log(`🔍 Recherche d'activités et pratiques: ${searchTerm}`);
      
      const results: any = {
        activities: [],
        practices: []
      };

      if (searchTerm && searchTerm.trim()) {
        try {
          const activitiesResults = await this.supabaseService.searchActivitiesAndPractices([searchTerm]);
          results.activities = activitiesResults.results.filter((item: any) => item.type === 'activity');
          results.practices = activitiesResults.results.filter((item: any) => item.type === 'practice');
        } catch (error) {
          console.error('❌ Erreur lors de la recherche d\'activités et pratiques:', error);
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Erreur lors de la recherche d\'activités et pratiques:', error);
      return {
        activities: [],
        practices: [],
        error: 'Erreur lors de la recherche d\'activités et pratiques'
      };
    }
  }

  private async searchFAQ(faqSearchTerm: string): Promise<any> {
    try {
      console.log(`🔍 Recherche FAQ: ${faqSearchTerm}`);
      
      const results: any = {
        faq: []
      };

      if (faqSearchTerm && faqSearchTerm.trim()) {
        try {
          const faqResults = await this.supabaseService.searchFAQ(faqSearchTerm, 2);
          results.faq = faqResults.results;
        } catch (error) {
          console.error('❌ Erreur lors de la recherche FAQ:', error);
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Erreur lors de la recherche FAQ:', error);
      return {
        faq: [],
        error: 'Erreur lors de la recherche FAQ'
      };
    }
  }

  private async getLastUserActivities(userId: string): Promise<any> {
    try {
      console.log(`🔍 Récupération des dernières activités pour l'utilisateur: ${userId}`);
      
      const result = await this.supabaseService.getLastUserActivities(userId, 5);
      
      if (!result.success) {
        console.error('❌ Erreur lors de la récupération des dernières activités:', result.error);
        return {
          activities: [],
          error: result.error
        };
      }

      console.log(`✅ ${result.data?.length || 0} dernières activités récupérées`);
      
      return {
        activities: result.data || [],
        total: result.data?.length || 0
      };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des dernières activités:', error);
      return {
        activities: [],
        error: 'Erreur lors de la récupération des dernières activités'
      };
    }
  }

  private async getAllAvailablePractices(): Promise<any> {
    try {
      console.log(`🔍 Récupération de toutes les pratiques disponibles`);
      
      const result = await this.supabaseService.getAllAvailablePractices();
      
      if (!result.success) {
        console.error('❌ Erreur lors de la récupération des pratiques:', result.error);
        return {
          practices: [],
          error: result.error
        };
      }

      console.log(`✅ ${result.data?.length || 0} pratiques récupérées`);
      
      return {
        practices: result.data || [],
        total: result.data?.length || 0
      };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des pratiques:', error);
      return {
        practices: [],
        error: 'Erreur lors de la récupération des pratiques'
      };
    }
  }

  private async searchHowerAngelsByUserSituation(searchTerm: string): Promise<any> {
    try {
      console.log(`🔍 Recherche de hower angels pour la situation: ${searchTerm}`);
      
      const result = await this.supabaseService.searchHowerAngelsByUserSituation([searchTerm]);
      
      if (!result.success) {
        console.error('❌ Erreur lors de la recherche de hower angels:', result.error);
        return {
          howerAngels: [],
          error: result.error
        };
      }

      console.log(`✅ ${result.data?.length || 0} hower angels trouvés`);
      
      return {
        howerAngels: result.data || [],
        total: result.total || 0,
        searchTerm: result.searchTerm
      };
    } catch (error) {
      console.error('❌ Erreur lors de la recherche de hower angels:', error);
      return {
        howerAngels: [],
        error: 'Erreur lors de la recherche de hower angels'
      };
    }
  }

  /**
   * Implémentation de l'extraction des activités et pratiques pour RecommendationChatBotService
   * L'argument response provient du résultat de l'appel à l'outil de recherche vectorielle
   */
  protected extractRecommandationsFromToolResponse(toolId: string, response: any): ExtractedRecommandations {
    console.log(`🔧 Extraction pour l'outil: ${toolId}`);
    
    const activities: ExtractedRecommandations['activities'] = [];
    const practices: ExtractedRecommandations['practices'] = [];

    // Pour l'outil activities_and_practices_by_user_situation, extraire depuis les résultats
    if (toolId === 'activities_and_practices_by_user_situation' && response) {
      // Extraire les activités
      if (response.activities && Array.isArray(response.activities)) {
        response.activities.forEach((result: any) => {
          if (result.id && result.title) {
            activities.push(result);
          }
        });
      }

      // Extraire les pratiques
      if (response.practices && Array.isArray(response.practices)) {
        response.practices.forEach((result: any) => {
          if (result.id && result.title) {
            practices.push(result);
          }
        });
      }
    }

    // Pour l'outil faq_search, pas d'extraction de recommandations (seulement des informations)
    if (toolId === 'faq_search') {
      console.log(`🔧 Outil FAQ - pas d'extraction de recommandations`);
    }

    // Pour l'outil get_all_available_practices, extraire les pratiques
    if (toolId === 'get_all_available_practices' && response) {
      console.log(`🔧 Outil All Available Practices - pas d'extraction de recommandations`);
    }

    // Pour l'outil hower_angel_by_user_situation, pas d'extraction de recommandations (seulement des informations)
    if (toolId === 'hower_angel_by_user_situation') {
      console.log(`🔧 Outil hower angel - pas d'extraction de recommandations`);
    }

    console.log(`🔧 Extraction terminée: ${activities.length} activités, ${practices.length} pratiques`);
    return { activities, practices };
  }

  // ========================================
  // SCHÉMAS RÉUTILISABLES POUR LES RECOMMANDATIONS
  // ========================================

  /**
   * Schéma réutilisable pour le profil utilisateur
   * @param description Description personnalisée du champ
   */
  protected getUserProfileSchemaFragment(description: string = "Profil utilisateur analysé à partir de la conversation"): any {
    return {
      type: "object",
      properties: {
        supposedEmotionalState: {
          type: "string",
          description: "État émotionnel actuel de l'utilisateur, formulé de son point de vue (ex: 'Je me sens stressé', 'Je ressens de la fatigue')"
        },
        supposedCurrentNeeds: {
          type: "array",
          items: { type: "string" },
          description: "Besoins actuels identifiés, formulés du point de vue de l'utilisateur (ex: 'J'ai besoin de me détendre', 'Je veux retrouver de l'énergie')"
        },
        supposedPreferences: {
          type: "array",
          items: { type: "string" },
          description: "Préférences de l'utilisateur, formulées de son point de vue (ex: 'J'aime les activités en groupe', 'Je préfère le matin')"
        },
        supposedConstraints: {
          type: "array",
          items: { type: "string" },
          description: "Contraintes identifiées, formulées du point de vue de l'utilisateur (ex: 'Je n'ai que 30 minutes', 'Je ne peux pas sortir')"
        }
      },
      required: ["supposedEmotionalState", "supposedCurrentNeeds", "supposedPreferences", "supposedConstraints"],
      additionalProperties: false,
      description
    };
  }

  /**
   * Schéma réutilisable pour les catégories recommandées (pratiques)
   * @param availablePracticeIds Liste des IDs de pratiques disponibles
   * @param availablePracticeNames Liste des noms de pratiques disponibles
   * @param description Description personnalisée du champ
   * @param minItems Nombre minimum d'éléments (défaut: 1 si des pratiques disponibles, 0 sinon)
   * @param maxItems Nombre maximum d'éléments (défaut: 2 ou plus selon les pratiques disponibles)
   */
  protected getRecommendedCategoriesSchema(
    availablePracticeIds: string[], 
    description: string = "Pratiques de bien-être recommandées basées sur l'analyse des besoins de l'utilisateur",
    minItems?: number,
    maxItems?: number
  ): any {
    const hasPractices = availablePracticeIds.length > 0;
    const defaultMinItems = hasPractices ? 1 : 0;
    const defaultMaxItems = hasPractices ? Math.max(2, availablePracticeIds.length) : 0;

    return {
      type: "array",
      minItems: minItems ?? defaultMinItems,
      maxItems: maxItems ?? defaultMaxItems,
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            enum: availablePracticeIds,
            description: "Identifiant unique de la pratique de bien-être recommandée"
          }
        },
        required: ["id"],
        additionalProperties: false
      },
      description
    };
  }

  /**
   * Schéma réutilisable pour les activités recommandées
   * @param availableActivityIds Liste des IDs d'activités disponibles
   * @param availableActivityNames Liste des noms d'activités disponibles
   * @param description Description personnalisée du champ
   * @param minItems Nombre minimum d'éléments (défaut: 1 si des activités disponibles, 0 sinon)
   * @param maxItems Nombre maximum d'éléments (défaut: 2 ou plus selon les activités disponibles)
   */
  protected getRecommendedActivitiesSchema(
    availableActivityIds: string[], 
    description: string = "Activités de bien-être recommandées basées sur l'analyse des besoins de l'utilisateur",
    minItems?: number,
    maxItems?: number
  ): any {
    const hasActivities = availableActivityIds.length > 0;
    const defaultMinItems = hasActivities ? 1 : 0;
    const defaultMaxItems = hasActivities ? Math.max(2, availableActivityIds.length) : 0;

    return {
      type: "array",
      minItems: minItems ?? defaultMinItems,
      maxItems: maxItems ?? defaultMaxItems,
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            enum: availableActivityIds,
            description: "Identifiant unique de l'activité de bien-être recommandée"
          }
        },
        required: ["id"],
        additionalProperties: false
      },
      description
    };
  }

  /**
   * Schéma réutilisable pour les quickReplies simples (texte seulement)
   * @param description Description personnalisée du champ
   * @param minItems Nombre minimum d'éléments (défaut: 0)
   * @param maxItems Nombre maximum d'éléments (défaut: 3)
   */
  protected getSimpleQuickRepliesSchema(
    description: string = "Suggestions de réponses courtes pour l'utilisateur",
    minItems: number = 0,
    maxItems: number = 3
  ): any {
    return {
      type: "array",
      minItems,
      maxItems,
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["text"],
            description: "Type de quick reply: 'text' pour une réponse simple"
          },
          text: {
            type: "string",
            description: "Texte de la suggestion (max 5 mots)"
          }
        },
        required: ["type", "text"],
        additionalProperties: false
      },
      description
    };
  }

  /**
   * Génère le schéma pour les quickReplies de rendez-vous avec IDs pour redirection
   */
  protected getRdvQuickRepliesSchema(
    description: string = "Suggestions de réponses courtes pour l'utilisateur avec IDs pour redirection",
    minItems: number = 0,
    maxItems: number = 4
  ): any {
    return {
      type: "array",
      minItems,
      maxItems,
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["activity_rdv", "practice_rdv", "hower_angel_rdv"],
            description: "Type de quick reply pour rendez-vous: 'activity_rdv' pour une redirection vers une activité, 'practice_rdv' pour une redirection vers une pratique, 'hower_angel_rdv' pour des actions liées à un hower angel (ex: 'voir toutes les activités', 'voir profil')"
          },
          text: {
            type: "string",
            description: "Texte de la suggestion (max 5 mots). Pour type='hower_angel_rdv', utiliser des textes comme 'Voir toutes les activités', 'Voir profil', etc."
          },
          activityId: {
            type: ["string", "null"],
            description: "ID de l'activité pour redirection (requis si type='activity_rdv', doit être null sinon)"
          },
          practiceId: {
            type: ["string", "null"],
            description: "ID de la pratique pour redirection (requis si type='practice_rdv', doit être null sinon)"
          },
          howerAngelId: {
            type: ["string", "null"],
            description: "ID du hower angel (userId) pour redirection (requis si type='hower_angel_rdv', doit être null sinon)"
          }
        },
        required: ["type", "text", "activityId", "practiceId", "howerAngelId"],
        additionalProperties: false
      },
      description
    };
  }

  /**
   * Schéma pour les réponses avec activités et pratiques (format idsOnly sans contraintes)
   * @param description Description personnalisée du champ
   * @param maxItems Nombre maximum d'éléments par array (défaut: 3)
   */
  protected getActivitiesAndPracticesResponseSchema(
    description: string = "Réponse avec recommandations d'activités et pratiques HOW PASS",
    maxItems: number = 3
  ): any {
    return {
      type: "object",
      properties: {
        activities: {
          type: "array",
          minItems: 0,
          maxItems,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "ID de l'activité recommandée"
              },
              name: {
                type: "string",
                description: "Nom de l'activité recommandée"
              }
            },
            required: ["id", "name"],
            additionalProperties: false
          },
          description: "Activités HOW PASS recommandées"
        },
        practices: {
          type: "array",
          minItems: 0,
          maxItems,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "ID de la pratique recommandée"
              },
              name: {
                type: "string",
                description: "Nom de la pratique recommandée"
              }
            },
            required: ["id", "name"],
            additionalProperties: false
          },
          description: "Pratiques HOW PASS recommandées"
        }
      },
      required: ["activities", "practices"],
      additionalProperties: false,
      description
    };
  }

  /**
   * Schéma réutilisable pour les quickReplies avec contraintes d'activités et pratiques
   * @param availableActivityIds Liste des IDs d'activités disponibles
   * @param availableActivityNames Liste des noms d'activités disponibles
   * @param availablePracticeIds Liste des IDs de pratiques disponibles
   * @param availablePracticeNames Liste des noms de pratiques disponibles
   * @param description Description personnalisée du champ
   * @param minItems Nombre minimum d'éléments (défaut: 1)
   * @param maxItems Nombre maximum d'éléments (défaut: 3)
   */
  protected getQuickRepliesWithConstraintsSchema(
    availableActivityIds: string[],
    availableActivityNames: string[],
    availablePracticeIds: string[],
    availablePracticeNames: string[],
    description: string = "Suggestions de réponses courtes pour l'utilisateur",
    minItems: number = 1,
    maxItems: number = 3,
    idsOnly: boolean = false
  ): any {
    if (idsOnly) {
      // Mode idsOnly : retourner deux arrays séparés pour activités et pratiques
      return {
        type: "object",
        properties: {
          activities: {
            type: "array",
            minItems: 0,
            maxItems: maxItems,
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  enum: availableActivityIds,
                  description: "ID de l'activité recommandée"
                },
                name: {
                  type: "string",
                  enum: availableActivityNames,
                  description: "Nom de l'activité recommandée"
                }
              },
              required: ["id", "name"],
              additionalProperties: false
            },
            description: "Activités HOW PASS recommandées"
          },
          practices: {
            type: "array",
            minItems: 0,
            maxItems: maxItems,
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  enum: availablePracticeIds,
                  description: "ID de la pratique recommandée"
                },
                name: {
                  type: "string",
                  enum: availablePracticeNames,
                  description: "Nom de la pratique recommandée"
                }
              },
              required: ["id", "name"],
              additionalProperties: false
            },
            description: "Pratiques HOW PASS recommandées"
          }
        },
        required: ["activities", "practices"],
        additionalProperties: false,
        description: "Recommandations d'activités et pratiques HOW PASS spécifiques"
      };
    }

    // Mode normal : quickReplies avec contraintes
    const allAvailableIds = [...availableActivityIds, ...availablePracticeIds];
    const allAvailableNames = [...availableActivityNames, ...availablePracticeNames];

    return {
      type: "array",
      minItems,
      maxItems,
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["text", "activity", "practice"],
            description: "Type de quick reply: 'text' pour une réponse simple, 'activity' ou 'practice' pour référencer un élément spécifique"
          },
          text: {
            type: "string",
            description: "Texte de la suggestion (max 5 mots)"
          },
          textRedirection: {
            type: ["string", "null"],
            description: "Texte d'action personnalisé incluant le nom de l'activité/pratique (ex: 'Découvrir <nom pratique>', 'Montre-moi <nom activité>') - max 5 mots. Peut être null si non applicable."
          },
          id: {
            type: ["string", "null"],
            enum: [...allAvailableIds, null],
            description: "ID de l'activité ou pratique référencée (requis si type = 'activity' ou 'practice', null sinon)"
          },
          name: {
            type: ["string", "null"],
            enum: [...allAvailableNames, null],
            description: "Nom de l'activité ou pratique référencée (requis si type = 'activity' ou 'practice', null sinon)"
          }
        },
        required: ["type", "text", "textRedirection", "id", "name"],
        additionalProperties: false
      },
      description
    };
  }

  /**
   * Schéma réutilisable pour une recommandation complète (au singulier)
   * @param availableActivityIds Liste des IDs d'activités disponibles
   * @param availableActivityNames Liste des noms d'activités disponibles
   * @param availablePracticeIds Liste des IDs de pratiques disponibles
   * @param availablePracticeNames Liste des noms de pratiques disponibles
   * @param description Description personnalisée du champ
   */
  protected getRecommendationSchemaFragment(
    availableActivityIds: string[],
    availablePracticeIds: string[],
    description: string = "Recommandation personnalisée basée sur l'analyse des besoins de l'utilisateur"
  ): any {
    const allAvailableIds = [...availableActivityIds, ...availablePracticeIds];
    
    return {
      type: "object",
      properties: {
        recommendedCategories: this.getRecommendedCategoriesSchema(availablePracticeIds),
        recommendedActivities: this.getRecommendedActivitiesSchema(availableActivityIds),
        activitiesReasons: {
          type: "string",
          description: "Message destiné à l'utilisateur expliquant pourquoi ces activités vous correspondent (formulé en vous parlant directement l'un à l'autre)"
        },
        practicesReasons: {
          type: "string",
          description: "Message destiné à l'utilisateur expliquant pourquoi ces pratiques vous correspondent (formulé en vous parlant directement l'un à l'autre)"
        },
        relevanceScore: {
          type: "number",
          description: "Score de pertinence de la recommandation (0 = non pertinent, 1 = très pertinent)"
        },
        reasoning: {
          type: "string",
          description: "Message destiné à l'utilisateur expliquant pourquoi cette recommandation vous correspond (formulé en vous parlant directement l'un à l'autre)"
        },
        benefits: {
          type: "array",
          items: { type: "string" },
          description: "Messages destinés à l'utilisateur listant les bénéfices concrets que vous pourrez retirer (formulés en vous parlant directement)"
        },
        nextSteps: {
          type: "array",
          items: { type: "string" },
          description: "Messages destinés à l'utilisateur décrivant les actions concrètes à entreprendre pour progresser dans votre bien-être (formulés en vous parlant directement)"
        },
        top1Recommandation: {
          type: "object",
          properties: {
            id: {
              type: "string",
              enum: allAvailableIds,
              description: "Identifiant unique de la recommandation prioritaire (activité ou pratique)"
            },
            type: {
              type: "string",
              enum: ["activity", "practice"],
              description: "Type de la recommandation prioritaire"
            },
            reason: {
              type: "string",
              description: "Message destiné à l'utilisateur expliquant pourquoi cette recommandation est prioritaire pour vous (formulé en vous parlant directement)"
            }
          },
          required: ["id", "type", "reason"],
          additionalProperties: false,
          description: "Recommandation prioritaire unique, sélectionnée parmi les activités et pratiques disponibles"
        }
      },
      required: ["recommendedCategories", "recommendedActivities", "activitiesReasons", "practicesReasons", "relevanceScore", "reasoning", "benefits", "nextSteps", "top1Recommandation"],
      additionalProperties: false,
      description
    };
  }

  /**
   * Traite l'intent calculé et effectue les recherches nécessaires selon le searchType
   * Peut générer plusieurs réponses consécutives en appelant onIaResponse pour chaque réponse
   * @param intent L'intent calculé
   * @param context Le contexte de la conversation
   * @param onIaResponse Callback appelé pour chaque réponse IA générée
   */
  protected override async handleIntent(
    context: HowanaContext,
    userMessage: string,
    onIaResponse: (response: any) => Promise<void>,
    forceSummary: boolean = false,
    autoResponse?: string,
    _isFirstCall: boolean = false
  ): Promise<HowanaContext> {
    // Récupérer intent depuis le contexte
    const currentIntentInfos = context.metadata?.['currentIntentInfos'] as any;
    const intent = currentIntentInfos?.intent as RecommendationIntent | undefined;

    if (!intent) {
      console.warn('⚠️ Aucun intent trouvé dans le contexte, utilisation du comportement par défaut');
      return super.handleIntent(context, userMessage, onIaResponse, forceSummary, autoResponse);
    }

    const typedIntent = intent;
    
    // Toujours calculer globalIntentInfos avant les handlers (avec userMessage pour les services qui en ont besoin)
    let globalIntentInfos = await this.computeGlobalIntentInfos(intent, context, userMessage);
    context.metadata = {
      ...context.metadata,
      ['globalIntentInfos']: globalIntentInfos
    };

    // Récupérer les IDs disponibles une seule fois
    const { availablePracticeIds, availableActivityIds, availableHowerAngelIds } = this.getAvailableIds(context);

    // Mapper chaque intent à sa fonction de gestion (même map que dans getIntentSchema)
    const intentHandlerMap: Record<string, (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext>> = {
      [RecommendationChatBotService.INTENT_NAMES.TAKE_RDV]: this.getRdvContextInfo(context).handle,
      [RecommendationChatBotService.INTENT_NAMES.SEARCH_HOWER_ANGEL]: this.getSearchHowerAngelContextInfo(availablePracticeIds, availableActivityIds, availableHowerAngelIds).handle,
      [RecommendationChatBotService.INTENT_NAMES.SEARCH_ACTIVITIES]: this.getSearchActivitiesContextInfo(availablePracticeIds, availableActivityIds, availableHowerAngelIds).handle,
      [RecommendationChatBotService.INTENT_NAMES.SEARCH_PRACTICE]: this.getSearchPracticeContextInfo(availablePracticeIds, availableActivityIds, availableHowerAngelIds).handle,
      [RecommendationChatBotService.INTENT_NAMES.SEARCH_OTHER_ADVICE]: this.getSearchOtherAdviceContextInfo(availablePracticeIds, availableActivityIds, availableHowerAngelIds).handle,
      [RecommendationChatBotService.INTENT_NAMES.DISCOVER]: this.getDiscoverContextInfo(context).handle,
      [RecommendationChatBotService.INTENT_NAMES.KNOW_MORE]: this.getKnowMoreContextInfo(context).handle,
      [RecommendationChatBotService.INTENT_NAMES.CONFIRMATION]: this.getConfirmationContextInfo(context).handle
    };

    // Appeler le handler approprié selon le type d'intent
    const handler = intentHandlerMap[typedIntent?.intent];
    if (handler) {
      try {
        context = await handler(intent, context, userMessage, globalIntentInfos);
      } catch (error) {
        console.error(`❌ Erreur lors du traitement de l'intent ${typedIntent?.intent}:`, error);
      }
    } else {
      console.warn(`⚠️ Aucun handler trouvé pour l'intent: ${typedIntent?.intent}`);
    }

    // Appel unifié à super.handleIntent à la fin
    return super.handleIntent(context, userMessage, onIaResponse, forceSummary, autoResponse);
  }

  /**
   * Récupère les IDs disponibles depuis le contexte
   */
  protected getAvailableIds(context: HowanaContext): {
    availablePracticeIds: string[];
    availableActivityIds: string[];
    availableHowerAngelIds: string[];
  } {
    const recommendations = context.recommendations || { activities: [], practices: [] };
    const availablePracticeIds = recommendations.practices?.map((item: any) => item.id).filter((id: any) => id) || [];
    const availableActivityIds = recommendations.activities?.map((item: any) => item.id).filter((id: any) => id) || [];
    
    // Récupérer les hower angels depuis globalIntentInfos ou intentResults
    const globalIntentInfos = context.metadata?.['globalIntentInfos'] as any;
    const intentResults = context.metadata?.['intentResults'] as any;
    const availableHowerAngelIds: string[] = [];
    
    if (globalIntentInfos?.howerAngels) {
      globalIntentInfos.howerAngels.forEach((item: any) => {
        if (item.userId) availableHowerAngelIds.push(item.userId);
      });
    }
    if (intentResults?.howerAngels) {
      intentResults.howerAngels.forEach((item: any) => {
        if (item.userId && !availableHowerAngelIds.includes(item.userId)) {
          availableHowerAngelIds.push(item.userId);
        }
      });
    }
    
    return {
      availablePracticeIds,
      availableActivityIds,
      availableHowerAngelIds
    };
  }

  /**
   * Construit les informations de contexte pour rdvContext (fragment, description, handle)
   */
  protected getRdvContextInfo(_context: HowanaContext): { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> } {
    return {
      fragment: {
        type: ["object", "null"],
        description: "Contexte de rendez-vous si l'intent est 'take_rdv'",
        properties: {
          type: {
            type: "string",
            description: "Type de rendez-vous",
            enum: ["hower_angel", "activity", "practice"]
          },
          id: {
            type: "string",
            description: "ID associé au type de rendez-vous (ID du hower_angel, de l'activité ou de la pratique)"
          },
          designation: {
            type: ["string", "null"],
            description: "Nom du hower angel, de la pratique ou de l'activité mentionné (peut être null si non connu)"
          },
          format: {
            type: ["string", "null"],
            description: "Format de recommandation préféré par l'utilisateur si expressément mentionné : 'remote' (à distance/en ligne), 'inPerson' (en personne/présentiel), ou 'any' (les deux formats acceptés). Si l'utilisateur n'a pas expressément décidé, utiliser null (sera traité comme 'inPerson' par défaut)",
            enum: ["remote", "inPerson", "any"]
          }
        },
        required: ["type", "id", "format", "designation"],
        additionalProperties: false
      },
      description: "take_rdv: Demande explicite de prendre un rendez-vous avec une personne précise ou une activité (déduite du contexte)",
      handle: async (intent, context, _userMessage, globalIntentInfos) => {
        if (!globalIntentInfos) {
          return context;
        }
        console.log('ℹ️ Intent "take_rdv" détecté - valorisation de intentResults avec les informations de rendez-vous');
        
        // Si c'est une confirmation, reconstruire le contexte depuis confirmationContext
        let type: 'hower_angel' | 'activity' | 'practice';
        let designation: string;
        
        if (intent.intent === RecommendationChatBotService.INTENT_NAMES.CONFIRMATION && intent.confirmationContext) {
          // Reconstruire le contexte depuis confirmationContext et globalIntentInfos
          const confirmationType = intent.confirmationContext.type;
          type = confirmationType;
          
          // Récupérer la désignation depuis l'élément confirmé dans globalIntentInfos
          if (confirmationType === 'hower_angel' && globalIntentInfos.focusedHowerAngel) {
            const howerAngel = globalIntentInfos.focusedHowerAngel;
            designation = `${howerAngel.firstName || ''} ${howerAngel.lastName || ''}`.trim() || 'ce hower angel';
          } else if (confirmationType === 'activity' && globalIntentInfos.focusedActivity) {
            designation = globalIntentInfos.focusedActivity.title;
          } else if (confirmationType === 'practice' && globalIntentInfos.focusedPractice) {
            designation = globalIntentInfos.focusedPractice.title;
          } else {
            console.warn('⚠️ Élément confirmé non trouvé dans globalIntentInfos');
            return context;
          }
        } else {
          // Cas normal : utiliser rdvContext
          if (!intent.rdvContext) {
            console.warn('⚠️ rdvContext manquant dans l\'intent take_rdv');
            return context;
          }
          type = intent.rdvContext.type;
          designation = intent.rdvContext.designation || '';
        }
        let intentResultsText = '';

        // Construire le message contextuel selon le type
        if (type === 'hower_angel') {
          if (globalIntentInfos.focusedHowerAngel) {
            const howerAngel = globalIntentInfos.focusedHowerAngel;
            
            // Si on n'a pas de focusedActivity, fournir l'objet howerAngel complet
            if (!globalIntentInfos.focusedActivity) {
              intentResultsText = `L'utilisateur souhaite prendre rendez-vous avec le hower angel suivant : ${JSON.stringify(howerAngel, null, 2)}\n\n`;
              intentResultsText += `IMPORTANT: Tu dois choisir les 2 activités les plus pertinentes parmi celles disponibles dans l'objet ci-dessus (en utilisant leurs IDs dans les quickReplies de type 'activity_rdv' avec activityId) et mentionner l'option "voir toutes les activités" comme 3ème choix (en utilisant un quickReply de type 'hower_angel_rdv' avec howerAngelId=${howerAngel.userId} et text='Voir toutes les activités').`;
            } else {
              // On a une focusedActivity, utiliser son ID
              const activity = globalIntentInfos.focusedActivity;
              
              intentResultsText = `L'utilisateur souhaite prendre rendez-vous pour l'activité suivante : ${JSON.stringify({
                id: activity.id,
                title: activity.title,
                shortDescription: activity.shortDescription,
                longDescription: activity.longDescription,
              }, null, 2)}\n\n`;
              
              intentResultsText += `ID de l'activité pour rendez-vous: ${activity.id}`;
            }
          } else if (globalIntentInfos.pendingConfirmations.focusedHowerAngel) {
            const pendingHowerAngel = globalIntentInfos.pendingConfirmations.focusedHowerAngel;
            const fullName = `${pendingHowerAngel.firstName || ''} ${pendingHowerAngel.lastName || ''}`.trim() || 'ce hower angel';
            intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais ce hower angel n'a pas encore été confirmé. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${fullName}" pour lequel il veut prendre rendez-vous.`;
          } else {
            intentResultsText = `L'utilisateur mentionne "${designation}" mais ce hower angel n'a pas pu être identifié avec certitude. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement (nom complet, spécialité, etc.).`;
          }
        } else if (type === 'activity') {
          // Vérifier d'abord s'il y a un hower angel en pending confirmation
          if (globalIntentInfos.pendingConfirmations.focusedHowerAngel) {
            const pendingHowerAngel = globalIntentInfos.pendingConfirmations.focusedHowerAngel;
            const fullName = `${pendingHowerAngel.firstName || ''} ${pendingHowerAngel.lastName || ''}`.trim() || 'ce hower angel';
            intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais le hower angel n'a pas encore été confirmé. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${fullName}" dont il parle.`;
          } else {
            // Vérifier d'abord si on a une activité disponible (focused ou pending)
            const activity = globalIntentInfos.focusedActivity || globalIntentInfos.pendingConfirmations.focusedActivity;
            
            if (activity) {
              // On a une activité, comportement normal
              if (globalIntentInfos.focusedActivity) {
                intentResultsText = `L'utilisateur souhaite prendre rendez-vous pour l'activité suivante : ${JSON.stringify({
                  id: activity.id,
                  title: activity.title,
                  shortDescription: activity.shortDescription,
                  longDescription: activity.longDescription,
                }, null, 2)}\n\n`;
                
                intentResultsText += `ID de l'activité pour rendez-vous: ${activity.id}`;
              } else {
                // Activité en pending
                intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cette activité n'a pas encore été confirmée. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${activity.title}" pour laquelle il veut prendre rendez-vous.`;
              }
            } else {
              // Pas d'activité, vérifier si on a une pratique (focused ou pending) avec un hower angel
              const practice = globalIntentInfos.focusedPractice || globalIntentInfos.pendingConfirmations.focusedPractice;
              
              if (practice && globalIntentInfos.focusedHowerAngel) {
                // Chercher les activités du hower angel qui correspondent à cette pratique
                const howerAngel = globalIntentInfos.focusedHowerAngel;
                const matchingActivities = howerAngel.activities?.filter(activity => {
                  // Vérifier si l'activité correspond à la pratique via les selectedKeywords
                  if (activity.selectedKeywords && Array.isArray(activity.selectedKeywords)) {
                    return activity.selectedKeywords.some((keyword: any) => 
                      keyword === practice.id || 
                      (typeof keyword === 'object' && keyword.id === practice.id)
                    );
                  }
                  return false;
                }) || [];
                
                if (matchingActivities.length > 0) {
                  // Des activités correspondent à la pratique
                  const howerAngelFullName = `${howerAngel.firstName || ''} ${howerAngel.lastName || ''}`.trim() || 'ce hower angel';
                  intentResultsText = `L'utilisateur recherche une activité qui correspond à la pratique "${practice.title}". `;
                  intentResultsText += `Voici les activités disponibles du hower angel "${howerAngelFullName}" qui correspondent à cette pratique : ${JSON.stringify(matchingActivities.map(activity => ({
                    id: activity.id,
                    title: activity.title,
                    shortDescription: activity.shortDescription,
                    longDescription: activity.longDescription,
                    durationMinutes: activity.durationMinutes,
                    participants: activity.participants,
                    rating: activity.rating,
                    price: activity.price,
                    benefits: activity.benefits,
                    locationType: activity.locationType,
                    address: activity.address,
                    selectedKeywords: activity.selectedKeywords
                  })), null, 2)}`;
                } else {
                  // Aucune activité ne correspond - récupérer toutes les activités du hower angel
                  const howerAngelFullName = `${howerAngel.firstName || ''} ${howerAngel.lastName || ''}`.trim() || 'ce hower angel';
                  const allActivities = howerAngel.activities || [];
                  
                  // Mapper les activités en ActivityItem
                  const activityItems: ActivityItem[] = allActivities.map((activity: any) => ({
                    type: 'activity' as const,
                    id: activity.id,
                    title: activity.title,
                    shortDescription: activity.shortDescription,
                    longDescription: activity.longDescription,
                    durationMinutes: activity.durationMinutes,
                    participants: activity.participants,
                    rating: activity.rating,
                    price: activity.price,
                    benefits: activity.benefits,
                    locationType: activity.locationType,
                    address: activity.address,
                    selectedKeywords: activity.selectedKeywords,
                    typicalSituations: activity.typicalSituations,
                    relevanceScore: 0.5 // Score par défaut pour les activités disponibles
                  }));
                  
                  // Ajouter les activités dans le contexte via intentResults
                  const activityIntentResults: IntentResults = { 
                    activities: activityItems, 
                    practices: [], 
                    howerAngels: [] 
                  };
                  context.metadata = {
                    ...context.metadata,
                    ['intentResults']: activityIntentResults
                  };
                  
                  // Construire le message pour l'IA
                  intentResultsText = `L'utilisateur mentionne "${designation}" mais le hower angel "${howerAngelFullName}" ne propose pas encore d'activité spécifique pour la pratique "${practice.title}". `;
                  intentResultsText += `Cependant, ce hower angel propose ${allActivities.length} autre(s) activité(s) disponible(s). `;
                  intentResultsText += `Tu dois informer l'utilisateur que ce hower angel ne propose pas encore d'activité pour cette pratique, mais qu'il peut :\n`;
                  intentResultsText += `1. Voir les autres activités disponibles de ce hower angel (tu dois proposer les 2 activités les plus pertinentes parmi celles disponibles dans le contexte, en utilisant des quickReplies de type 'activity_rdv' avec activityId)\n`;
                  intentResultsText += `2. Contacter directement le hower angel (en utilisant un quickReply de type 'hower_angel_rdv' avec howerAngelId=${howerAngel.userId} et text='Voir le profil')\n\n`;
                  intentResultsText += `Voici toutes les activités disponibles du hower angel "${howerAngelFullName}" : ${JSON.stringify(activityItems.map(activity => ({
                    id: activity.id,
                    title: activity.title,
                    shortDescription: activity.shortDescription,
                    longDescription: activity.longDescription,
                    durationMinutes: activity.durationMinutes,
                    participants: activity.participants,
                    rating: activity.rating,
                    price: activity.price,
                    benefits: activity.benefits,
                    locationType: activity.locationType,
                    address: activity.address,
                    selectedKeywords: activity.selectedKeywords
                  })), null, 2)}`;
                }
              } else {
                // Pas d'activité, pas de pratique avec hower angel
                intentResultsText = `L'utilisateur mentionne "${designation}" mais cette activité n'a pas pu être identifiée avec certitude. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement (nom complet, type d'activité, etc.).`;
              }
            }
          }
        } else if (type === 'practice') {
          // Vérifier d'abord s'il y a un hower angel en pending confirmation
          if (globalIntentInfos.pendingConfirmations.focusedHowerAngel) {
            const pendingHowerAngel = globalIntentInfos.pendingConfirmations.focusedHowerAngel;
            const fullName = `${pendingHowerAngel.firstName || ''} ${pendingHowerAngel.lastName || ''}`.trim() || 'ce hower angel';
            intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais le hower angel n'a pas encore été confirmé. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${fullName}" dont il parle.`;
          } else {
            // Vérifier si on a une pratique (focused ou pending)
            const practice = globalIntentInfos.focusedPractice || globalIntentInfos.pendingConfirmations.focusedPractice;
            
            if (practice && globalIntentInfos.focusedHowerAngel) {
              // Si on a une pratique ET un hower angel, chercher les activités du hower angel qui correspondent à cette pratique
              const howerAngel = globalIntentInfos.focusedHowerAngel;
              const matchingActivities = howerAngel.activities?.filter(activity => {
                // Vérifier si l'activité correspond à la pratique via les selectedKeywords
                if (activity.selectedKeywords && Array.isArray(activity.selectedKeywords)) {
                  return activity.selectedKeywords.some((keyword: any) => 
                    keyword === practice.id || 
                    (typeof keyword === 'object' && keyword.id === practice.id)
                  );
                }
                return false;
              }) || [];
              
              if (matchingActivities.length > 0) {
                // Des activités correspondent à la pratique
                const howerAngelFullName = `${howerAngel.firstName || ''} ${howerAngel.lastName || ''}`.trim() || 'ce hower angel';
                intentResultsText = `L'utilisateur recherche une activité qui correspond à la pratique "${practice.title}". `;
                intentResultsText += `Voici les activités disponibles du hower angel "${howerAngelFullName}" qui correspondent à cette pratique : ${JSON.stringify(matchingActivities.map(activity => ({
                  id: activity.id,
                  title: activity.title,
                  shortDescription: activity.shortDescription,
                  longDescription: activity.longDescription,
                  durationMinutes: activity.durationMinutes,
                  participants: activity.participants,
                  rating: activity.rating,
                  price: activity.price,
                  benefits: activity.benefits,
                  locationType: activity.locationType,
                  address: activity.address,
                  selectedKeywords: activity.selectedKeywords
                })), null, 2)}`;
              } else {
                // Aucune activité ne correspond, utiliser le comportement par défaut
                intentResultsText = `L'utilisateur souhaite prendre rendez-vous pour la pratique suivante : ${JSON.stringify({
                  id: practice.id,
                  title: practice.title,
                  shortDescription: practice.shortDescription,
                  longDescription: practice.longDescription,
                }, null, 2)}\n\n`;
                
                intentResultsText += `ID de la pratique pour rendez-vous: ${practice.id}`;
              }
            } else if (globalIntentInfos.focusedPractice) {
              // Pratique focused mais pas de hower angel
              const practice = globalIntentInfos.focusedPractice;
              
              intentResultsText = `L'utilisateur souhaite prendre rendez-vous pour la pratique suivante : ${JSON.stringify({
                id: practice.id,
                title: practice.title,
                shortDescription: practice.shortDescription,
                longDescription: practice.longDescription,
              }, null, 2)}\n\n`;
              
              intentResultsText += `ID de la pratique pour rendez-vous: ${practice.id}`;
            } else if (globalIntentInfos.pendingConfirmations.focusedPractice) {
              const pendingPractice = globalIntentInfos.pendingConfirmations.focusedPractice;
              intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cette pratique n'a pas encore été confirmée. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${pendingPractice.title}" pour laquelle il veut prendre rendez-vous.`;
            } else {
              intentResultsText = `L'utilisateur mentionne "${designation}" mais cette pratique n'a pas pu être identifiée avec certitude. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement (nom complet, type de pratique, etc.).`;
            }
          }
        }

        // Mettre à jour le contexte avec intentResults
        // Si intentResults est déjà un objet (IntentResults), ne pas l'écraser avec le texte
        // mais mettre le texte dans intentResultsText pour le prompt
        const existingIntentResults = context.metadata?.['intentResults'];
        const isIntentResultsObject = existingIntentResults && typeof existingIntentResults === 'object' && !Array.isArray(existingIntentResults) && 'activities' in existingIntentResults;
        
        const updatedMetadata: any = {
          ...context.metadata,
          // Ne pas écraser l'objet IntentResults si on l'a déjà mis, mais mettre le texte dans intentResultsText
          ...(isIntentResultsObject ? { ['intentResultsText']: intentResultsText } : { ['intentResults']: intentResultsText })
        };
        
        context.metadata = updatedMetadata;

        return context;
      }
    };
  }

  /**
   * Construit le fragment de schéma pour searchContext (base commune)
   */
  protected getBaseSearchContextFragment(): any {
    const chunkInfo = this.getChunkInfo();
    const chunkDescriptions = Object.values(chunkInfo)
      .map(chunk => `- "${chunk.type}": ${chunk.description}`)
      .join('\n');
    const chunkEnum = Object.values(chunkInfo).map(chunk => chunk.type);

    return {
      searchType: {
        type: "string",
        description: "Type de recherche à effectuer",
        enum: ["activity", "hower_angel", "practice"]
      },
      searchFormat: {
        type: "string",
        description: "Format de recherche : 'from_user_situation' pour une recherche basée sur la situation de l'utilisateur, 'from_name_query' pour une recherche par nom",
        enum: ["from_user_situation", "from_name_query"]
      },
      searchChunks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description: `Type du chunk. Valeurs possibles:\n${chunkDescriptions}`,
              enum: chunkEnum
            },
            text: {
              type: "string",
              description: "Texte du chunk (par exemple: \"Marie Dupont\" pour un nom complet, ou \"Je me sens...\" pour un fragment de situation)"
            }
          },
          required: ["type", "text"],
          additionalProperties: false
        },
        description: "Chunks représentant la situation de l'utilisateur (de son point de vue, par exemple: \"Je me sens...\", \"J'ai besoin...\") ou bien la recherche demandée (par exemple: \"sphorologie\", \"activité douce\", \"Marie Dupont\" pour rechercher un hower angel par nom, ...). Chaque chunk doit avoir un type pour indiquer s'il s'agit d'un nom complet ou d'un fragment de situation utilisateur."
      }
    };
  }

  /**
     * Retourne les informations sur les types de chunks (type et description)
     */
  protected getChunkInfo(): Record<string, { type: string; description: string }> {
    return {
      [RecommendationChatBotService.CHUNK_TYPES.HOWER_ANGEL_NAME_INFO]: {
        type: RecommendationChatBotService.CHUNK_TYPES.HOWER_ANGEL_NAME_INFO,
        description: "Recherche par nom complet d'un hower angel"
      },
      [RecommendationChatBotService.CHUNK_TYPES.USER_SITUATION_CHUNK]: {
        type: RecommendationChatBotService.CHUNK_TYPES.USER_SITUATION_CHUNK,
        description: "Fragment de situation utilisateur (de son point de vue, par exemple: \"Je me sens...\", \"J'ai besoin...\")"
      },
      [RecommendationChatBotService.CHUNK_TYPES.I_HAVE_SYMPTOME_CHUNK]: {
        type: RecommendationChatBotService.CHUNK_TYPES.I_HAVE_SYMPTOME_CHUNK,
        description: "Fragment décrivant un symptôme que l'utilisateur a (par exemple: \"J'ai des maux de tête\", \"Je ressens de la fatigue\")"
      },
      [RecommendationChatBotService.CHUNK_TYPES.WITH_BENEFIT_CHUNK]: {
        type: RecommendationChatBotService.CHUNK_TYPES.WITH_BENEFIT_CHUNK,
        description: "Fragment décrivant un bénéfice recherché (par exemple: \"pour me détendre\", \"pour réduire le stress\")"
      },
      [RecommendationChatBotService.CHUNK_TYPES.CATEGORY_NAME_INFO]: {
        type: RecommendationChatBotService.CHUNK_TYPES.CATEGORY_NAME_INFO,
        description: "Nom d'une catégorie d'activité ou de pratique"
      }
    };
  }


  /**
   * Construit les informations de contexte pour searchContext - search_hower_angel (fragment, description, handle)
   */
  protected getSearchHowerAngelContextInfo(
    _availablePracticeIds: string[],
    _availableActivityIds: string[],
    _availableHowerAngelIds: string[]
  ): { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> } {
    const properties = this.getBaseSearchContextFragment();
    
    return {
      fragment: {
        type: ["object", "null"],
        description: "Contexte de recherche pour les requêtes sémantiques (recherche de hower angels)",
        properties,
        required: ["searchChunks", "searchType", "searchFormat"],
        additionalProperties: false
      },
      description: `search_hower_angel: Demande explicite d'information sur une personne ou bien sur une catégorie de personne. Réservé à la recherche d'un hower angel qui n'a pas été précédemment cité dans l'échange. Si le hower angel a déjà été mentionné dans la conversation, utiliser ${RecommendationChatBotService.INTENT_NAMES.KNOW_MORE} à la place.`,
      handle: async (intent, context, _userMessage, _globalIntentInfos) => {
        if (!intent.searchContext) {
          console.log('⚠️ Aucun searchContext dans l\'intent');
          return context;
        }
        const { searchChunks } = intent.searchContext;
        if (!searchChunks || searchChunks.length === 0) {
          console.log('⚠️ Aucun searchChunks dans l\'intent');
          return context;
        }
        try {
          const searchChunksTexts = searchChunks.map(chunk => chunk.text);
          console.log(`🔍 Recherche de hower angels avec ${searchChunks.length} chunks`);
          
          const howerAngelsResult = await this.supabaseService.searchHowerAngelsByUserSituation(searchChunksTexts);
          if (!howerAngelsResult.success) {
            console.error('❌ Erreur lors de la recherche de hower angels:', howerAngelsResult.error);
            // Recalculer globalIntentInfos même en cas d'erreur
            const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context);
            context.metadata = {
              ...context.metadata,
              ['globalIntentInfos']: globalIntentInfos
            };
            return context;
          }
          
          const howerAngels: HowerAngelItem[] = howerAngelsResult.data
            ? howerAngelsResult.data.map(item => ({
                ...item,
                profile: item.profile || '' // Garantir que profile est toujours présent
              }))
            : [];
          console.log(`✅ ${howerAngels.length} hower angels trouvés`);
          
          // Ajouter les résultats dans les métadonnées
          const howerAngelIntentResults: IntentResults = { activities: [], practices: [], howerAngels };
          context.metadata = {
            ...context.metadata,
            ['intentResults']: howerAngelIntentResults
          };

          // Recalculer globalIntentInfos pour avoir accès aux intentResults
          const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context);
          context.metadata = {
            ...context.metadata,
            ['globalIntentInfos']: globalIntentInfos
          };
        } catch (error) {
          console.error('❌ Erreur lors du traitement de l\'intent:', error);
        }
        return context;
      }
    };
  }

  /**
   * Construit les informations de contexte pour searchContext - search_activities (fragment, description, handle)
   */
  protected getSearchActivitiesContextInfo(
    _availablePracticeIds: string[],
    _availableActivityIds: string[],
    _availableHowerAngelIds: string[]
  ): { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> } {
    const properties = this.getBaseSearchContextFragment();
    
    return {
      fragment: {
        type: ["object", "null"],
        description: "Contexte de recherche pour les requêtes sémantiques (recherche d'activités)",
        properties,
        required: ["searchChunks", "searchType", "searchFormat"],
        additionalProperties: false
      },
      description: `search_activities: Recherche d'une activité particulière ou un type d'activité. Réservé à la recherche d'une activité qui n'a pas été précédemment citée dans l'échange. Si l'activité a déjà été mentionnée dans la conversation, utiliser ${RecommendationChatBotService.INTENT_NAMES.KNOW_MORE} à la place.`,
      handle: async (intent, context, _userMessage, _globalIntentInfos) => {
        if (!intent.searchContext) {
          console.log('⚠️ Aucun searchContext dans l\'intent');
          return context;
        }
        const { searchChunks, searchType } = intent.searchContext;
        if (!searchChunks || searchChunks.length === 0) {
          console.log('⚠️ Aucun searchChunks dans l\'intent');
          return context;
        }
        try {
          const searchChunksTexts = searchChunks.map(chunk => chunk.text);
          
          // Pour les recherches, effectuer les recherches d'abord
          switch (searchType) {
            case 'activity':
              console.log(`🔍 Recherche d'activités avec ${searchChunks.length} chunks`);
              const activitiesResults = await this.supabaseService.searchActivitiesBySituationChunks(searchChunksTexts);
              const activities: ActivityItem[] = activitiesResults.results || [];
              console.log(`✅ ${activities.length} activités trouvées`);
              
              // Ajouter les résultats dans les métadonnées
              const activityIntentResults: IntentResults = { activities, practices: [], howerAngels: [] };
              context.metadata = {
                ...context.metadata,
                ['intentResults']: activityIntentResults
              };

              // Recalculer globalIntentInfos pour avoir accès aux intentResults
              const globalIntentInfosActivity = await this.computeGlobalIntentInfos(intent, context);
              context.metadata = {
                ...context.metadata,
                ['globalIntentInfos']: globalIntentInfosActivity
              };
              return context;
              
            case 'practice':
              console.log(`🔍 Recherche de pratiques avec ${searchChunks.length} chunks`);
              const practicesResults = await this.supabaseService.searchPracticesBySituationChunks(searchChunksTexts);
              const practices: PracticeItem[] = practicesResults.results || [];
              console.log(`✅ ${practices.length} pratiques trouvées`);
              
              // Ajouter les résultats dans les métadonnées
              const practiceIntentResults: IntentResults = { activities: [], practices, howerAngels: [] };
              context.metadata = {
                ...context.metadata,
                ['intentResults']: practiceIntentResults
              };

              // Recalculer globalIntentInfos pour avoir accès aux intentResults
              const globalIntentInfosPractice = await this.computeGlobalIntentInfos(intent, context);
              context.metadata = {
                ...context.metadata,
                ['globalIntentInfos']: globalIntentInfosPractice
              };
              return context;
              
            case 'hower_angel':
              console.log(`🔍 Recherche de hower angels avec ${searchChunks.length} chunks`);
              const howerAngelsResult = await this.supabaseService.searchHowerAngelsByUserSituation(searchChunksTexts);
              if (!howerAngelsResult.success) {
                console.error('❌ Erreur lors de la recherche de hower angels:', howerAngelsResult.error);
                // Recalculer globalIntentInfos même en cas d'erreur
                const globalIntentInfosError = await this.computeGlobalIntentInfos(intent, context);
                context.metadata = {
                  ...context.metadata,
                  ['globalIntentInfos']: globalIntentInfosError
                };
                return context;
              }
              
              const howerAngels: HowerAngelItem[] = howerAngelsResult.data
                ? howerAngelsResult.data.map(item => ({
                    ...item,
                    profile: item.profile || '' // Garantir que profile est toujours présent
                  }))
                : [];
              console.log(`✅ ${howerAngels.length} hower angels trouvés`);
              
              // Ajouter les résultats dans les métadonnées
              const howerAngelIntentResults: IntentResults = { activities: [], practices: [], howerAngels };
              context.metadata = {
                ...context.metadata,
                ['intentResults']: howerAngelIntentResults
              };

              // Recalculer globalIntentInfos pour avoir accès aux intentResults
              const globalIntentInfosHowerAngel = await this.computeGlobalIntentInfos(intent, context);
              context.metadata = {
                ...context.metadata,
                ['globalIntentInfos']: globalIntentInfosHowerAngel
              };
              return context;
              
            default:
              console.warn(`⚠️ searchType non reconnu: ${searchType}`);
              return context;
          }
        } catch (error) {
          console.error('❌ Erreur lors du traitement de l\'intent:', error);
          return context;
        }
      }
    };
  }

  /**
   * Construit les informations de contexte pour searchContext - search_practice (fragment, description, handle)
   */
  protected getSearchPracticeContextInfo(
    _availablePracticeIds: string[],
    _availableActivityIds: string[],
    _availableHowerAngelIds: string[]
  ): { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> } {
    const properties = this.getBaseSearchContextFragment();
    
    return {
      fragment: {
        type: ["object", "null"],
        description: "Contexte de recherche pour les requêtes sémantiques (recherche de pratiques)",
        properties,
        required: ["searchChunks", "searchType", "searchFormat"],
        additionalProperties: false
      },
      description: `search_practice: Recherche d'une pratique particulière ou un type de pratique. Réservé à la recherche d'une pratique qui n'a pas été précédemment citée dans l'échange. Si la pratique a déjà été mentionnée dans la conversation, utiliser ${RecommendationChatBotService.INTENT_NAMES.KNOW_MORE} à la place.`,
      handle: async (intent, context, _userMessage, _globalIntentInfos) => {
        if (!intent.searchContext) {
          console.log('⚠️ Aucun searchContext dans l\'intent');
          return context;
        }
        const { searchChunks } = intent.searchContext;
        if (!searchChunks || searchChunks.length === 0) {
          console.log('⚠️ Aucun searchChunks dans l\'intent');
          return context;
        }
        try {
          // Pour search_practice, on recherche toujours des pratiques
          const searchChunksTexts = searchChunks.map(chunk => chunk.text);
          console.log(`🔍 Recherche de pratiques avec ${searchChunks.length} chunks`);
          
          const practicesResults = await this.supabaseService.searchPracticesBySituationChunks(searchChunksTexts);
          const practices: PracticeItem[] = practicesResults.results || [];
          console.log(`✅ ${practices.length} pratiques trouvées`);
          
          // Ajouter les résultats dans les métadonnées
          const practiceIntentResults: IntentResults = { activities: [], practices, howerAngels: [] };
          context.metadata = {
            ...context.metadata,
            ['intentResults']: practiceIntentResults
          };

          // Recalculer globalIntentInfos pour avoir accès aux intentResults
          const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context);
          context.metadata = {
            ...context.metadata,
            ['globalIntentInfos']: globalIntentInfos
          };

          return context;
        } catch (error) {
          console.error('❌ Erreur lors du traitement de l\'intent:', error);
          return context;
        }
      }
    };
  }

  /**
   * Construit les informations de contexte pour searchContext - search_symptom (fragment, description, handle)
   */
  protected getSearchSymptomContextInfo(
    _availablePracticeIds: string[],
    _availableActivityIds: string[],
    _availableHowerAngelIds: string[]
  ): { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> } {
    const properties = this.getBaseSearchContextFragment();
    
    return {
      fragment: {
        type: ["object", "null"],
        description: "Contexte de recherche pour les requêtes concernant des symptômes",
        properties,
        required: ["searchChunks", "searchType", "searchFormat"],
        additionalProperties: false
      },
      description: `search_symptom: Recherche concernant un symptôme que l'utilisateur ressent. Réservé à la recherche d'un symptôme qui n'a pas été précédemment cité dans l'échange. Si le symptôme a déjà été mentionné dans la conversation, utiliser ${RecommendationChatBotService.INTENT_NAMES.KNOW_MORE} à la place.`,
      handle: async (intent, context, _userMessage, _globalIntentInfos) => {
        if (!intent.searchContext) {
          console.log('⚠️ Aucun searchContext dans l\'intent');
          return context;
        }
        const { searchChunks, searchType } = intent.searchContext;
        if (!searchChunks || searchChunks.length === 0) {
          console.log('⚠️ Aucun searchChunks dans l\'intent');
          return context;
        }
        try {
          const searchChunksTexts = searchChunks.map(chunk => chunk.text);
          
          // Pour les recherches de symptômes, effectuer les recherches d'abord
          switch (searchType) {
            case 'activity':
              console.log(`🔍 Recherche d'activités pour symptôme avec ${searchChunks.length} chunks`);
              const activitiesResults = await this.supabaseService.searchActivitiesBySituationChunks(searchChunksTexts);
              const activities: ActivityItem[] = activitiesResults.results || [];
              console.log(`✅ ${activities.length} activités trouvées pour le symptôme`);
              
              // Ajouter les résultats dans les métadonnées
              const activityIntentResults: IntentResults = { activities, practices: [], howerAngels: [] };
              context.metadata = {
                ...context.metadata,
                ['intentResults']: activityIntentResults
              };

              // Recalculer globalIntentInfos pour avoir accès aux intentResults
              const globalIntentInfosActivity = await this.computeGlobalIntentInfos(intent, context);
              context.metadata = {
                ...context.metadata,
                ['globalIntentInfos']: globalIntentInfosActivity
              };
              return context;
              
            case 'practice':
              console.log(`🔍 Recherche de pratiques pour symptôme avec ${searchChunks.length} chunks`);
              const practicesResults = await this.supabaseService.searchPracticesBySituationChunks(searchChunksTexts);
              const practices: PracticeItem[] = practicesResults.results || [];
              console.log(`✅ ${practices.length} pratiques trouvées pour le symptôme`);
              
              // Ajouter les résultats dans les métadonnées
              const practiceIntentResults: IntentResults = { activities: [], practices, howerAngels: [] };
              context.metadata = {
                ...context.metadata,
                ['intentResults']: practiceIntentResults
              };

              // Recalculer globalIntentInfos pour avoir accès aux intentResults
              const globalIntentInfosPractice = await this.computeGlobalIntentInfos(intent, context);
              context.metadata = {
                ...context.metadata,
                ['globalIntentInfos']: globalIntentInfosPractice
              };
              return context;
              
            case 'hower_angel':
              console.log(`🔍 Recherche de hower angels pour symptôme avec ${searchChunks.length} chunks`);
              const howerAngelsResult = await this.supabaseService.searchHowerAngelsByUserSituation(searchChunksTexts);
              if (!howerAngelsResult.success) {
                console.error('❌ Erreur lors de la recherche de hower angels:', howerAngelsResult.error);
                // Recalculer globalIntentInfos même en cas d'erreur
                const globalIntentInfosError = await this.computeGlobalIntentInfos(intent, context);
                context.metadata = {
                  ...context.metadata,
                  ['globalIntentInfos']: globalIntentInfosError
                };
                return context;
              }
              
              const howerAngels: HowerAngelItem[] = howerAngelsResult.data
                ? howerAngelsResult.data.map(item => ({
                    ...item,
                    profile: item.profile || '' // Garantir que profile est toujours présent
                  }))
                : [];
              console.log(`✅ ${howerAngels.length} hower angels trouvés pour le symptôme`);
              
              // Ajouter les résultats dans les métadonnées
              const howerAngelIntentResults: IntentResults = { activities: [], practices: [], howerAngels };
              context.metadata = {
                ...context.metadata,
                ['intentResults']: howerAngelIntentResults
              };

              // Recalculer globalIntentInfos pour avoir accès aux intentResults
              const globalIntentInfosHowerAngel = await this.computeGlobalIntentInfos(intent, context);
              context.metadata = {
                ...context.metadata,
                ['globalIntentInfos']: globalIntentInfosHowerAngel
              };
              return context;
              
            default:
              console.warn(`⚠️ searchType non reconnu: ${searchType}`);
              return context;
          }
        } catch (error) {
          console.error('❌ Erreur lors du traitement de l\'intent search_symptom:', error);
          return context;
        }
      }
    };
  }

  /**
   * Construit les informations de contexte pour searchContext - search_other_advice (fragment, description, handle)
   */
  protected getSearchOtherAdviceContextInfo(
    _availablePracticeIds: string[],
    _availableActivityIds: string[],
    _availableHowerAngelIds: string[]
  ): { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> } {
    return {
      fragment: {
        type: ["object", "null"],
        description: `Contexte de recherche pour les requêtes de conseils généraux (ne concernant pas un symptôme [utiliser ${RecommendationChatBotService.INTENT_NAMES.SEARCH_SYMPTOM}], un hower angel [utiliser ${RecommendationChatBotService.INTENT_NAMES.SEARCH_HOWER_ANGEL}], une pratique [utiliser ${RecommendationChatBotService.INTENT_NAMES.SEARCH_PRACTICE}], ou une activité [utiliser ${RecommendationChatBotService.INTENT_NAMES.SEARCH_ACTIVITIES}])`,
        properties: {
          searchChunks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: (() => {
                    const chunkInfo = this.getChunkInfo();
                    const userSituationChunk = chunkInfo[RecommendationChatBotService.CHUNK_TYPES.USER_SITUATION_CHUNK];
                    return `Type du chunk. Pour les conseils généraux, seul '${RecommendationChatBotService.CHUNK_TYPES.USER_SITUATION_CHUNK}' est utilisé pour représenter la situation ou la question de l'utilisateur${userSituationChunk ? ` (${userSituationChunk.description})` : ''}`;
                  })(),
                  enum: [RecommendationChatBotService.CHUNK_TYPES.USER_SITUATION_CHUNK]
                },
                text: {
                  type: "string",
                  description: "Texte du chunk représentant la demande de conseil général"
                }
              },
              required: ["type", "text"],
              additionalProperties: false
            },
            description: "Chunks représentant la demande de conseil général de l'utilisateur"
          }
        },
        required: ["searchChunks"],
        additionalProperties: false
      },
      description: `search_other_advice: Demande de conseil qui ne concerne pas un symptôme, un hower angel, une pratique, ou une activité. Si la demande concerne un symptôme, utiliser ${RecommendationChatBotService.INTENT_NAMES.SEARCH_SYMPTOM}. Si la demande concerne un hower angel, utiliser ${RecommendationChatBotService.INTENT_NAMES.SEARCH_HOWER_ANGEL}. Si la demande concerne une pratique, utiliser ${RecommendationChatBotService.INTENT_NAMES.SEARCH_PRACTICE}. Si la demande concerne une activité, utiliser ${RecommendationChatBotService.INTENT_NAMES.SEARCH_ACTIVITIES}.`,
      handle: async (intent, context, _userMessage, _globalIntentInfos) => {
        if (!intent.searchContext) {
          console.log('⚠️ Aucun searchContext dans l\'intent');
          return context;
        }
        const { searchChunks } = intent.searchContext;
        if (!searchChunks || searchChunks.length === 0) {
          console.log('⚠️ Aucun searchChunks dans l\'intent');
          return context;
        }
        try {
          // Combiner tous les chunks en un seul terme de recherche pour la FAQ
          const searchTerm = searchChunks.map(chunk => chunk.text).join(' ');
          console.log(`🔍 Recherche de conseils généraux (FAQ) avec le terme: "${searchTerm}"`);
          
          // Effectuer une recherche FAQ
          const faqResult = await this.searchFAQ(searchTerm);
          
          if (faqResult && faqResult.faq && faqResult.faq.length > 0) {
            console.log(`✅ ${faqResult.faq.length} FAQ trouvées`);
            
            // Ajouter les résultats FAQ dans les métadonnées via globalIntentInfos
            const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context);
            if (globalIntentInfos) {
              globalIntentInfos.focusedFaqs = faqResult.faq;
            }
            context.metadata = {
              ...context.metadata,
              ['globalIntentInfos']: globalIntentInfos
            };
          } else {
            console.log('ℹ️ Aucune FAQ trouvée pour cette demande de conseil');
            // Recalculer globalIntentInfos même si aucune FAQ n'est trouvée
            const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context);
            context.metadata = {
              ...context.metadata,
              ['globalIntentInfos']: globalIntentInfos
            };
          }
        } catch (error) {
          console.error('❌ Erreur lors du traitement de l\'intent search_other_advice:', error);
          // Recalculer globalIntentInfos même en cas d'erreur
          const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context);
          context.metadata = {
            ...context.metadata,
            ['globalIntentInfos']: globalIntentInfos
          };
        }
        return context;
      }
    };
  }

  /**
   * Construit les informations de contexte pour knowMoreContext (fragment, description, handle)
   */
  protected getKnowMoreContextInfo(_context: HowanaContext): { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> } {
    return {
      fragment: {
        type: ["object", "null"],
        description: "Quand l'intent est 'know_more', l'objectif de ce contexte est d'indiquer de quoi/qui est le sujet d'intérêt dont on veut en savoir plus",
        properties: {
          type: {
            type: "string",
            description: "Type de l'élément sur lequel on veut en savoir plus",
            enum: ["hower_angel", "activity", "practice", "subject"]
          },
          designation: {
            type: "string",
            description: "Nom du hower angel, de la pratique, de l'activité ou du sujet d'intérêt mentionné"
          },
          identifiant: {
            type: ["string", "null"],
            description: "Identifiant associé (peut être null si non connu)"
          }
        },
        required: ["type", "designation", "identifiant"],
        additionalProperties: false
      },
      description: "know_more: Demande plus d'information par rapport à un précédent résultat de la conversation",
      handle: async (intent, context, _userMessage, globalIntentInfos) => {
        if (!globalIntentInfos) {
          return context;
        }
        console.log('ℹ️ Intent "know_more" détecté - valorisation de intentResults avec les messages contextuels');
        
        // Si c'est une confirmation, reconstruire le contexte depuis confirmationContext
        let type: 'hower_angel' | 'activity' | 'practice' | 'subject';
        let designation: string;
        
        if (intent.intent === RecommendationChatBotService.INTENT_NAMES.CONFIRMATION && intent.confirmationContext) {
          // Reconstruire le contexte depuis confirmationContext et globalIntentInfos
          const confirmationType = intent.confirmationContext.type;
          type = confirmationType;
          
          // Récupérer la désignation depuis l'élément confirmé dans globalIntentInfos
          if (confirmationType === 'hower_angel' && globalIntentInfos.focusedHowerAngel) {
            const howerAngel = globalIntentInfos.focusedHowerAngel;
            designation = `${howerAngel.firstName || ''} ${howerAngel.lastName || ''}`.trim() || 'ce hower angel';
          } else if (confirmationType === 'activity' && globalIntentInfos.focusedActivity) {
            designation = globalIntentInfos.focusedActivity.title;
          } else if (confirmationType === 'practice' && globalIntentInfos.focusedPractice) {
            designation = globalIntentInfos.focusedPractice.title;
          } else {
            console.warn('⚠️ Élément confirmé non trouvé dans globalIntentInfos');
            return context;
          }
        } else {
          // Cas normal : utiliser knowMoreContext
          if (!intent.knowMoreContext) {
            console.warn('⚠️ knowMoreContext manquant dans l\'intent know_more');
            return context;
          }
          type = intent.knowMoreContext.type;
          designation = intent.knowMoreContext.designation;
        }
        let intentResultsText = '';

        // Construire le message contextuel selon le type et l'état de l'élément dans globalIntentInfos
        if (type === 'hower_angel') {
          if (globalIntentInfos.focusedHowerAngel) {
            // Élément focused existe
            const howerAngel = globalIntentInfos.focusedHowerAngel;
            intentResultsText = `L'utilisateur souhaite en savoir plus sur le hower angel suivant : ${JSON.stringify({
              id: howerAngel.id,
              userId: howerAngel.userId,
              firstName: howerAngel.firstName,
              lastName: howerAngel.lastName,
              profile: howerAngel.profile,
              specialties: howerAngel.specialties,
            }, null, 2)}`;
          } else if (globalIntentInfos.pendingConfirmations.focusedHowerAngel) {
            // Élément en attente de confirmation
            const pendingHowerAngel = globalIntentInfos.pendingConfirmations.focusedHowerAngel;
            const fullName = `${pendingHowerAngel.firstName || ''} ${pendingHowerAngel.lastName || ''}`.trim() || 'ce hower angel';
            intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cet élément n'a pas encore été confirmé. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${fullName}"dont il veut en savoir plus.`;
          } else {
            // Élément non trouvé, demander des précisions
            intentResultsText = `L'utilisateur mentionne "${designation}" mais cet élément n'a pas pu être identifié avec certitude. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement (nom complet, spécialité, etc.).`;
          }
        } else if (type === 'activity') {
          if (globalIntentInfos.focusedActivity) {
            // Élément focused existe
            const activity = globalIntentInfos.focusedActivity;
            intentResultsText = `L'utilisateur souhaite en savoir plus sur l'activité suivante : ${JSON.stringify({
              id: activity.id,
              title: activity.title,
              shortDescription: activity.shortDescription,
              longDescription: activity.longDescription,
            }, null, 2)}`;
          } else if (globalIntentInfos.pendingConfirmations.focusedActivity) {
            // Élément en attente de confirmation
            const pendingActivity = globalIntentInfos.pendingConfirmations.focusedActivity;
            intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cette activité n'a pas encore été confirmée. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${pendingActivity.title}" dont il veut en savoir plus.`;
          } else {
            // Élément non trouvé, demander des précisions
            intentResultsText = `L'utilisateur mentionne "${designation}" mais cette activité n'a pas pu être identifiée avec certitude. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement (nom complet, type d'activité, etc.).`;
          }
        } else if (type === 'practice') {
          if (globalIntentInfos.focusedPractice) {
            // Élément focused existe
            const practice = globalIntentInfos.focusedPractice;
            intentResultsText = `L'utilisateur souhaite en savoir plus sur la pratique suivante : ${JSON.stringify({
              id: practice.id,
              title: practice.title,
              shortDescription: practice.shortDescription,
              longDescription: practice.longDescription,
            }, null, 2)}`;
          } else if (globalIntentInfos.pendingConfirmations.focusedPractice) {
            // Élément en attente de confirmation
            const pendingPractice = globalIntentInfos.pendingConfirmations.focusedPractice;
            intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cette pratique n'a pas encore été confirmée. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${pendingPractice.title}" dont il veut en savoir plus.`;
          } else {
            // Élément non trouvé, demander des précisions
            intentResultsText = `L'utilisateur mentionne "${designation}" mais cette pratique n'a pas pu être identifiée avec certitude. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement (nom complet, type de pratique, etc.).`;
          }
        } else if (type === 'subject') {
          if (globalIntentInfos.focusedFaqs && globalIntentInfos.focusedFaqs.length > 0) {
            // FAQ trouvées
            const faqs = globalIntentInfos.focusedFaqs;
            intentResultsText = `L'utilisateur souhaite en savoir plus sur le sujet "${designation}". FAQ trouvées : ${JSON.stringify(faqs.map(faq => ({
              id: faq.id,
              question: faq.question,
            })), null, 2)}`;
          } else {
            // Sujet non trouvé, demander des précisions
            intentResultsText = `L'utilisateur mentionne le sujet "${designation}" mais aucune information pertinente n'a été trouvée. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement.`;
          }
        }

        // Mettre à jour le contexte avec intentResults (string)
        context.metadata = {
          ...context.metadata,
          ['intentResults']: intentResultsText
        };

        return context;
      }
    };
  }

  /**
   * Construit les informations de contexte pour confirmationContext (fragment, description, handle)
   */
  protected getConfirmationContextInfo(_context: HowanaContext): { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> } {
    return {
      fragment: {
        type: ["object", "null"],
        description: "Quand l'intent est 'confirmation', ce contexte indique quel type d'élément est confirmé",
        properties: {
          type: {
            type: "string",
            description: "Type de l'élément confirmé",
            enum: ["hower_angel", "activity", "practice"]
          },
          intent: {
            type: "string",
            description: "Intent original qui a abouti à la demande de confirmation. Cet intent sera utilisé pour continuer son traitement après la confirmation",
            enum: [RecommendationChatBotService.INTENT_NAMES.KNOW_MORE, RecommendationChatBotService.INTENT_NAMES.TAKE_RDV]
          }
        },
        required: ["type", "intent"],
        additionalProperties: false
      },
      description: "confirmation: Confirmation d'un élément mentionné précédemment",
      handle: async (intent, context, userMessage, globalIntentInfos) => {
        // Appeler directement le handler approprié selon l'intent original
        if (intent.confirmationContext?.intent === RecommendationChatBotService.INTENT_NAMES.KNOW_MORE) {
          return await this.getKnowMoreContextInfo(context).handle(intent, context, userMessage, globalIntentInfos);
        } else if (intent.confirmationContext?.intent === RecommendationChatBotService.INTENT_NAMES.TAKE_RDV) {
          return await this.getRdvContextInfo(context).handle(intent, context, userMessage, globalIntentInfos);
        } else {
          console.warn('⚠️ Intent original manquant ou non géré dans confirmationContext');
          return context;
        }
      }
    };
  }

  /**
   * Construit les informations de contexte pour discoverContext (fragment, description, handle)
   */
  protected getDiscoverContextInfo(_context: HowanaContext): { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> } {
    return {
      fragment: {
        type: ["object", "null"],
        description: "Quand l'intent est 'discover', ce contexte contient les chunks pour la découverte de nouveaux horizons",
        properties: {
          chunks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: (() => {
                    const chunkInfo = this.getChunkInfo();
                    const chunkDescriptions = Object.values(chunkInfo)
                      .map(chunk => `- "${chunk.type}": ${chunk.description}`)
                      .join('\n');
                    return `Type du chunk. Valeurs possibles:\n${chunkDescriptions}`;
                  })(),
                  enum: (() => {
                    const chunkInfo = this.getChunkInfo();
                    return Object.values(chunkInfo).map(chunk => chunk.type);
                  })()
                },
                text: {
                  type: "string",
                  description: "Texte du chunk (par exemple: \"Marie Dupont\" pour un nom complet, ou \"Je me sens...\" pour un fragment de situation)"
                }
              },
              required: ["type", "text"],
              additionalProperties: false
            },
            description: "Chunks représentant la situation de l'utilisateur ou les éléments de découverte (par exemple: \"Je me sens...\", \"J'ai besoin...\", \"sphorologie\", \"activité douce\", ...). Chaque chunk doit avoir un type pour indiquer s'il s'agit d'un nom complet ou d'un fragment de situation utilisateur."
          }
        },
        required: ["chunks"],
        additionalProperties: false
      },
      description: "discover: Demande de découverte de nouveaux horizons",
      handle: async (intent, context, _userMessage, _globalIntentInfos) => {
        if (!intent.discoverContext) {
          console.log('⚠️ Aucun discoverContext dans l\'intent');
          return context;
        }
        const { chunks } = intent.discoverContext;
        if (!chunks || chunks.length === 0) {
          console.log('⚠️ Aucun chunks dans discoverContext');
          return context;
        }
        try {
          const chunksTexts = chunks.map(chunk => chunk.text);
          console.log(`🔍 Découverte avec ${chunks.length} chunks`);
          
          // Rechercher à la fois des activités, pratiques et hower angels pour une découverte complète
          const [activitiesResults, practicesResults, howerAngelsResult] = await Promise.all([
            this.supabaseService.searchActivitiesBySituationChunks(chunksTexts),
            this.supabaseService.searchPracticesBySituationChunks(chunksTexts),
            this.supabaseService.searchHowerAngelsByUserSituation(chunksTexts)
          ]);
          
          const activities: ActivityItem[] = activitiesResults.results || [];
          const practices: PracticeItem[] = practicesResults.results || [];
          const howerAngels: HowerAngelItem[] = howerAngelsResult.success && howerAngelsResult.data
            ? howerAngelsResult.data.map(item => ({
                ...item,
                profile: item.profile || '' // Garantir que profile est toujours présent
              }))
            : [];
          
          if (!howerAngelsResult.success) {
            console.error('❌ Erreur lors de la recherche de hower angels:', howerAngelsResult.error);
          }
          
          console.log(`✅ ${activities.length} activités, ${practices.length} pratiques et ${howerAngels.length} hower angels trouvés pour la découverte`);
          
          // Ajouter les résultats dans les métadonnées
          const discoverIntentResults: IntentResults = { activities, practices, howerAngels };
          context.metadata = {
            ...context.metadata,
            ['intentResults']: discoverIntentResults
          };

          // Recalculer globalIntentInfos pour avoir accès aux intentResults
          const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context);
          context.metadata = {
            ...context.metadata,
            ['globalIntentInfos']: globalIntentInfos
          };

          return context;
        } catch (error) {
          console.error('❌ Erreur lors du traitement de l\'intent discover:', error);
          return context;
        }
      }
    };
  }


  /**
   * Schéma de sortie pour le calcul d'intent spécifique aux recommandations
   */
  protected getIntentSchema(context: HowanaContext): ChatBotOutputSchema {
    // Récupérer les IDs disponibles une seule fois
    const { availablePracticeIds, availableActivityIds, availableHowerAngelIds } = this.getAvailableIds(context);

    // Mapper chaque intent à sa fonction de construction d'infos (fragment, description, handle)
    const intentInfoMap: Record<string, (...args: any[]) => { fragment: any; description: string; handle: (intent: RecommendationIntent, context: HowanaContext, userMessage: string, globalIntentInfos: GlobalRecommendationIntentInfos | undefined) => Promise<HowanaContext> }> = {
      [RecommendationChatBotService.INTENT_NAMES.TAKE_RDV]: () => this.getRdvContextInfo(context),
      [RecommendationChatBotService.INTENT_NAMES.SEARCH_HOWER_ANGEL]: () => this.getSearchHowerAngelContextInfo(availablePracticeIds, availableActivityIds, availableHowerAngelIds),
      [RecommendationChatBotService.INTENT_NAMES.SEARCH_ACTIVITIES]: () => this.getSearchActivitiesContextInfo(availablePracticeIds, availableActivityIds, availableHowerAngelIds),
      [RecommendationChatBotService.INTENT_NAMES.SEARCH_PRACTICE]: () => this.getSearchPracticeContextInfo(availablePracticeIds, availableActivityIds, availableHowerAngelIds),
      [RecommendationChatBotService.INTENT_NAMES.SEARCH_OTHER_ADVICE]: () => this.getSearchOtherAdviceContextInfo(availablePracticeIds, availableActivityIds, availableHowerAngelIds),
      [RecommendationChatBotService.INTENT_NAMES.DISCOVER]: () => this.getDiscoverContextInfo(context),
      [RecommendationChatBotService.INTENT_NAMES.KNOW_MORE]: () => this.getKnowMoreContextInfo(context),
      [RecommendationChatBotService.INTENT_NAMES.CONFIRMATION]: () => this.getConfirmationContextInfo(context)
    };

    // Construire tous les infos et récupérer les descriptions
    const rdvResult = intentInfoMap[RecommendationChatBotService.INTENT_NAMES.TAKE_RDV]?.();
    const searchHowerAngelResult = intentInfoMap[RecommendationChatBotService.INTENT_NAMES.SEARCH_HOWER_ANGEL]?.();
    const searchActivitiesResult = intentInfoMap[RecommendationChatBotService.INTENT_NAMES.SEARCH_ACTIVITIES]?.();
    const searchPracticeResult = intentInfoMap[RecommendationChatBotService.INTENT_NAMES.SEARCH_PRACTICE]?.();
    const searchOtherAdviceResult = intentInfoMap[RecommendationChatBotService.INTENT_NAMES.SEARCH_OTHER_ADVICE]?.();
    const discoverResult = intentInfoMap[RecommendationChatBotService.INTENT_NAMES.DISCOVER]?.();
    const knowMoreResult = intentInfoMap[RecommendationChatBotService.INTENT_NAMES.KNOW_MORE]?.();
    const confirmationResult = intentInfoMap[RecommendationChatBotService.INTENT_NAMES.CONFIRMATION]?.();

    // Construire la description de l'enum à partir des descriptions des fragments
    const intentDescriptions = [
      searchHowerAngelResult?.description,
      searchActivitiesResult?.description,
      searchPracticeResult?.description,
      searchOtherAdviceResult?.description,
      rdvResult?.description,
      discoverResult?.description,
      knowMoreResult?.description,
      confirmationResult?.description
    ].filter(Boolean).join('\n- ');

    // Construire une union pour searchContext (peut être soit le fragment complet avec searchType/searchFormat, soit le fragment simplifié pour search_other_advice)
    const searchContextUnion = {
      oneOf: [
        searchHowerAngelResult?.fragment,
        searchActivitiesResult?.fragment,
        searchPracticeResult?.fragment,
        searchOtherAdviceResult?.fragment
      ].filter(Boolean)
    };

    return {
      format: { 
        type: "json_schema",
        name: "RecommendationIntent",
        schema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              description: `Intent principal de l'utilisateur. Valeurs possibles:\n- ${intentDescriptions}`,
              enum: [
                RecommendationChatBotService.INTENT_NAMES.SEARCH_HOWER_ANGEL,
                RecommendationChatBotService.INTENT_NAMES.SEARCH_ACTIVITIES,
                RecommendationChatBotService.INTENT_NAMES.SEARCH_PRACTICE,
                RecommendationChatBotService.INTENT_NAMES.SEARCH_OTHER_ADVICE,
                RecommendationChatBotService.INTENT_NAMES.TAKE_RDV,
                RecommendationChatBotService.INTENT_NAMES.DISCOVER,
                RecommendationChatBotService.INTENT_NAMES.KNOW_MORE,
                RecommendationChatBotService.INTENT_NAMES.CONFIRMATION
              ]
            },
            rdvContext: rdvResult?.fragment,
            searchContext: searchContextUnion,
            knowMoreContext: knowMoreResult?.fragment,
            confirmationContext: confirmationResult?.fragment,
            discoverContext: discoverResult?.fragment
          },
          required: ["intent", "rdvContext", "searchContext", "knowMoreContext", "confirmationContext", "discoverContext"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  /**
   * Calcule le globalIntentInfos à partir de l'intent courant et du contexte
   * @param intent L'intent calculé
   * @param context Le contexte de la conversation
   * @param userMessage Le message de l'utilisateur (optionnel, utilisé par certains services comme BilanChatBotService)
   */
  protected async computeGlobalIntentInfos(intent: any, context: HowanaContext, _userMessage?: string): Promise<GlobalRecommendationIntentInfos> {
    // Récupérer le globalIntentInfos précédent depuis les métadonnées
    const previousGlobalIntentInfos = context.metadata?.['globalIntentInfos'] as GlobalRecommendationIntentInfos | undefined;
    
    // Créer des Maps pour éviter les doublons (clé = userId pour howerAngels, id pour les autres)
    const howerAngelsMap = new Map<string, HowerAngelItem>();
    const activitiesMap = new Map<string, ActivityItem>();
    const practicesMap = new Map<string, PracticeItem>();
    
    // Initialiser les Maps avec les données précédentes
    if (previousGlobalIntentInfos) {
      previousGlobalIntentInfos.howerAngels.forEach(item => {
        howerAngelsMap.set(item.userId, item);
      });
      previousGlobalIntentInfos.activities.forEach(item => {
        activitiesMap.set(item.id, item);
      });
      previousGlobalIntentInfos.practices.forEach(item => {
        practicesMap.set(item.id, item);
      });
    }
    
    // Récupérer les intentResults actuels depuis les métadonnées (si disponibles)
    const intentResults = context.metadata?.['intentResults'] as IntentResults | undefined;
    
    // Mettre à jour les Maps avec les nouveaux résultats si disponibles (évite les doublons)
    if (intentResults) {
      if (intentResults.howerAngels && intentResults.howerAngels.length > 0) {
        intentResults.howerAngels.forEach(item => {
          howerAngelsMap.set(item.userId, item);
        });
      }
      if (intentResults.activities && intentResults.activities.length > 0) {
        intentResults.activities.forEach(item => {
          activitiesMap.set(item.id, item);
        });
      }
      if (intentResults.practices && intentResults.practices.length > 0) {
        intentResults.practices.forEach(item => {
          practicesMap.set(item.id, item);
        });
      }
    }
    
    // Initialiser les listes FAQ
    const faqsMap = new Map<string, FAQItem>();
    if (previousGlobalIntentInfos?.faqs) {
      previousGlobalIntentInfos.faqs.forEach(item => {
        faqsMap.set(item.id, item);
      });
    }
    
    // Déterminer les éléments focused à partir de l'intent courant
    let focusedHowerAngel: HowerAngelItem | null = previousGlobalIntentInfos?.focusedHowerAngel || null;
    let focusedActivity: ActivityItem | null = previousGlobalIntentInfos?.focusedActivity || null;
    let focusedPractice: PracticeItem | null = previousGlobalIntentInfos?.focusedPractice || null;
    let focusedFaqs: FAQItem[] = previousGlobalIntentInfos?.focusedFaqs || [];
    let pendingConfirmations = previousGlobalIntentInfos?.pendingConfirmations || {
      focusedHowerAngel: null,
      focusedActivity: null,
      focusedPractice: null
    };
    let unknownFocused: { type: 'hower_angel' | 'activity' | 'practice' | 'subject'; designation: string } | null = null;
    
    // Fonction helper pour résoudre un élément focused
    const resolveFocusedItem = async (
      type: 'hower_angel' | 'activity' | 'practice' | 'subject',
      identifiant: string | null | undefined,
      designation?: string
    ): Promise<{ item: HowerAngelItem | ActivityItem | PracticeItem | FAQItem[] | null; isUnknown: boolean; present: boolean }> => {
      // Si c'est un sujet, faire une recherche FAQ
      if (type === 'subject') {
        if (!designation) {
          return { item: null, isUnknown: true, present: false };
        }
        try {
          const faqResult = await this.searchFAQ(designation);
          // Si on a des résultats FAQ, les retourner
          if (faqResult && faqResult.faq && faqResult.faq.length > 0) {
            return { item: faqResult.faq as FAQItem[], isUnknown: false, present: true };
          }
        } catch (error) {
          console.error(`❌ Erreur lors de la recherche FAQ pour le sujet:`, error);
        }
        // Pas de résultats FAQ trouvés
        return { item: null, isUnknown: true, present: false };
      }
      
      // Stratégie 1: Si l'identifiant est valide et trouvé dans les Maps
      if (identifiant) {
        if (type === 'hower_angel') {
          // Chercher par userId d'abord, puis par id si pas trouvé
          let item = howerAngelsMap.get(identifiant);
          if (!item) {
            // Si pas trouvé par userId, chercher par id dans les valeurs
            item = Array.from(howerAngelsMap.values()).find(ha => ha.id === identifiant) || undefined;
          }
          if (item) return { item, isUnknown: false, present: true };
        } else if (type === 'activity') {
          const item = activitiesMap.get(identifiant);
          if (item) return { item, isUnknown: false, present: true };
        } else if (type === 'practice') {
          const item = practicesMap.get(identifiant);
          if (item) return { item, isUnknown: false, present: true };
        }
      }
      
      // Stratégie 2: Faire une recherche vectorielle avec le nom
      // (uniquement si une designation est fournie)
      if (designation) {
        try {
          let searchResult: any = null;
          let isPresent = false;
          
          if (type === 'hower_angel') {
            const result = await this.supabaseService.searchHowerAngelsByUserSituation([designation], 1);
            if (result.success && result.data && result.data.length > 0) {
              const found = result.data[0];
              if (found) {
                searchResult = found;
                // Vérifier si le résultat est présent dans le contexte (par userId ou id)
                isPresent = howerAngelsMap.has(found.userId) || Array.from(howerAngelsMap.values()).some(ha => ha.id === found.id);
              }
            }
          } else if (type === 'activity') {
            const result = await this.supabaseService.searchActivitiesBySituationChunks([designation]);
            if (result.results && result.results.length > 0) {
              // Si focusedHowerAngel est présent, filtrer pour ne garder que les activités disponibles dans focusedHowerAngel.activities
              let filteredResults = result.results;
              if (focusedHowerAngel?.activities && focusedHowerAngel.activities.length > 0) {
                const availableActivityIds = focusedHowerAngel.activities.map(a => a.id);
                filteredResults = result.results.filter((activity: any) => 
                  availableActivityIds.includes(activity.id)
                );
              }
              
              if (filteredResults.length > 0) {
                const found = filteredResults[0];
                if (found) {
                  searchResult = found;
                  // Vérifier si le résultat est présent dans le contexte
                  isPresent = activitiesMap.has(found.id);
                }
              }
            }
          } else if (type === 'practice') {
            const result = await this.supabaseService.searchPracticesBySituationChunks([designation]);
            if (result.results && result.results.length > 0) {
              // Si focusedHowerAngel est présent, filtrer pour ne garder que les pratiques disponibles dans focusedHowerAngel.specialties
              let filteredResults = result.results;
              if (focusedHowerAngel?.specialties && focusedHowerAngel.specialties.length > 0) {
                const availableSpecialtyIds = focusedHowerAngel.specialties.map(s => s.id);
                filteredResults = result.results.filter((practice: any) => 
                  availableSpecialtyIds.includes(practice.id)
                );
              }
              
              if (filteredResults.length > 0) {
                const found = filteredResults[0];
                if (found) {
                  searchResult = found;
                  // Vérifier si le résultat est présent dans le contexte
                  isPresent = practicesMap.has(found.id);
                }
              }
            }
          }
          
          if (searchResult) {
            return { item: searchResult, isUnknown: false, present: isPresent };
          }
        } catch (error) {
          console.error(`❌ Erreur lors de la recherche vectorielle pour ${type}:`, error);
        }
      }
      
      // Stratégie 3: Échec - on ne peut pas identifier l'élément
      return { item: null, isUnknown: true, present: false };
    };
    
    // Gérer confirmationContext (pour confirmation) - doit être traité en premier
    if (intent?.intent === RecommendationChatBotService.INTENT_NAMES.CONFIRMATION && intent?.confirmationContext) {
      const confirmationType = intent.confirmationContext.type;
      
      // Transférer l'élément depuis pendingConfirmations vers le focused correspondant
      if (confirmationType === 'hower_angel' && pendingConfirmations.focusedHowerAngel) {
        focusedHowerAngel = pendingConfirmations.focusedHowerAngel;
        // Ajouter à la Map si pas déjà présent
        if (!howerAngelsMap.has(focusedHowerAngel.userId)) {
          howerAngelsMap.set(focusedHowerAngel.userId, focusedHowerAngel);
        }
      } else if (confirmationType === 'activity' && pendingConfirmations.focusedActivity) {
        focusedActivity = pendingConfirmations.focusedActivity;
        // Ajouter à la Map si pas déjà présent
        if (!activitiesMap.has(focusedActivity.id)) {
          activitiesMap.set(focusedActivity.id, focusedActivity);
        }
      } else if (confirmationType === 'practice' && pendingConfirmations.focusedPractice) {
        focusedPractice = pendingConfirmations.focusedPractice;
        // Ajouter à la Map si pas déjà présent
        if (!practicesMap.has(focusedPractice.id)) {
          practicesMap.set(focusedPractice.id, focusedPractice);
        }
      }
      
      // Vider complètement pendingConfirmations après confirmation
      pendingConfirmations = {
        focusedHowerAngel: null,
        focusedActivity: null,
        focusedPractice: null
      };
    } else {
      // Gérer knowMoreContext (pour know_more) ou rdvContext (pour take_rdv)
      let contextType: 'hower_angel' | 'activity' | 'practice' | 'subject' | null = null;
      let contextIdentifiant: string | null | undefined = null;
      let contextDesignation: string | undefined = undefined;
      
      if (intent?.intent === RecommendationChatBotService.INTENT_NAMES.KNOW_MORE && intent?.knowMoreContext) {
        // Pour know_more, utiliser knowMoreContext
        contextType = intent.knowMoreContext.type;
        contextIdentifiant = intent.knowMoreContext.identifiant;
        contextDesignation = intent.knowMoreContext.designation;
      } else if (intent?.intent === RecommendationChatBotService.INTENT_NAMES.TAKE_RDV) {
        // Pour take_rdv, mapper uniquement depuis rdvContext (pas de fallback vers knowMoreContext)
        contextType = intent.rdvContext?.type || null;
        contextIdentifiant = intent.rdvContext?.id || null;
        contextDesignation = intent.rdvContext?.designation || undefined;
      }
      
      if (contextType) {
        let isUnknown = false;
        
        switch (contextType) {
          case 'subject': {
            const { item, isUnknown: itemIsUnknown } = await resolveFocusedItem('subject', null, contextDesignation);
            if (itemIsUnknown) {
              isUnknown = true;
            } else {
              const faqItems = item as FAQItem[];
              if (faqItems && faqItems.length > 0) {
                focusedFaqs = faqItems;
                // Ajouter les FAQ à la Map si pas déjà présentes
                faqItems.forEach(faqItem => {
                  if (!faqsMap.has(faqItem.id)) {
                    faqsMap.set(faqItem.id, faqItem);
                  }
                });
              } else {
                isUnknown = true;
              }
            }
            break;
          }
          
          case 'hower_angel': {
            const { item, isUnknown: itemIsUnknown, present } = await resolveFocusedItem('hower_angel', contextIdentifiant, contextDesignation);
            if (itemIsUnknown) {
              isUnknown = true;
            } else {
              const howerAngelItem = item as HowerAngelItem;
              if (howerAngelItem) {
                // Si l'élément n'était pas présent, le mettre dans pendingConfirmations (peu importe l'intent)
                // On ne valorise pas focused dans ce cas
                if (!present) {
                  pendingConfirmations.focusedHowerAngel = howerAngelItem;
                } else {
                  // Si présent, valoriser focused et ajouter à la Map si nécessaire
                  focusedHowerAngel = howerAngelItem;
                  if (!howerAngelsMap.has(howerAngelItem.userId)) {
                    // Ajouter à la Map si pas déjà présent (indexé par userId)
                    howerAngelsMap.set(howerAngelItem.userId, howerAngelItem);
                  }
                }
              } else {
                isUnknown = true;
              }
            }
            break;
          }
          
          case 'activity':
          case 'practice': {
            // Si il n'y a pas de focusedHowerAngel, gérer la logique des hower angels
            if (!focusedHowerAngel) {
              const howerAngelsArray = Array.from(howerAngelsMap.values());
              
              if (howerAngelsArray.length === 1) {
                // Si il n'y a qu'un seul hower angel, on le met en focused
                focusedHowerAngel = howerAngelsArray[0] || null;
              } else if (howerAngelsArray.length > 1) {
                // Si il y en a plusieurs, on ne cherche pas les practices ni activités
                // On utilise contextDesignation pour rechercher un hower_angel
                if (contextDesignation) {
                  const howerAngelResult = await resolveFocusedItem('hower_angel', null, contextDesignation);
                  
                  if (howerAngelResult.item && !howerAngelResult.isUnknown) {
                    const foundHowerAngel = howerAngelResult.item as HowerAngelItem;
                    
                    // Si on a un match avec un des howerangel qui est déjà présent dans le contextGlobal
                    const matchingHowerAngel = howerAngelsMap.get(foundHowerAngel.userId) || 
                      Array.from(howerAngelsMap.values()).find(ha => ha.id === foundHowerAngel.id);
                    
                    if (matchingHowerAngel) {
                      // On le met dans pendingConfirmation
                      pendingConfirmations.focusedHowerAngel = matchingHowerAngel;
                    } else {
                      // Sinon on prend le 1er disponible parmi les howerAngelsMap (on ne prend jamais le résultat de recherche s'il ne match pas)
                      pendingConfirmations.focusedHowerAngel = howerAngelsArray[0] || null;
                    }
                  } else {
                    // Si la recherche ne trouve rien, on prend le 1er disponible parmi les howerAngelsMap
                    pendingConfirmations.focusedHowerAngel = howerAngelsArray[0] || null;
                  }
                } else {
                  // Si pas de contextDesignation, on prend le 1er disponible parmi les howerAngelsMap
                  pendingConfirmations.focusedHowerAngel = howerAngelsArray[0] || null;
                }
                // Sortir de la fonction sans chercher les activités/pratiques
                break;
              }
            }
            
            // Si on a ajouté dans pendingConfirmation, on ne calcule pas les activity ni practice
            if (pendingConfirmations.focusedHowerAngel) {
              break;
            }
            
            // Si on n'a toujours pas de focusedHowerAngel à ce niveau, on ne cherche pas les activities et practices
            if (!focusedHowerAngel) {
              break;
            }
            
            // D'abord, rechercher par identifiant dans les deux types en parallèle si disponible
            let foundItem: ActivityItem | PracticeItem | null = null;
            let present = false;
            
            if (contextIdentifiant) {
              // Rechercher l'identifiant dans activity ET practice en parallèle
              const [activityResult, practiceResult] = await Promise.all([
                resolveFocusedItem('activity', contextIdentifiant, contextDesignation),
                resolveFocusedItem('practice', contextIdentifiant, contextDesignation)
              ]);
              
              // Privilégier le type correspondant au contextType
              if (contextType === 'activity' && !activityResult.isUnknown && activityResult.item) {
                foundItem = activityResult.item as ActivityItem;
                present = activityResult.present;
              } else if (contextType === 'practice' && !practiceResult.isUnknown && practiceResult.item) {
                foundItem = practiceResult.item as PracticeItem;
                present = practiceResult.present;
              } else if (!activityResult.isUnknown && activityResult.item) {
                // Si le type demandé n'est pas trouvé, utiliser activity si disponible
                foundItem = activityResult.item as ActivityItem;
                present = activityResult.present;
              } else if (!practiceResult.isUnknown && practiceResult.item) {
                // Sinon utiliser practice si disponible
                foundItem = practiceResult.item as PracticeItem;
                present = practiceResult.present;
              }
            }
            
            // Toujours faire une recherche croisée systématique sur les activités ET pratiques si on a une désignation
            if (contextDesignation) {
              // Faire les deux recherches en parallèle
              const [activityResult, practiceResult] = await Promise.all([
                resolveFocusedItem('activity', null, contextDesignation),
                resolveFocusedItem('practice', null, contextDesignation)
              ]);
              
              // Si on n'avait pas trouvé par identifiant, utiliser le résultat de la recherche par désignation selon le contextType
              if (!foundItem) {
                if (contextType === 'activity' && activityResult.item) {
                  foundItem = activityResult.item as ActivityItem;
                  present = activityResult.present;
                } else if (contextType === 'practice' && practiceResult.item) {
                  foundItem = practiceResult.item as PracticeItem;
                  present = practiceResult.present;
                } else if (activityResult.item) {
                  foundItem = activityResult.item as ActivityItem;
                  present = activityResult.present;
                } else if (practiceResult.item) {
                  foundItem = practiceResult.item as PracticeItem;
                  present = practiceResult.present;
                }
              }
              
              // Ajouter les résultats dans pendingConfirmations si trouvés et pas déjà dans les Maps
              if (activityResult.item && !activitiesMap.has((activityResult.item as ActivityItem).id)) {
                pendingConfirmations.focusedActivity = activityResult.item as ActivityItem;
              }
              if (practiceResult.item && !practicesMap.has((practiceResult.item as PracticeItem).id)) {
                pendingConfirmations.focusedPractice = practiceResult.item as PracticeItem;
              }
            }
            
            // Traiter l'élément trouvé selon le type réel de l'item
            if (foundItem) {
              // Vérifier le type réel de l'item plutôt que contextType
              if (foundItem.type === 'activity') {
                const activityItem = foundItem as ActivityItem;
                if (!present) {
                  pendingConfirmations.focusedActivity = activityItem;
                } else {
                  focusedActivity = activityItem;
                  if (!activitiesMap.has(activityItem.id)) {
                    activitiesMap.set(activityItem.id, activityItem);
                  }
                }
              } else if (foundItem.type === 'practice') {
                const practiceItem = foundItem as PracticeItem;
                if (!present) {
                  pendingConfirmations.focusedPractice = practiceItem;
                } else {
                  focusedPractice = practiceItem;
                  if (!practicesMap.has(practiceItem.id)) {
                    practicesMap.set(practiceItem.id, practiceItem);
                  }
                }
              }
            } else {
              isUnknown = true;
            }
            break;
          }
        }
        
        // Valoriser unknownFocused une seule fois en fin de switch si isUnknown est true
        if (isUnknown) {
          unknownFocused = { type: contextType, designation: contextDesignation || '' };
        }
      }
    }
    
    // Reconvertir les Maps en tableaux (au cas où de nouveaux éléments ont été ajoutés)
    const finalHowerAngels = Array.from(howerAngelsMap.values());
    const finalActivities = Array.from(activitiesMap.values());
    const finalPractices = Array.from(practicesMap.values());
    const finalFaqs = Array.from(faqsMap.values());
    
    // Construire et retourner le globalIntentInfos
    return {
      howerAngels: finalHowerAngels,
      activities: finalActivities,
      practices: finalPractices,
      faqs: finalFaqs,
      focusedHowerAngel,
      focusedActivity,
      focusedPractice,
      focusedFaqs,
      pendingConfirmations,
      unknownFocused
    };
  }

  /**
   * Valide une réponse IA générée
   * @param response La réponse IA à valider
   * @param context Le contexte de la conversation
   * @returns Un objet contenant isValid (boolean), reason (string optionnel) et finalObject (T optionnel)
   */
  protected override async validateResponse(
    response: RecommendationMessageResponse, 
    context: HowanaContext
  ): Promise<{
    isValid: boolean;
    reason?: string;
    finalObject?: RecommendationMessageResponse;
  }> {
    // Validation de base : vérifier que la réponse contient le champ response
    if (!response || !response.response) {
      return {
        isValid: false,
        reason: 'La réponse ne contient pas le champ "response" requis'
      };
    }

    // Validation de base : vérifier que la réponse n'est pas vide
    if (typeof response.response !== 'string' || response.response.trim().length === 0) {
      return {
        isValid: false,
        reason: 'La réponse est vide'
      };
    }

    // Vérifier les IDs des quickReplies si présents
    if (response.quickReplies && Array.isArray(response.quickReplies) && response.quickReplies.length > 0) {
      // Regexp pour extraire un UUID valide depuis une chaîne (même avec d'autres caractères)
      // Format UUID: "d1e210f7-3f60-4151-83b5-12ec51e21b67"
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      
      // Récupérer le globalIntentInfos depuis le contexte pour vérifier les IDs
      const globalIntentInfos = context.metadata?.['globalIntentInfos'] as GlobalRecommendationIntentInfos | undefined;
      
      if (!globalIntentInfos) {
        return {
          isValid: false,
          reason: 'Impossible de valider les quickReplies : globalIntentInfos non disponible dans le contexte'
        };
      }

      // Créer des Sets pour vérifier rapidement l'existence des IDs
      // Activities : depuis globalIntentInfos.activities ET depuis howerAngels[].activities
      const activityIds = new Set(globalIntentInfos.activities.map(a => a.id));
      globalIntentInfos.howerAngels.forEach(howerAngel => {
        if (howerAngel.activities) {
          howerAngel.activities.forEach(activity => {
            if (activity.id) {
              activityIds.add(activity.id);
            }
          });
        }
      });

      // Practices : depuis globalIntentInfos.practices ET depuis howerAngels[].specialties
      const practiceIds = new Set(globalIntentInfos.practices.map(p => p.id));
      globalIntentInfos.howerAngels.forEach(howerAngel => {
        if (howerAngel.specialties) {
          howerAngel.specialties.forEach(specialty => {
            if (specialty.id) {
              practiceIds.add(specialty.id);
            }
          });
        }
      });

      const howerAngelUserIds = new Set(globalIntentInfos.howerAngels.map(h => h.userId));

      // Copie de la réponse pour modification si nécessaire
      const correctedResponse: RecommendationMessageResponse = { 
        ...response,
        quickReplies: response.quickReplies.map(qr => ({ ...qr }))
      };
      let hasCorrections = false;

      // Vérifier chaque quickReply
      for (let i = 0; i < response.quickReplies.length; i++) {
        const quickReply = response.quickReplies[i];
        
        if (!quickReply) {
          continue;
        }
        
        const correctedQuickReply = correctedResponse.quickReplies[i];
        if (!correctedQuickReply) {
          continue;
        }
        
        // Vérifier activityId si présent
        if (quickReply.activityId) {
          const originalActivityId = quickReply.activityId;
          const trimmedId = originalActivityId.trim();
          
          // Essayer d'extraire un UUID valide depuis la chaîne
          const uuidMatch = trimmedId.match(uuidRegex);
          if (!uuidMatch) {
            return {
              isValid: false,
              reason: `Impossible d'extraire un activityId valide (format UUID) depuis "${trimmedId}" dans la quickReply ${i + 1}`
            };
          }
          
          const activityId = uuidMatch[0];
          
          // Vérifier l'existence dans le contexte
          if (!activityIds.has(activityId)) {
            return {
              isValid: false,
              reason: `L'activityId "${activityId}" dans la quickReply ${i + 1} n'existe pas dans le contexte`
            };
          }
          
          // Corriger l'ID si nécessaire (utiliser l'UUID extrait)
          if (originalActivityId !== activityId) {
            correctedQuickReply.activityId = activityId;
            hasCorrections = true;
          }
        }

        // Vérifier practiceId si présent
        if (quickReply.practiceId) {
          const originalPracticeId = quickReply.practiceId;
          const trimmedId = originalPracticeId.trim();
          
          // Essayer d'extraire un UUID valide depuis la chaîne
          const uuidMatch = trimmedId.match(uuidRegex);
          if (!uuidMatch) {
            return {
              isValid: false,
              reason: `Impossible d'extraire un practiceId valide (format UUID) depuis "${trimmedId}" dans la quickReply ${i + 1}`
            };
          }
          
          const practiceId = uuidMatch[0];
          
          // Vérifier l'existence dans le contexte
          if (!practiceIds.has(practiceId)) {
            return {
              isValid: false,
              reason: `Le practiceId "${practiceId}" dans la quickReply ${i + 1} n'existe pas dans le contexte`
            };
          }
          
          // Corriger l'ID si nécessaire (utiliser l'UUID extrait)
          if (originalPracticeId !== practiceId) {
            correctedQuickReply.practiceId = practiceId;
            hasCorrections = true;
          }
        }

        // Vérifier les autres types de quickReplies qui pourraient avoir des IDs
        // (par exemple howerAngelId pour les quickReplies de type 'hower_angel_rdv')
        const quickReplyAny = quickReply as any;
        const correctedQuickReplyAny = correctedQuickReply as any;
        if (quickReplyAny.howerAngelId) {
          const originalHowerAngelId = String(quickReplyAny.howerAngelId);
          const trimmedId = originalHowerAngelId.trim();
          
          // Essayer d'extraire un UUID valide depuis la chaîne
          const uuidMatch = trimmedId.match(uuidRegex);
          if (!uuidMatch) {
            return {
              isValid: false,
              reason: `Impossible d'extraire un howerAngelId valide (format UUID) depuis "${trimmedId}" dans la quickReply ${i + 1}`
            };
          }
          
          const howerAngelId = uuidMatch[0];
          
          // Vérifier l'existence dans le contexte
          if (!howerAngelUserIds.has(howerAngelId)) {
            return {
              isValid: false,
              reason: `Le howerAngelId "${howerAngelId}" dans la quickReply ${i + 1} n'existe pas dans le contexte`
            };
          }
          
          // Corriger l'ID si nécessaire (utiliser l'UUID extrait)
          if (originalHowerAngelId !== howerAngelId) {
            correctedQuickReplyAny.howerAngelId = howerAngelId;
            hasCorrections = true;
          }
        }
      }

      // Si des corrections ont été faites, retourner la réponse corrigée
      if (hasCorrections) {
        return {
          isValid: true,
          finalObject: correctedResponse
        };
      }
    }

    // Toutes les validations sont passées
    return {
      isValid: true
    };
  }

  /**
   * Valide une première réponse IA générée pour les recommandations
   * Utilise la même logique que validateResponse
   * @param response La première réponse IA à valider
   * @param context Le contexte de la conversation
   * @returns Un objet contenant isValid (boolean), reason (string optionnel) et finalObject (RecommendationMessageResponse optionnel)
   */
  public override async validateFirstResponse(
    response: RecommendationMessageResponse, 
    context: HowanaContext
  ): Promise<{
    isValid: boolean;
    reason?: string;
    finalObject?: RecommendationMessageResponse;
  }> {
    // Pour la première réponse, on utilise la même validation que validateResponse
    return this.validateResponse(response, context);
  }

}
