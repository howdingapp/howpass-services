import { BaseChatBotService } from './BaseChatBotService';
import { ConversationContext, OpenAIToolsDescription } from '../types/conversation';

export class RecommendationChatBotService extends BaseChatBotService {
  
  protected buildSystemPrompt(context: ConversationContext): string {
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
      // COMPORTEMENT PAR DÉFAUT : Howana expert en recommandations personnalisées
      basePrompt += `\n1. [RECOMMANDATION] Expert en recommandations personnalisées: Tu es spécialisée dans l'analyse des besoins 
      et la recommandation d'activités et de pratiques adaptées au profil de l'utilisateur.
      
      OBJECTIFS SPÉCIFIQUES:
      - Analyser l'état émotionnel et les besoins de l'utilisateur
      - Recommander les activités et pratiques les plus pertinentes
      - Fournir une analyse détaillée de l'état de l'utilisateur
      - Donner des suggestions personnalisées et adaptées
      
      STRATÉGIE DE RECOMMANDATION:
      - Pose des questions ciblées pour comprendre les besoins
      - Analyse les préférences et contraintes de l'utilisateur
      - Propose des activités avec un score de pertinence
      - Explique le raisonnement derrière chaque recommandation
      - Adapte tes suggestions selon le profil et l'expérience`;
    }

    // Ajouter le contexte spécifique aux recommandations
    if (context.aiRules && Array.isArray(context.aiRules) && context.aiRules.length > 0) {
      basePrompt += `\n\nL'utilisateur cherche des recommandations personnalisées. Utilise ces informations pour appliquer tes règles personnalisées.`;
    } else {
      basePrompt += `\n\nL'utilisateur cherche des recommandations personnalisées d'activités et de pratiques. 
      Aide-le à identifier ses besoins et propose des solutions adaptées.`;
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
    - Aide l'utilisateur à identifier ses besoins et ses objectifs
    - Analyse son état émotionnel et ses préférences
    - Propose des activités et pratiques avec un score de pertinence
    - Explique le raisonnement derrière chaque recommandation
    - Adapte tes suggestions selon son profil et son expérience
    - IMPORTANT: L'échange doit se limiter à environ 10 questions maximum
    - Chaque réponse doit impérativement contenir une question pour maintenir l'engagement`;
    }

    return basePrompt;
  }

  protected buildFirstUserPrompt(_context: ConversationContext): string {
    return `Salue l'utilisateur et présente-toi en tant qu'assistant Howana spécialisé dans les recommandations personnalisées.
    
    Indique que tu es là pour l'aider à identifier ses besoins et lui recommander des activités et pratiques adaptées.
    
    Commence par un accueil chaleureux et pose une première question engageante pour comprendre ses objectifs et ses besoins.`;
  }

  protected buildSummarySystemPrompt(_context: ConversationContext): string {
    return `Tu es un assistant spécialisé dans l'analyse de conversations de recommandation. 
    Analyse la conversation et génère un résumé structuré qui permettra de comprendre les besoins de l'utilisateur et les recommandations proposées.
    
    IMPORTANT: Pour l'état émotionnel et les besoins, analyse-les du point de vue de l'utilisateur en utilisant des formulations comme "Je me sens...", "J'ai besoin de...", "Je ressens...". Cela facilitera le matching sémantique avec les activités et pratiques.
    
    Note: Les suggestions de réponses courtes (quickReplies) sont optionnelles et servent à faciliter l'interaction utilisateur.`;
  }

  protected getSummaryOutputSchema(_context: ConversationContext): any {
    return {
      format: { 
        type: "json_schema",
        name: "RecommendationSummary",
        schema: {
          type: "object",
          properties: {
            userProfile: {
              type: "object",
              properties: {
                emotionalState: {
                  type: "string",
                  description: "État émotionnel actuel de l'utilisateur, formulé de son point de vue (ex: 'Je me sens stressé', 'Je ressens de la fatigue')"
                },
                currentNeeds: {
                  type: "array",
                  items: { type: "string" },
                  description: "Besoins actuels identifiés, formulés du point de vue de l'utilisateur (ex: 'J'ai besoin de me détendre', 'Je veux retrouver de l'énergie')"
                },
                preferences: {
                  type: "array",
                  items: { type: "string" },
                  description: "Préférences de l'utilisateur, formulées de son point de vue (ex: 'J'aime les activités en groupe', 'Je préfère le matin')"
                },
                constraints: {
                  type: "array",
                  items: { type: "string" },
                  description: "Contraintes identifiées, formulées du point de vue de l'utilisateur (ex: 'Je n'ai que 30 minutes', 'Je ne peux pas sortir')"
                }
              },
              required: ["emotionalState", "currentNeeds", "preferences", "constraints"]
            },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  recommandedCategories: {
                    type: "string",
                    description: "identifiant des pratiques recommandées"
                  },
                  recommandedActivities: {
                    type: "string",
                    description: "identifiant des activités recommandées"
                  },
                  relevanceScore: {
                    type: "number",
                    description: "Score de pertinence (0-1)"
                  },
                  reasoning: {
                    type: "string",
                    description: "Raisonnement derrière la recommandation"
                  },
                  benefits: {
                    type: "array",
                    items: { type: "string" },
                    description: "Bénéfices attendus"
                  }
                },
                required: ["recommandedCategories", "recommandedActivities", "relevanceScore", "reasoning", "benefits"]
              }
            },
            nextSteps: {
              type: "array",
              items: { type: "string" },
              description: "Prochaines étapes recommandées"
            }
          },
          required: ["userProfile", "recommendations", "nextSteps"],
          description: "Résumé structuré des recommandations généré automatiquement"
        },
        strict: true
      }
    };
  }

  protected getStartConversationOutputSchema(_context: ConversationContext): any | null {
    // Pas de schéma de sortie spécifique pour startConversation
    // L'IA répond librement selon le prompt
    return null;
  }

  protected getAddMessageOutputSchema(_context: ConversationContext): any | null {
    return {
      format: { 
        type: "json_schema",
        name: "RecommendationResponse",
        schema: {
          type: "object",
          properties: {
            response: {
              type: "string",
              description: "Réponse principale de l'assistant Howana"
            },
            quickReplies: {
              type: "array",
              items: {
                type: "string"
              },
              description: "1 à 4 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur",
              maxItems: 4,
              minItems: 1
            }
          },
          required: ["response", "quickReplies"]
        },
        strict: true
      }
    };
  }

  protected getToolsDescription(_context: ConversationContext): OpenAIToolsDescription | null {
    return {
      tools: [
        {
          type: 'function',
          function: {
            name: 'faq',
            description: 'Rechercher des informations dans la FAQ pour répondre aux questions de l\'utilisateur',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'La question ou le sujet à rechercher dans la FAQ'
                }
              },
              required: ['query']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'activities_and_practices',
            description: 'Rechercher des activités et pratiques pertinentes pour l\'utilisateur',
            parameters: {
              type: 'object',
              properties: {
                searchTerm: {
                  type: 'string',
                  description: 'Description de l\'état émotionnel et des besoins de l\'utilisateur, formulée de son point de vue avec des expressions comme "Je me sens...", "J\'ai besoin de...", "Je voudrais...". Ce format facilite la recherche vectorielle en alignant la formulation des besoins avec celle des descriptions d\'activités.'
                },
              },
              required: ['searchTerm']
            }
          }
        }
      ]
    };
  }

  protected async callTool(toolName: string, toolArgs: any, _context: ConversationContext): Promise<any> {
    switch (toolName) {
      case 'faq':
        return await this.searchFAQ(toolArgs.query);
      
      case 'activities_and_practices':
        return await this.searchActivitiesAndPractices(
          toolArgs.searchTerm, 
        );
      
      default:
        throw new Error(`Outil non supporté: ${toolName}`);
    }
  }

  private async searchFAQ(query: string): Promise<any> {
    try {
      console.log(`🔍 Recherche FAQ pour: ${query}`);
      
      // Utiliser SupabaseService pour la recherche vectorielle sur la table faq
      const faqResults = await this.supabaseService.searchVectorSimilarity(
        'faq',
        'vector_summary',
        query,
        4
      );
      
      return {
        results: faqResults,
        query: query,
        total: faqResults.length
      };
    } catch (error) {
      console.error('❌ Erreur lors de la recherche FAQ:', error);
      return {
        results: [],
        query: query,
        error: 'Erreur lors de la recherche FAQ'
      };
    }
  }

  private async searchActivitiesAndPractices(
    searchTerm: string, 
  ): Promise<any> {
    try {
      console.log(`🔍 Recherche d'activités et pratiques pour: ${searchTerm}`);
      
      // Utiliser SupabaseService pour la recherche vectorielle
      const searchResults = await this.supabaseService.searchActivitiesAndPractices(
        searchTerm,
      );
      
      return searchResults;
    } catch (error) {
      console.error('❌ Erreur lors de la recherche d\'activités et pratiques:', error);
      return {
        results: [],
        searchTerm: searchTerm,
        error: 'Erreur lors de la recherche'
      };
    }
  }
}
