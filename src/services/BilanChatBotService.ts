import { RecommendationChatBotService } from './RecommendationChatBotService';
import { ConversationContext } from '../types/conversation';

export class BilanChatBotService extends RecommendationChatBotService {
  
  protected override buildSystemPrompt(context: ConversationContext): string {
    let basePrompt = `Tu es Howana, un assistant personnel spécialisé dans le bien-être et les activités de santé. 
    Tu es bienveillant et professionnel.`;

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
    - Si tu ne sais pas quelque chose, dis-le honnêtement
    - L'échange doit contenir environ 10 questions maximum
    - Chaque réponse doit TOUJOURS contenir une question pertinente
    - Fournis 1 à 4 suggestions de réponses courtes (maximum 5 mots chacune) pour faciliter l'interaction`;
    
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
      basePrompt += `\n\nINFORMATIONS DU BILAN DISPONIBLES:
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

  protected override getSummaryOutputSchema(_context: ConversationContext): any {
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
                  description: "Analyse des scores du bilan et identification des points d'amélioration"
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
                        description: "Description de cette catégorie et pourquoi elle est importante"
                      }
                    },
                    required: ["categoryName", "score", "description"]
                  },
                  description: "Catégories personnalisées identifiées lors de la conversation avec leurs scores"
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
                    description: "Raisonnement derrière cette recommandation"
                  },
                  // Champs hérités de RecommendationChatBotService
                  recommandedCategories: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: {
                          type: "string",
                          description: "Identifiant de la pratique recommandée"
                        },
                        name: {
                          type: "string",
                          description: "Nom de la pratique recommandée"
                        }
                      },
                      required: ["id", "name"],
                      additionalProperties: false
                    },
                    description: "Pratiques recommandées avec identifiant et nom"
                  },
                  recommandedActivities: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: {
                          type: "string",
                          description: "Identifiant de l'activité recommandée"
                        },
                        name: {
                          type: "string",
                          description: "Nom de l'activité recommandée"
                        }
                      },
                      required: ["id", "name"],
                      additionalProperties: false
                    },
                    description: "Activités recommandées avec identifiant et nom"
                  },
                  activitiesReason: {
                    type: "string",
                    description: "Raisonnement derrière les activités recommandées"
                  },
                  practicesReasons: {
                    type: "string",
                    description: "Raisonnement derrière les pratiques recommandées"
                  },
                  relevanceScore: {
                    type: "number",
                    description: "Score de pertinence (0-1)"
                  },
                  benefits: {
                    type: "array",
                    items: { type: "string" },
                    description: "Bénéfices attendus"
                  }
                },
                required: ["category", "priority", "reasoning", "recommandedCategories", "recommandedActivities", "activitiesReason", "practicesReasons", "relevanceScore", "benefits"]
              }
            },
            importanteKnowledge: {
              type: "array",
              items: { type: "string" },
              description: "Connaissances importantes à retenir"
            }
          },
          required: ["userProfile", "bilanAnalysis", "recommendations", "importanteKnowledge"],
          description: "Résumé structuré du bilan et des recommandations généré automatiquement"
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
