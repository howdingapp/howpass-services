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
    
    // Fonction helper pour formater les scores
    const formatScore = (score: number, label: string) => {
      if (score === -1) {
        return `- ${label}: Non renseigné`;
      }
      return `- ${label}: ${score}/9`;
    };

    bilanInfo += `\n${formatScore(context.lastBilan.scores.principaux.niveauEnergie, 'Niveau d\'énergie')}
    ${formatScore(context.lastBilan.scores.principaux.qualiteSommeil, 'Qualité du sommeil')}
    ${formatScore(context.lastBilan.scores.principaux.confortPhysique, 'Confort physique')}
    ${formatScore(context.lastBilan.scores.principaux.equilibreEmotionnel, 'Équilibre émotionnel')}`;

    // Afficher les scores secondaires de manière dynamique
    if (context.lastBilan.scores.secondaires) {
      Object.values(context.lastBilan.scores.secondaires).forEach((scoreData: any) => {
        if (scoreData && typeof scoreData === 'object' && scoreData.label && typeof scoreData.score === 'number') {
          bilanInfo += `\n    ${formatScore(scoreData.score, scoreData.label)}`;
        }
      });
    }

    if (context.lastBilan.douleurs) {
      bilanInfo += `\n- Douleurs mentionnées: ${context.lastBilan.douleurs}`;
    }

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

  /**
   * Génère les contraintes d'IDs pour les activités et pratiques disponibles
   * @param context Le contexte de conversation contenant les métadonnées
   * @returns Un objet contenant les IDs et noms contraints pour les activités et pratiques
   */
  private cleanNameForSchema(name: string): string {
    return name
      .replace(/[^\w\s\-]/g, '') // Supprime tous les caractères spéciaux sauf lettres, chiffres, espaces et tirets
      .replace(/\s+/g, ' ') // Remplace les espaces multiples par un seul espace
      .trim(); // Supprime les espaces en début/fin
  }

  protected getActivitiesAndPracticesConstraints(context: HowanaContext): {
    availableActivityIds: string[];
    availablePracticeIds: string[];
    availableActivityNames: string[];
    availablePracticeNames: string[];
    allAvailableIds: string[];
  } {
    // Récupérer les recommandations des métadonnées pour contraindre les enums
    const recommendations = context.recommendations || { activities: [], practices: [] };
    
    // Extraire les IDs et noms disponibles pour créer les enums
    const availableActivities = recommendations.activities?.map((item: any) => ({
      id: item.id,
      name: this.cleanNameForSchema(item.title || item.name || 'Activité sans nom')
    })) || [];
    const availablePractices = recommendations.practices?.map((item: any) => ({
      id: item.id,
      name: this.cleanNameForSchema(item.title || item.name || 'Pratique sans nom')
    })) || [];
    
    const availableActivityIds = availableActivities.map((item: any) => item.id);
    const availablePracticeIds = availablePractices.map((item: any) => item.id);
    const availableActivityNames = availableActivities.map((item: any) => item.name);
    const availablePracticeNames = availablePractices.map((item: any) => item.name);
    const allAvailableIds = [...availableActivityIds, ...availablePracticeIds];
    
    console.log(`📋 Contraintes générées avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques:`, {
      activities: availableActivities,
      practices: availablePractices
    });

    return {
      availableActivityIds,
      availablePracticeIds,
      availableActivityNames,
      availablePracticeNames,
      allAvailableIds
    };
  }

  protected getSummaryOutputSchema(context: HowanaContext): OpenAIJsonSchema {
    const constraints = this.getActivitiesAndPracticesConstraints(context);
    const { availableActivityIds, availablePracticeIds, availableActivityNames, availablePracticeNames, allAvailableIds } = constraints;

    console.log(`📋 [RECOMMANDATIONS] Contraintes générées avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques:`, {
      availableActivityIds,
      availablePracticeIds,
      availableActivityNames,
      availablePracticeNames,
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
               availableActivityNames,
               availablePracticeIds,
               availablePracticeNames,
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
    if (intent?.intent === 'take_rdv') {
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
                "0 à 3 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur avec URLs de redirection",
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
        const { availableActivityIds, availablePracticeIds, availableActivityNames, availablePracticeNames, allAvailableIds } = constraints;

        console.log(`📋 [OUTIL] Contraintes générées avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques:`, {
          availableActivityIds,
          availablePracticeIds,
          availableActivityNames,
          availablePracticeNames,
          allAvailableIds
        });

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
    availablePracticeNames: string[], 
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
          },
          name: {
            type: "string",
            enum: availablePracticeNames,
            description: "Titre de la pratique de bien-être recommandée"
          }
        },
        required: ["id", "name"],
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
    availableActivityNames: string[], 
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
          },
          name: {
            type: "string",
            enum: availableActivityNames,
            description: "Titre de l'activité de bien-être recommandée"
          }
        },
        required: ["id", "name"],
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
   * Génère le schéma pour les quickReplies de rendez-vous avec URLs de redirection
   */
  protected getRdvQuickRepliesSchema(
    description: string = "Suggestions de réponses courtes pour l'utilisateur avec URLs de redirection",
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
            enum: ["text", "url"],
            description: "Type de quick reply: 'text' pour une réponse simple, 'url' pour une redirection avec URL"
          },
          text: {
            type: "string",
            description: "Texte de la suggestion (max 5 mots)"
          },
          redirectionUrl: {
            type: "string",
            description: "URL de redirection (requis si type='url')"
          }
        },
        required: ["type", "text"],
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
    availableActivityNames: string[],
    availablePracticeIds: string[],
    availablePracticeNames: string[],
    description: string = "Recommandation personnalisée basée sur l'analyse des besoins de l'utilisateur"
  ): any {
    const allAvailableIds = [...availableActivityIds, ...availablePracticeIds];
    const allAvailableNames = [...availableActivityNames, ...availablePracticeNames];
    
    return {
      type: "object",
      properties: {
        recommendedCategories: this.getRecommendedCategoriesSchema(availablePracticeIds, availablePracticeNames),
        recommendedActivities: this.getRecommendedActivitiesSchema(availableActivityIds, availableActivityNames),
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
            name: {
              type: "string",
              enum: allAvailableNames,
              description: "Nom de la recommandation prioritaire"
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
          required: ["id", "name", "type", "reason"],
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
    onIaResponse: (response: any) => Promise<void>
  ): Promise<HowanaContext> {
    // Récupérer intent depuis le contexte
    const currentIntentInfos = context.metadata?.['currentIntentInfos'] as any;
    const intent = currentIntentInfos?.intent as RecommendationIntent | undefined;

    if (!intent) {
      console.warn('⚠️ Aucun intent trouvé dans le contexte, utilisation du comportement par défaut');
      return super.handleIntent(context, userMessage, onIaResponse);
    }

    const typedIntent = intent;
    
    // Toujours calculer globalIntentInfos avant les handlers
    let globalIntentInfos = await this.computeGlobalIntentInfos(intent, context);
    context.metadata = {
      ...context.metadata,
      ['globalIntentInfos']: globalIntentInfos
    };

    // Router vers la fonction appropriée selon le type d'intent
    switch (typedIntent?.intent) {
      case 'know_more':
        context = await this.handleKnowMoreIntent(intent, context, userMessage, globalIntentInfos);
        break;
      
      case 'take_rdv':
        context = await this.handleTakeRdvIntent(intent, context, userMessage, globalIntentInfos);
        break;
      
      case 'search_activities':
      case 'search_hower_angel':
      case 'search_advices':
        if (!typedIntent.searchContext) {
          console.log('⚠️ Aucun searchContext dans l\'intent');
          break;
        }
        const { searchChunks, searchType } = typedIntent.searchContext;
        if (!searchChunks || searchChunks.length === 0) {
          console.log('⚠️ Aucun searchChunks dans l\'intent');
          break;
        }
        try {
          // Pour les recherches, effectuer les recherches d'abord
          switch (searchType) {
            case 'activity':
              context = await this.handleSearchActivityIntent(searchChunks, context, intent);
              break;
            case 'practice':
              context = await this.handleSearchPracticeIntent(searchChunks, context, intent);
              break;
            case 'hower_angel':
              const handled = await this.handleSearchHowerAngelIntent(searchChunks, context, intent);
              if (handled) {
                // Si une erreur s'est produite, le contexte a déjà été mis à jour
                break;
              }
              break;
            default:
              console.warn(`⚠️ searchType non reconnu: ${searchType}`);
          }
        } catch (error) {
          console.error('❌ Erreur lors du traitement de l\'intent:', error);
        }
        break;
      
      default:
        // Pour les autres intents (take_rdv, confirmation, discover, etc.), pas de traitement spécial
        break;
    }

    // Appel unifié à super.handleIntent à la fin
    return super.handleIntent(context, userMessage, onIaResponse);
  }

  /**
   * Gère l'intent "know_more" - valorise intentResults avec les messages contextuels du globalIntentInfos
   */
  private async handleKnowMoreIntent(
    intent: RecommendationIntent,
    context: HowanaContext,
    _userMessage: string,
    globalIntentInfos: GlobalRecommendationIntentInfos | undefined
  ): Promise<HowanaContext> {
    if (!globalIntentInfos) {
      return context;
    }
    console.log('ℹ️ Intent "know_more" détecté - valorisation de intentResults avec les messages contextuels');
    
    if (!intent.knowMoreContext) {
      console.warn('⚠️ knowMoreContext manquant dans l\'intent know_more');
      return context;
    }

    const { type, designation } = intent.knowMoreContext;
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
        intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cet élément n'a pas encore été confirmé. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${fullName}" (ID: ${pendingHowerAngel.userId}) dont il veut en savoir plus.`;
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
        intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cette activité n'a pas encore été confirmée. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${pendingActivity.title}" (ID: ${pendingActivity.id}) dont il veut en savoir plus.`;
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
        intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cette pratique n'a pas encore été confirmée. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${pendingPractice.title}" (ID: ${pendingPractice.id}) dont il veut en savoir plus.`;
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

  /**
   * Gère l'intent "take_rdv" - valorise intentResults avec les informations de rendez-vous et les URLs
   */
  private async handleTakeRdvIntent(
    intent: RecommendationIntent,
    context: HowanaContext,
    _userMessage: string,
    globalIntentInfos: GlobalRecommendationIntentInfos | undefined
  ): Promise<HowanaContext> {
    if (!globalIntentInfos) {
      return context;
    }
    console.log('ℹ️ Intent "take_rdv" détecté - valorisation de intentResults avec les informations de rendez-vous');
    
    if (!intent.rdvContext) {
      console.warn('⚠️ rdvContext manquant dans l\'intent take_rdv');
      return context;
    }

    const { type, designation } = intent.rdvContext;
    let intentResultsText = '';
    let rdvUrl: string | null = null;

    // Construire le message contextuel selon le type
    if (type === 'hower_angel') {
      if (globalIntentInfos.focusedHowerAngel) {
        const howerAngel = globalIntentInfos.focusedHowerAngel;
        
        // Si on n'a pas de focusedActivity, fournir l'objet howerAngel complet
        if (!globalIntentInfos.focusedActivity) {
          intentResultsText = `L'utilisateur souhaite prendre rendez-vous avec le hower angel suivant : ${JSON.stringify(howerAngel, null, 2)}\n\n`;
          intentResultsText += `IMPORTANT: Tu dois choisir les 2 activités les plus pertinentes parmi celles disponibles dans l'objet ci-dessus (en utilisant les URLs /activity/{id}) et mentionner l'option "voir toutes les activités" (URL: /activity/creator/${howerAngel.userId}) comme 3ème choix.`;
        } else {
          // On a une focusedActivity, utiliser son URL
          const activity = globalIntentInfos.focusedActivity;
          rdvUrl = `/activity/${activity.id}?tab=booking`;
          
          intentResultsText = `L'utilisateur souhaite prendre rendez-vous pour l'activité suivante : ${JSON.stringify({
            id: activity.id,
            title: activity.title,
            shortDescription: activity.shortDescription,
            longDescription: activity.longDescription,
          }, null, 2)}\n\n`;
          
          intentResultsText += `URL de rendez-vous: ${rdvUrl}`;
        }
      } else if (globalIntentInfos.pendingConfirmations.focusedHowerAngel) {
        const pendingHowerAngel = globalIntentInfos.pendingConfirmations.focusedHowerAngel;
        const fullName = `${pendingHowerAngel.firstName || ''} ${pendingHowerAngel.lastName || ''}`.trim() || 'ce hower angel';
        intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais ce hower angel n'a pas encore été confirmé. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${fullName}" pour lequel il veut prendre rendez-vous.`;
      } else {
        intentResultsText = `L'utilisateur mentionne "${designation}" mais ce hower angel n'a pas pu être identifié avec certitude. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement (nom complet, spécialité, etc.).`;
      }
    } else if (type === 'activity') {
      if (globalIntentInfos.focusedActivity) {
        const activity = globalIntentInfos.focusedActivity;
        rdvUrl = `/activity/${activity.id}`;
        
        intentResultsText = `L'utilisateur souhaite prendre rendez-vous pour l'activité suivante : ${JSON.stringify({
          id: activity.id,
          title: activity.title,
          shortDescription: activity.shortDescription,
          longDescription: activity.longDescription,
        }, null, 2)}\n\n`;
        
        intentResultsText += `URL de rendez-vous: ${rdvUrl}`;
      } else if (globalIntentInfos.pendingConfirmations.focusedActivity) {
        const pendingActivity = globalIntentInfos.pendingConfirmations.focusedActivity;
        intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cette activité n'a pas encore été confirmée. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${pendingActivity.title}" pour laquelle il veut prendre rendez-vous.`;
      } else {
        intentResultsText = `L'utilisateur mentionne "${designation}" mais cette activité n'a pas pu être identifiée avec certitude. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement (nom complet, type d'activité, etc.).`;
      }
    } else if (type === 'practice') {
      if (globalIntentInfos.focusedPractice) {
        const practice = globalIntentInfos.focusedPractice;
        rdvUrl = `/practitioners?practice=${practice.id}`;
        
        intentResultsText = `L'utilisateur souhaite prendre rendez-vous pour la pratique suivante : ${JSON.stringify({
          id: practice.id,
          title: practice.title,
          shortDescription: practice.shortDescription,
          longDescription: practice.longDescription,
        }, null, 2)}\n\n`;
        
        intentResultsText += `URL de rendez-vous: ${rdvUrl}`;
      } else if (globalIntentInfos.pendingConfirmations.focusedPractice) {
        const pendingPractice = globalIntentInfos.pendingConfirmations.focusedPractice;
        intentResultsText = `IMPORTANT: L'utilisateur mentionne "${designation}" mais cette pratique n'a pas encore été confirmée. Tu dois demander à l'utilisateur de confirmer qu'il s'agit bien de "${pendingPractice.title}" pour laquelle il veut prendre rendez-vous.`;
      } else {
        intentResultsText = `L'utilisateur mentionne "${designation}" mais cette pratique n'a pas pu être identifiée avec certitude. Tu dois demander à l'utilisateur des précisions sur ce qu'il recherche exactement (nom complet, type de pratique, etc.).`;
      }
    }

    // Mettre à jour le contexte avec intentResults (string) et rdv_url si disponible
    const updatedMetadata: any = {
      ...context.metadata,
      ['intentResults']: intentResultsText
    };
    
    context.metadata = updatedMetadata;

    return context;
  }

  /**
   * Gère la recherche d'activités
   */
  private async handleSearchActivityIntent(
    searchChunks: Array<{ type: string; text: string }>,
    context: HowanaContext,
    intent: RecommendationIntent
  ): Promise<HowanaContext> {
    const searchChunksTexts = searchChunks.map(chunk => chunk.text);
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
    const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context);
    context.metadata = {
      ...context.metadata,
      ['globalIntentInfos']: globalIntentInfos
    };

    return context;
  }

  /**
   * Gère la recherche de pratiques
   */
  private async handleSearchPracticeIntent(
    searchChunks: Array<{ type: string; text: string }>,
    context: HowanaContext,
    intent: RecommendationIntent
  ): Promise<HowanaContext> {
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
  }

  /**
   * Gère la recherche de hower angels
   * @returns true si une erreur s'est produite
   */
  private async handleSearchHowerAngelIntent(
    searchChunks: Array<{ type: string; text: string }>,
    context: HowanaContext,
    intent: RecommendationIntent
  ): Promise<boolean> {
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
      return true; // Erreur gérée
    }
    
    const howerAngels: HowerAngelItem[] = howerAngelsResult.data || [];
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
    
    return false; // Pas d'erreur
  }


  /**
   * Schéma de sortie pour le calcul d'intent spécifique aux recommandations
   */
  protected getIntentSchema(_context: HowanaContext): ChatBotOutputSchema {
    return {
      format: { 
        type: "json_schema",
        name: "RecommendationIntent",
        schema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              description: `Intent principal de l'utilisateur. Valeurs possibles:
- "search_hower_angel": Demande explicite d'information sur une personne ou bien sur une catégorie de personne
- "search_activities": Recherche d'une activité particulière ou un type d'activité
- "search_advices": Recherche de conseil explicite sur une problématique
- "take_rdv": Demande explicite de prendre un rendez-vous avec une personne précise ou une activité (déduite du contexte)
- "discover": Demande de découverte de nouveaux horizons
- "know_more": Demande plus d'information par rapport à un précédent résultat de la conversation
- "confirmation": Confirmation d'un élément mentionné précédemment`,
              enum: ["search_hower_angel", "search_activities", "search_advices", "take_rdv", "discover", "know_more", "confirmation"]
            },
            rdvContext: {
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
                  type: "string",
                  description: "Format de recommandation préféré par l'utilisateur : 'remote' (à distance/en ligne), 'inPerson' (en personne/présentiel), ou 'any' (les deux formats acceptés)",
                  enum: ["remote", "inPerson", "any"]
                }
              },
              required: ["type", "id", "format", "designation"],
              additionalProperties: false
            },
            searchContext: {
              type: ["object", "null"],
              description: "Contexte de recherche pour les requêtes sémantiques",
              properties: {
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
                        description: `Type du chunk. Valeurs possibles:
- "hower_angel_name_info": Recherche par nom complet d'un hower angel
- "user_situation_chunk": Fragment de situation utilisateur (de son point de vue, par exemple: "Je me sens...", "J'ai besoin...")
- "i_have_symptome_chunk": Fragment décrivant un symptôme que l'utilisateur a (par exemple: "J'ai des maux de tête", "Je ressens de la fatigue")
- "with_benefit_chunk": Fragment décrivant un bénéfice recherché (par exemple: "pour me détendre", "pour réduire le stress")
- "category_name_info": Nom d'une catégorie d'activité ou de pratique`,
                        enum: ["hower_angel_name_info", "user_situation_chunk", "i_have_symptome_chunk", "with_benefit_chunk", "category_name_info"]
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
                },
              },
              required: ["searchChunks", "searchType", "searchFormat"],
              additionalProperties: false
            },
            knowMoreContext: {
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
            confirmationContext: {
              type: ["object", "null"],
              description: "Quand l'intent est 'confirmation', ce contexte indique quel type d'élément est confirmé",
              properties: {
                type: {
                  type: "string",
                  description: "Type de l'élément confirmé",
                  enum: ["hower_angel", "activity", "practice"]
                }
              },
              required: ["type"],
              additionalProperties: false
            }
          },
          required: ["intent", "rdvContext", "searchContext", "knowMoreContext", "confirmationContext"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  /**
   * Calcule le globalIntentInfos à partir de l'intent courant et du contexte
   */
  protected async computeGlobalIntentInfos(intent: any, context: HowanaContext): Promise<GlobalRecommendationIntentInfos> {
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
              const found = result.results[0];
              if (found) {
                searchResult = found;
                // Vérifier si le résultat est présent dans le contexte
                isPresent = activitiesMap.has(found.id);
              }
            }
          } else if (type === 'practice') {
            const result = await this.supabaseService.searchPracticesBySituationChunks([designation]);
            if (result.results && result.results.length > 0) {
              const found = result.results[0];
              if (found) {
                searchResult = found;
                // Vérifier si le résultat est présent dans le contexte
                isPresent = practicesMap.has(found.id);
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
    if (intent?.intent === 'confirmation' && intent?.confirmationContext) {
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
      
      if (intent?.intent === 'know_more' && intent?.knowMoreContext) {
        // Pour know_more, utiliser knowMoreContext
        contextType = intent.knowMoreContext.type;
        contextIdentifiant = intent.knowMoreContext.identifiant;
        contextDesignation = intent.knowMoreContext.designation;
      } else if (intent?.intent === 'take_rdv') {
        // Pour take_rdv, mapper uniquement depuis rdvContext (pas de fallback vers knowMoreContext)
        contextType = intent.rdvContext?.type || null;
        contextIdentifiant = intent.rdvContext?.id || null;
        contextDesignation = intent.rdvContext?.designation || undefined;
      }
      
      if (contextType) {
        const { item, isUnknown, present } = await resolveFocusedItem(contextType, contextIdentifiant, contextDesignation);
        
        if (isUnknown) {
          unknownFocused = { type: contextType, designation: contextDesignation || '' };
        } else {
          // Si c'est un sujet, stocker les FAQ trouvées
          if (contextType === 'subject') {
            const faqItems = item as FAQItem[];
            if (faqItems && faqItems.length > 0) {
              focusedFaqs = faqItems;
              // Ajouter les FAQ à la Map si pas déjà présentes
              faqItems.forEach(faqItem => {
                if (!faqsMap.has(faqItem.id)) {
                  faqsMap.set(faqItem.id, faqItem);
                }
              });
            }
          } else if (contextType === 'hower_angel') {
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
            }
          } else if (contextType === 'activity') {
            const activityItem = item as ActivityItem;
            if (activityItem) {
              // Si l'élément n'était pas présent, le mettre dans pendingConfirmations (peu importe l'intent)
              // On ne valorise pas focused dans ce cas
              if (!present) {
                pendingConfirmations.focusedActivity = activityItem;
              } else {
                // Si présent, valoriser focused et ajouter à la Map si nécessaire
                focusedActivity = activityItem;
                if (!activitiesMap.has(activityItem.id)) {
                  // Ajouter à la Map si pas déjà présent
                  activitiesMap.set(activityItem.id, activityItem);
                }
              }
            }
          } else if (contextType === 'practice') {
            const practiceItem = item as PracticeItem;
            if (practiceItem) {
              // Si l'élément n'était pas présent, le mettre dans pendingConfirmations (peu importe l'intent)
              // On ne valorise pas focused dans ce cas
              if (!present) {
                pendingConfirmations.focusedPractice = practiceItem;
              } else {
                // Si présent, valoriser focused et ajouter à la Map si nécessaire
                focusedPractice = practiceItem;
                if (!practicesMap.has(practiceItem.id)) {
                  // Ajouter à la Map si pas déjà présent
                  practicesMap.set(practiceItem.id, practiceItem);
                }
              }
            }
          }
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

}
