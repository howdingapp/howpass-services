import { RecommendationChatBotService } from './RecommendationChatBotService';
import { ConversationContext } from '../types/conversation';
import { ChatBotOutputSchema } from '../types';

export class BilanChatBotService extends RecommendationChatBotService {
  
  protected override buildSystemPrompt(context: ConversationContext): string {
    let basePrompt = `Tu es Howana, un assistant personnel et confident spécialisé dans le bien-être et les activités de santé. 
    Tu es bienveillant.  Réponses courtes (maximum 30 mots).`;

    // Règles de comportement et d'information spécifiques à respecter
    basePrompt += `\n\nRègles de comportement et d'information spécifiques à respecter :`;

    if (context.aiRules && Array.isArray(context.aiRules) && context.aiRules.length > 0) {
      // Filtrer seulement les règles actives
      const activeRules = context.aiRules.filter((rule) => rule.isActive);
      
      if (activeRules.length > 0) {
        // Trier les règles par priorité (priorité 1 = plus forte)
        const sortedRules = activeRules.sort((a, b) => a.priority - b.priority);
        
        sortedRules.forEach((rule, index) => {
          basePrompt += `\n${index + 1}. [${rule.type.toUpperCase()}] ${rule.name}: ${rule.description}`;
        });
      }
    } else {
      // COMPORTEMENT PAR DÉFAUT : Howana analyste du bilan et accompagnateur
      basePrompt += `\n1. [BILAN] Analyse du bilan et accompagnement: Tu es spécialisée dans l'analyse des bilans de bien-être 
      et l'accompagnement personnalisé. Ton objectif est d'aider l'utilisateur à comprendre son bilan, 
      à identifier les points d'amélioration et à lui proposer des recommandations adaptées.`;
    }

    // Ajouter le contexte spécifique au bilan
    if (context.aiRules && Array.isArray(context.aiRules) && context.aiRules.length > 0) {
      basePrompt += `\n\nL'utilisateur vient de remplir son bilan de bien-être. Utilise ces informations pour appliquer tes règles personnalisées.`;
    } else {
      basePrompt += `\n\nL'utilisateur vient de remplir son bilan de bien-être. 
      Aide-le à comprendre ses résultats, identifie les points d'amélioration et propose des recommandations personnalisées.`;
    }

    // Règles générales (toujours présentes)
    basePrompt += `\n\nRègles importantes:
    - Réponds toujours en français
    - Sois concis mais utile
    - Reste professionnel et bienveillant
    - Si tu ne sais pas quelque chose, dis-le honnêtement`;

    // Ajouter le contexte de la dernière recommandation Howana si disponible
    if (context.lastHowanaRecommandation) {
      basePrompt += `\n\nCONTEXTE DES DERNIERS ECHANGES:`;
      
      if (context.lastHowanaRecommandation.userProfile) {
        const profile = context.lastHowanaRecommandation.userProfile;
        if (profile.supposedEmotionalState) {
          basePrompt += `\n- État émotionnel précédent: ${profile.supposedEmotionalState}`;
        }
        if (profile.supposedCurrentNeeds && profile.supposedCurrentNeeds.length > 0) {
          basePrompt += `\n- Besoins précédents: ${profile.supposedCurrentNeeds.join(', ')}`;
        }
        if (profile.supposedPreferences && profile.supposedPreferences.length > 0) {
          basePrompt += `\n- Préférences précédentes: ${profile.supposedPreferences.join(', ')}`;
        }
        if (profile.supposedConstraints && profile.supposedConstraints.length > 0) {
          basePrompt += `\n- Contraintes précédentes: ${profile.supposedConstraints.join(', ')}`;
        }
      }

      if (context.lastHowanaRecommandation.recommendedCategories && context.lastHowanaRecommandation.recommendedCategories.length > 0) {
        const categories = context.lastHowanaRecommandation.recommendedCategories.map(cat => cat.name).join(', ');
        basePrompt += `\n- Pratiques recommandées précédemment: ${categories}`;
      }

      if (context.lastHowanaRecommandation.recommendedActivities && context.lastHowanaRecommandation.recommendedActivities.length > 0) {
        const activities = context.lastHowanaRecommandation.recommendedActivities.map(act => act.name).join(', ');
        basePrompt += `\n- Activités recommandées précédemment: ${activities}`;
      }

      if (context.lastHowanaRecommandation.activitiesReasons) {
        basePrompt += `\n- Raisons des activités précédentes: ${context.lastHowanaRecommandation.activitiesReasons}`;
      }

      if (context.lastHowanaRecommandation.practicesReasons) {
        basePrompt += `\n- Raisons des pratiques précédentes: ${context.lastHowanaRecommandation.practicesReasons}`;
      }

      if (context.lastHowanaRecommandation.importanteKnowledge && context.lastHowanaRecommandation.importanteKnowledge.length > 0) {
        basePrompt += `\n- Connaissances importantes précédentes: ${context.lastHowanaRecommandation.importanteKnowledge.join(', ')}`;
      }

      basePrompt += `\n\nUtilise ces informations pour comprendre l'évolution de l'utilisateur et adapter tes questions. Évite de répéter exactement les mêmes suggestions.`;
    }
    
    // Règles contextuelles spécifiques (uniquement si pas d'aiRules)
    if (!context.aiRules || !Array.isArray(context.aiRules) || context.aiRules.length === 0) {
      basePrompt += `
    - Analyse les données du bilan pour comprendre l'état actuel de l'utilisateur
    - Identifie les points d'amélioration et les forces
    - Propose des activités et pratiques adaptées aux scores du bilan
    - Accompagne l'utilisateur dans la compréhension de ses résultats
    - DÉCOUVRE DES SCORES PERSONNALISÉS: Pose des questions pour identifier d'autres aspects du bien-être non couverts par le bilan standard
    - Demande des scores de 1 à 9 pour ces nouvelles catégories (1 = très déséquilibré, 9 = très équilibré)
    - IMPORTANT: L'échange doit se limiter à environ 10 questions maximum
    - Chaque réponse doit impérativement contenir une question pour maintenir l'engagement`;
    }

    // Ajouter les informations du bilan si disponibles
    if (context.bilanData) {
      basePrompt += `\n\nINFORMATIONS DU PRE-BILAN DISPONIBLES:
      - Confort physique: ${context.bilanData.scores.principaux.confortPhysique}/9
      - Équilibre émotionnel: ${context.bilanData.scores.principaux.equilibreEmotionnel}/9
      - Qualité du sommeil: ${context.bilanData.scores.principaux.qualiteSommeil}/9
      - Niveau d'énergie: ${context.bilanData.scores.principaux.niveauEnergie}/9
      ${context.bilanData.douleurs ? `- Douleurs: ${context.bilanData.douleurs}` : ''}
      ${context.bilanData.notesPersonnelles ? `- Notes personnelles: ${context.bilanData.notesPersonnelles}` : ''}
      
      Note: Les scores vont de 1 (très déséquilibré) à 9 (très équilibré). Utilise ces informations pour adapter tes recommandations.
      
      DÉCOUVERTE DE CATÉGORIES PERSONNALISÉES:
      - Pose des questions pour identifier d'autres aspects du bien-être importants pour l'utilisateur
      - Demande des scores de 1 à 9 pour ces nouvelles catégories
      - Exemples: relations sociales, créativité, spiritualité, équilibre travail-vie, etc.
      - Ces informations enrichiront le bilan et permettront des recommandations plus personnalisées.`;
    }

    return basePrompt;
  }

  protected override getAddMessageOutputSchema(_context: ConversationContext): ChatBotOutputSchema {

    return {
      format: { 
        type: "json_schema",
        name: "ConversationResponse",
        schema: {
          type: "object",
          properties: {
            response: {
              type: "string",
              description: "Réponse principale de l'assistant Howana, maximum 25 mots."
            },
            quickReplies: {
              type: "array",
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
                  },
                },
                required: ["type", "text"],
                additionalProperties: false
              },
              description: "1 à 3 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur. Peuvent être de type 'text' simple.",
              maxItems: 3,
              minItems: 0
            }
          },
          required: ["response", "quickReplies"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  protected override getSummaryOutputSchema(context: ConversationContext): any {
    const constraints = this.getActivitiesAndPracticesConstraints(context);
    const { availableActivityIds, availablePracticeIds, availableActivityNames, availablePracticeNames, allAvailableIds } = constraints;

    console.log(`📋 [BILANS] Contraintes générées avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques:`, {
      availableActivityIds,
      availablePracticeIds,
      availableActivityNames,
      availablePracticeNames,
      allAvailableIds
    });

    return {
      format: { 
        type: "json_schema",
        name: "BilanSummary",
        schema: {
          type: "object",
          properties: {
            userProfile: {
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
                supposedPotentialChallenges: {
                  type: "array",
                  items: { type: "string" },
                  description: "Défis potentiels identifiés, formulés du point de vue de l'utilisateur (ex: 'En ce moment, je lutte avec le stress', 'Je me sens dépassé par mes responsabilités')"
                }
              },
              required: ["supposedEmotionalState", "supposedCurrentNeeds", "supposedPotentialChallenges"]
            },
            bilanAnalysis: {
              type: "object",
              properties: {
                scoresAnalysis: {
                  type: "string",
                  description: "Message destiné à l'utilisateur analysant vos scores de bilan et identifiant vos points d'amélioration (formulé en vous parlant directement l'un a l'autre)"
                },
                customCategories: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      categoryName: {
                        type: "string",
                        description: "Nom de la catégorie personnalisée identifiée"
                      },
                      score: {
                        type: "number",
                        description: "Score de 1 à 9 pour cette catégorie"
                      },
                      description: {
                        type: "string",
                        description: "Message destiné à l'utilisateur décrivant cette catégorie et pourquoi elle est importante pour vous (formulé en vous parlant directement l'un a l'autre)"
                      }
                    },
                    required: ["categoryName", "score", "description"]
                  },
                  description: "Catégories personnalisées identifiées lors de votre conversation avec leurs scores"
                }
              },
              required: ["scoresAnalysis", "customCategories"]
            },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    description: "Catégorie d'amélioration (physique, émotionnel, sommeil, énergie, ou personnalisée)"
                  },
                  priority: {
                    type: "string",
                    description: "Priorité de l'amélioration (haute, moyenne, basse)"
                  },
                  reasoning: {
                    type: "string",
                    description: "Message destiné à l'utilisateur expliquant pourquoi cette recommandation vous correspond (formulé en vous parlant directement l'un a l'autre)"
                  },
                  // Champs hérités de RecommendationChatBotService
                  recommendedCategories: {
                    type: "array",
                    minItems: availablePracticeIds.length > 0 ? 1 : 0,
                    maxItems: availablePracticeIds.length > 0 ? Math.max(2, availablePracticeIds.length) : 0,
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
                    description: "Pratiques de bien-être recommandées basées sur l'analyse de votre bilan"
                  },
                  recommendedActivities: {
                    type: "array",
                    minItems: availableActivityIds.length > 0 ? 1 : 0,
                    maxItems: availableActivityIds.length > 0 ? Math.max(2, availableActivityIds.length) : 0,
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
                    description: "Activités de bien-être recommandées basées sur l'analyse de votre bilan"
                  },
                  activitiesReasons: {
                    type: "string",
                    description: "Message destiné à l'utilisateur expliquant pourquoi ces activités vous correspondent (formulé en vous parlant directement l'un a l'autre)"
                  },
                  practicesReasons: {
                    type: "string",
                    description: "Message destiné à l'utilisateur expliquant pourquoi ces pratiques vous correspondent (formulé en vous parlant directement l'un a l'autre)"
                  },
                  relevanceScore: {
                    type: "number",
                    description: "Score de pertinence de la recommandation (0 = non pertinent, 1 = très pertinent)"
                  },
                  benefits: {
                    type: "array",
                    items: { type: "string" },
                    description: "Messages destinés à l'utilisateur listant les bénéfices concrets que vous pourrez retirer (formulés en vous parlant directement)"
                  }
                },
                required: ["category", "priority", "reasoning", "recommendedCategories", "recommendedActivities", "activitiesReasons", "practicesReasons", "relevanceScore", "benefits"]
              }
            },
            importanteKnowledge: {
              type: "array",
              items: { type: "string" },
              description: "Messages destinés à l'utilisateur contenant les points clés à retenir pour optimiser votre parcours de bien-être (formulés en vous parlant directement)"
            }
          },
          required: ["userProfile", "bilanAnalysis", "recommendations", "importanteKnowledge"],
          description: `Résumé personnalisé de votre bilan de bien-être avec recommandations adaptées. Les recommandations sont contraintes aux ${allAvailableIds.length} éléments disponibles dans le contexte.`
        },
        strict: true
      }
    };
  }


  
  protected override buildFirstUserPrompt(_context: ConversationContext): string {
    return `Salue l'utilisateur et présente-toi en tant qu'assistant Howana spécialisé dans l'analyse des bilans de bien-être.
    
    Indique que tu es là pour l'aider à comprendre son bilan, identifier les points d'amélioration et lui proposer des recommandations personnalisées.
    
    Commence par un accueil chaleureux et pose une première question engageante pour l'accompagner dans l'analyse de son bilan.`;
  }

  protected override buildSummarySystemPrompt(_context: ConversationContext): string {
    return `Tu es un assistant spécialisé dans l'analyse de conversations de bilan de bien-être. 
    Analyse la conversation et génère un résumé structuré qui permettra de comprendre l'état de l'utilisateur, 
    l'analyse de son bilan et les recommandations proposées.
    
    IMPORTANT: Pour l'état émotionnel et les besoins, analyse-les du point de vue de l'utilisateur en utilisant des formulations comme "Je me sens...", "J'ai besoin de...", "Je ressens...". Cela facilitera le matching sémantique avec les activités et pratiques.
    
    Note: Les suggestions de réponses courtes (quickReplies) sont optionnelles et servent à faciliter l'interaction utilisateur.`;
  }
}
