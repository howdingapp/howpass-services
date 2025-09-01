import { BaseChatBotService } from './BaseChatBotService';
import { ConversationContext, OpenAIToolsDescription } from '../types/conversation';
import { SupabaseService } from '../services/SupabaseService';
import { QuickReply, TextQuickReply, PracticeQuickReply } from '../types/quick-replies';
import { 
  ChatBotOutputSchema, 
  OpenAIJsonSchema,
  RecommendationMessageResponse,
} from '../types/chatbot-output';

export class RecommendationChatBotService extends BaseChatBotService<RecommendationMessageResponse> {
  
  private analyzeBilanScores(lastBilan: any): {
    availableScores: string[];
    missingScores: string[];
    lowScores: string[];
    priorityAreas: string[];
  } {
    const availableScores: string[] = [];
    const missingScores: string[] = [];
    const lowScores: string[] = [];
    const priorityAreas: string[] = [];

    // Analyser les scores principaux
    const principalScores = [
      { key: 'niveauEnergie', label: 'niveau d\'énergie', score: lastBilan.scores.principaux.niveauEnergie },
      { key: 'qualiteSommeil', label: 'qualité du sommeil', score: lastBilan.scores.principaux.qualiteSommeil },
      { key: 'confortPhysique', label: 'confort physique', score: lastBilan.scores.principaux.confortPhysique },
      { key: 'equilibreEmotionnel', label: 'équilibre émotionnel', score: lastBilan.scores.principaux.equilibreEmotionnel }
    ];

    principalScores.forEach(({ label, score }) => {
      if (score === -1) {
        missingScores.push(label);
      } else {
        availableScores.push(label);
        if (score <= 4) {
          lowScores.push(label);
          priorityAreas.push(label);
        }
      }
    });

    // Analyser les scores secondaires
    const secondaryScores = [
      { key: 'scorePeau', label: 'score peau', score: lastBilan.scores.secondaires.scorePeau },
      { key: 'scoreConcentration', label: 'score concentration', score: lastBilan.scores.secondaires.scoreConcentration },
      { key: 'scoreMemoire', label: 'score mémoire', score: lastBilan.scores.secondaires.scoreMemoire },
      { key: 'scoreCheveux', label: 'score cheveux', score: lastBilan.scores.secondaires.scoreCheveux },
      { key: 'scoreOngles', label: 'score ongles', score: lastBilan.scores.secondaires.scoreOngles },
      { key: 'scoreDigestion', label: 'score digestion', score: lastBilan.scores.secondaires.scoreDigestion }
    ];

    secondaryScores.forEach(({ label, score }) => {
      if (score === -1) {
        missingScores.push(label);
      } else {
        availableScores.push(label);
        if (score <= 4) {
          lowScores.push(label);
          priorityAreas.push(label);
        }
      }
    });

    return {
      availableScores,
      missingScores,
      lowScores,
      priorityAreas
    };
  }

  protected buildSystemPrompt(context: ConversationContext): string {
    let basePrompt = `Tu es Howana, un assistant personnel spécialisé dans le bien-être et les activités de santé. 
    Tu es bienveillant et professionnel.`;

    // Ajouter le contexte du dernier bilan si disponible
    if (context.lastBilan) {
      basePrompt += `\n\nCONTEXTE DU DERNIER BILAN COMPLET:`;
      
      // Fonction helper pour formater les scores
      const formatScore = (score: number, label: string) => {
        if (score === -1) {
          return `- ${label}: Non renseigné`;
        }
        return `- ${label}: ${score}/9`;
      };

      basePrompt += `\n${formatScore(context.lastBilan.scores.principaux.niveauEnergie, 'Niveau d\'énergie')}
      ${formatScore(context.lastBilan.scores.principaux.qualiteSommeil, 'Qualité du sommeil')}
      ${formatScore(context.lastBilan.scores.principaux.confortPhysique, 'Confort physique')}
      ${formatScore(context.lastBilan.scores.principaux.equilibreEmotionnel, 'Équilibre émotionnel')}
      ${formatScore(context.lastBilan.scores.secondaires.scorePeau, 'Score peau')}
      ${formatScore(context.lastBilan.scores.secondaires.scoreConcentration, 'Score concentration')}
      ${formatScore(context.lastBilan.scores.secondaires.scoreMemoire, 'Score mémoire')}
      ${formatScore(context.lastBilan.scores.secondaires.scoreCheveux, 'Score cheveux')}
      ${formatScore(context.lastBilan.scores.secondaires.scoreOngles, 'Score ongles')}
      ${formatScore(context.lastBilan.scores.secondaires.scoreDigestion, 'Score digestion')}`;

      if (context.lastBilan.douleurs) {
        basePrompt += `\n- Douleurs mentionnées: ${context.lastBilan.douleurs}`;
      }

      if (context.lastBilan.notesPersonnelles) {
        basePrompt += `\n- Notes personnelles: ${context.lastBilan.notesPersonnelles}`;
      }

      if (context.lastBilan.howanaSummary && context.lastBilan.howanaSummary.userProfile) {
        const profile = context.lastBilan.howanaSummary.userProfile;
        if (profile.emotionalState) {
          basePrompt += `\n- État émotionnel précédent: ${profile.emotionalState}`;
        }
        if (profile.currentNeeds && profile.currentNeeds.length > 0) {
          basePrompt += `\n- Besoins précédents: ${profile.currentNeeds.join(', ')}`;
        }
        if (profile.preferences && profile.preferences.length > 0) {
          basePrompt += `\n- Préférences précédentes: ${profile.preferences.join(', ')}`;
        }
      }

      // Analyser les scores disponibles et manquants pour guider les recommandations
      const analysis = this.analyzeBilanScores(context.lastBilan);
      
      if (analysis.availableScores.length > 0) {
        basePrompt += `\n\nScores disponibles: ${analysis.availableScores.join(', ')}. Utilise ces informations pour contextualiser tes recommandations.`;
      }
      
      if (analysis.missingScores.length > 0) {
        basePrompt += `\n\nInformations manquantes: ${analysis.missingScores.join(', ')}. Pose des questions pour compléter ces informations et mieux comprendre l'utilisateur.`;
      }

      if (analysis.priorityAreas.length > 0) {
        basePrompt += `\n\nZones prioritaires d'amélioration: ${analysis.priorityAreas.join(', ')}. Concentre-toi sur ces aspects dans tes recommandations.`;
      }

      basePrompt += `\n\nUtilise ces informations pour contextualiser tes recommandations et adapter tes suggestions selon l'historique de l'utilisateur.`;
    }

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

  protected buildFirstUserPrompt(context: ConversationContext): string {
    let prompt = `Salue l'utilisateur et présente-toi en tant qu'assistant Howana spécialisé dans les recommandations personnalisées.
    
    Indique que tu es là pour l'aider à identifier ses besoins et lui recommander des activités et pratiques adaptées.`;

    if (context.lastBilan) {
      const analysis = this.analyzeBilanScores(context.lastBilan);
      
      prompt += `\n\nTu as accès à son dernier bilan complet. Utilise ces informations pour:`;
      
      if (analysis.availableScores.length > 0) {
        prompt += `\n- Faire référence à ses scores disponibles (${analysis.availableScores.join(', ')}) de manière bienveillante`;
        prompt += `\n- Proposer des améliorations ciblées selon ses points faibles`;
        if (analysis.lowScores.length > 0) {
          prompt += `\n- Suggérer des activités qui peuvent aider à améliorer ses scores les plus bas (${analysis.lowScores.join(', ')})`;
        }
      }
      
      if (analysis.missingScores.length > 0) {
        prompt += `\n- Compléter les informations manquantes (${analysis.missingScores.join(', ')}) en posant des questions ciblées`;
        prompt += `\n- Aider l'utilisateur à évaluer ces aspects pour un bilan plus complet`;
      }
      
      prompt += `\n- Adapter tes recommandations selon son profil établi`;
    }

    prompt += `\n\nCommence par un accueil chaleureux et pose une première question engageante pour comprendre ses objectifs et ses besoins actuels.`;

    return prompt;
  }

  protected buildSummarySystemPrompt(context: ConversationContext): string {
    let prompt = `Tu es un assistant spécialisé dans l'analyse de conversations de recommandation. 
    Analyse la conversation et génère un résumé structuré qui permettra de comprendre les besoins de l'utilisateur et les recommandations proposées.`;

    if (context.lastBilan) {
      const analysis = this.analyzeBilanScores(context.lastBilan);
      
      prompt += `\n\nCONTEXTE DU BILAN PRÉCÉDENT:
      Tu as accès au dernier bilan complet de l'utilisateur. Utilise ces informations pour:`;
      
      if (analysis.availableScores.length > 0) {
        prompt += `\n- Comparer l'évolution des besoins et de l'état émotionnel selon les scores disponibles (${analysis.availableScores.join(', ')})`;
        prompt += `\n- Identifier les améliorations ou détériorations`;
        if (analysis.lowScores.length > 0) {
          prompt += `\n- Proposer des activités qui peuvent aider à améliorer ses scores les plus bas (${analysis.lowScores.join(', ')})`;
        }
      }
      
      if (analysis.missingScores.length > 0) {
        prompt += `\n- Noter les informations manquantes (${analysis.missingScores.join(', ')}) qui pourraient être utiles pour des recommandations plus précises`;
        prompt += `\n- Suggérer des questions pour compléter ces informations dans de futures conversations`;
      }
      
      prompt += `\n- Adapter tes recommandations selon l'historique disponible`;
    }

    prompt += `\n\nIMPORTANT: Pour l'état émotionnel et les besoins, analyse-les du point de vue de l'utilisateur en utilisant des formulations comme "Je me sens...", "J'ai besoin de...", "Je ressens...". Cela facilitera le matching sémantique avec les activités et pratiques.
    
    Note: Les suggestions de réponses courtes (quickReplies) sont optionnelles et servent à faciliter l'interaction utilisateur.`;

    return prompt;
  }

  protected getSummaryOutputSchema(_context: ConversationContext): OpenAIJsonSchema {
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
              required: ["emotionalState", "currentNeeds", "preferences", "constraints"],
              additionalProperties: false
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
                required: ["recommandedCategories", "recommandedActivities", "relevanceScore", "reasoning", "benefits"],
                additionalProperties: false
              }
            },
            nextSteps: {
              type: "array",
              items: { type: "string" },
              description: "Prochaines étapes recommandées"
            }
          },
          required: ["userProfile", "recommendations", "nextSteps"],
          additionalProperties: false,
          description: "Résumé structuré des recommandations généré automatiquement"
        },
        strict: true
      }
    };
  }

  protected getStartConversationOutputSchema(_context: ConversationContext): ChatBotOutputSchema {
    // Pas de schéma de sortie spécifique pour startConversation
    // L'IA répond librement selon le prompt
    return null;
  }

  protected override getAddMessageOutputSchema(_context: ConversationContext): ChatBotOutputSchema {
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
                oneOf: [
                  {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["text"],
                        description: "Type de quick reply"
                      },
                      text: {
                        type: "string",
                        description: "Texte de la suggestion (max 5 mots)"
                      }
                    },
                    required: ["type", "text"],
                    additionalProperties: false
                  },
                  {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["practice"],
                        description: "Type de quick reply"
                      },
                      text: {
                        type: "string",
                        description: "Texte de la suggestion (max 5 mots)"
                      },
                      practiceId: {
                        type: "string",
                        description: "Identifiant de la pratique recommandée"
                      }
                    },
                    required: ["type", "text", "practiceId"],
                    additionalProperties: false
                  }
                ]
              },
              description: "1 à 4 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur. Peuvent être de type 'text' simple ou 'practice' avec redirection vers une pratique.",
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

  protected getToolsDescription(_context: ConversationContext): OpenAIToolsDescription | null {
    return {
      tools: [
        {
          type: 'function',
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
          },
          strict: false
        },
        {
          type: 'function',
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
          },
          strict: false
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

  /**
   * Méthode utilitaire pour créer des quick replies typées
   */
  private createQuickReplies(
    textReplies: string[] = [],
    practiceReplies: Array<{ text: string; practiceId: string }> = []
  ): QuickReply[] {
    const quickReplies: QuickReply[] = [];
    
    // Ajouter les quick replies de type texte
    textReplies.forEach(text => {
      if (text.length <= 25) { // Max 5 mots environ
        quickReplies.push({
          type: 'text',
          text: text
        });
      }
    });
    
    // Ajouter les quick replies de type pratique
    practiceReplies.forEach(({ text, practiceId }) => {
      if (text.length <= 25) { // Max 5 mots environ
        quickReplies.push({
          type: 'practice',
          text: text,
          practiceId: practiceId
        });
      }
    });
    
    // Limiter à 4 quick replies maximum
    return quickReplies.slice(0, 4);
  }

  /**
   * Exemple d'utilisation dans le contexte d'une recherche d'activités
   */
  private async generateQuickRepliesFromSearchResults(
    searchResults: any,
    baseTextReplies: string[] = []
  ): Promise<QuickReply[]> {
    const practiceReplies: Array<{ text: string; practiceId: string }> = [];
    
    // Si des pratiques ont été trouvées, créer des quick replies de redirection
    if (searchResults.results && searchResults.results.length > 0) {
      searchResults.results.slice(0, 2).forEach((result: any) => {
        if (result.id && result.title) {
          practiceReplies.push({
            text: `Découvrir ${result.title}`,
            practiceId: result.id
          });
        }
      });
    }
    
    // Ajouter des quick replies de texte par défaut
    const defaultTextReplies = [
      'Plus de détails',
      'Autres suggestions',
      'Retour au menu'
    ];
    
    return this.createQuickReplies(
      [...baseTextReplies, ...defaultTextReplies],
      practiceReplies
    );
  }
}
