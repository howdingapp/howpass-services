import { BaseChatBotService } from './BaseChatBotService';
import { OpenAITool, OpenAIToolsDescription } from '../types/conversation';
import { HowanaContext, HowanaRecommandationContext } from '../types/repositories';
import { 
  ChatBotOutputSchema, 
  OpenAIJsonSchema,
  RecommendationMessageResponse,
  ExtractedRecommandations,
} from '../types/chatbot-output';

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
      - Si la question concerne des recommandations personnalisées d'activités/pratiques, utilise 'activities_and_practices'`
    ];
  }


  /**
   * Fonction centralisée pour toutes les informations de contexte système
   */
  protected getSystemContext(context: HowanaRecommandationContext & HowanaContext): string {
    let contextInfo = '';

    // Contexte du dernier bilan
    contextInfo += this.getBilanContextInfo(context);
    contextInfo += this.getBilanAnalysis(context);

    // Contexte de la dernière recommandation Howana
    contextInfo += this.getPreviousConversationContext(context);

    return contextInfo;
  }

  /**
   * Informations contextuelles du bilan
   */
  protected getBilanContextInfo(context: HowanaRecommandationContext & HowanaContext): string {
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
    ${formatScore(context.lastBilan.scores.principaux.equilibreEmotionnel, 'Équilibre émotionnel')}
    ${formatScore(context.lastBilan.scores.secondaires.scorePeau, 'Score peau')}
    ${formatScore(context.lastBilan.scores.secondaires.scoreConcentration, 'Score concentration')}
    ${formatScore(context.lastBilan.scores.secondaires.scoreMemoire, 'Score mémoire')}
    ${formatScore(context.lastBilan.scores.secondaires.scoreCheveux, 'Score cheveux')}
    ${formatScore(context.lastBilan.scores.secondaires.scoreOngles, 'Score ongles')}
    ${formatScore(context.lastBilan.scores.secondaires.scoreDigestion, 'Score digestion')}`;

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
   * Analyse des scores du bilan
   */
  protected getBilanAnalysis(context: HowanaRecommandationContext & HowanaContext): string {
    if (!context.lastBilan) return '';

    const analysis = this.analyzeBilanScores(context.lastBilan);
    let analysisInfo = '';

    if (analysis.availableScores.length > 0) {
      analysisInfo += `\n\nScores disponibles: ${analysis.availableScores.join(', ')}. Utilise ces informations pour contextualiser tes recommandations.`;
    }
    
    if (analysis.missingScores.length > 0) {
      analysisInfo += `\n\nInformations manquantes: ${analysis.missingScores.join(', ')}. Pose des questions pour compléter ces informations et mieux comprendre l'utilisateur.`;
    }

    if (analysis.priorityAreas.length > 0) {
      analysisInfo += `\n\nZones prioritaires d'amélioration: ${analysis.priorityAreas.join(', ')}. Concentre-toi sur ces aspects dans tes recommandations.`;
    }

    analysisInfo += `\n\nUtilise ces informations pour contextualiser tes recommandations et adapter tes suggestions selon l'historique de l'utilisateur.`;

    return analysisInfo;
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

    return {
      availableScores,
      missingScores,
      lowScores,
      priorityAreas
    };
  }


  protected buildFirstUserPrompt(_context: HowanaContext): string {

    const context:HowanaRecommandationContext & HowanaContext = _context as HowanaRecommandationContext & HowanaContext;
    let prompt = `Salue l'utilisateur et présente-toi en tant qu'assistant Howana spécialisé dans les recommandations personnalisées.
    
    Indique que tu es là pour l'aider à identifier ses besoins et lui recommander des activités et pratiques adaptées.`;

    // Vérifier s'il y a des informations de conversations précédentes
    const hasPreviousContext = context.lastHowanaRecommandation || context.lastBilan;
    
    if (hasPreviousContext) {
      prompt += `\n\nIMPORTANT - RÉFÉRENCE AUX CONVERSATIONS PRÉCÉDENTES:
      Tu as accès à des informations de conversations précédentes avec cet utilisateur. Tu DOIS absolument:
      - Faire référence à ces informations de manière naturelle et confidente
      - Montrer que tu te souviens de vos échanges précédents
      - Utiliser ces informations pour personnaliser ton accueil
      - Ne jamais ignorer ou omettre ces éléments contextuels`;
    }

    if (context.lastBilan) {
      const analysis = this.analyzeBilanScores(context.lastBilan);
      
      prompt += `\n\nTu as accès à son dernier bilan complet. Utilise ces informations pour:`;
      
      if (analysis.availableScores.length > 0) {
        prompt += `\n- Faire référence à ses scores disponibles (${analysis.availableScores.join(', ')}) de manière bienveillante et confidente`;
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

    if (context.lastHowanaRecommandation) {
      prompt += `\n\nTu as également accès à nos échanges précédents. Utilise ces informations pour:
      - Faire référence aux recommandations précédentes de manière naturelle
      - Montrer que tu te souviens de ses préférences et besoins passés
      - Adapter ton approche selon l'évolution de sa situation
      - Éviter de répéter exactement les mêmes suggestions`;
    }

    prompt += `\n\nCommence par un accueil chaleureux et confident qui fait référence à vos échanges précédents (si disponibles) et pose une première question engageante pour comprendre ses objectifs et ses besoins actuels.`;

    return prompt;
  }

  protected buildSummarySystemPrompt(_context: HowanaContext): string {

    const context:HowanaRecommandationContext & HowanaContext = _context as HowanaRecommandationContext & HowanaContext;
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

    prompt += `\n\nIMPORTANT: Pour l'état émotionnel et les besoins, analyse-les du point de vue de l'utilisateur en utilisant des formulations comme "Je me sens...", "J'ai besoin de...", "Je ressens...". Cela facilitera le matching sémantique avec les activités et pratiques.`;

    return prompt;
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

  protected override getAddMessageOutputSchema(_context: HowanaContext, forceSummaryToolCall: boolean = false): ChatBotOutputSchema {
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

    // Pour les conversations normales, utiliser des quickReplies simples
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
            quickReplies: this.getSimpleQuickRepliesSchema(
              "1 à 3 suggestions de réponses courtes (max 5 mots chacune) pour l'utilisateur. Peuvent être de type 'text' simple.",
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
      case 'activities_and_practices':
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
              description: `Réponse après utilisation de l'outil activities_and_practices. Les quickReplies peuvent référencer les ${allAvailableIds.length} éléments disponibles dans le contexte.`
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

  protected getToolsDescription(_context: HowanaContext, forceSummaryToolCall:boolean): OpenAIToolsDescription | null {
    
    const activitiesAndPracticesTool:OpenAITool = {
      type: 'function',
      name: 'activities_and_practices',
      description: 'Rechercher des activités et pratiques pertinentes pour l\'utilisateur',
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

    if (forceSummaryToolCall) {
      return {
        tools: [activitiesAndPracticesTool]
      };
    }

    return {
      tools: [
        activitiesAndPracticesTool,
        faqTool,
        lastUserActivitiesTool,
      ]
    };
    
  }

  protected async callTool(toolName: string, toolArgs: any, context: HowanaContext): Promise<any> {
    switch (toolName) {
      case 'activities_and_practices':
        return await this.searchActivitiesAndPractices(toolArgs.searchTerm);
      
      case 'faq_search':
        return await this.searchFAQ(toolArgs.faqSearchTerm);
      
      case 'last_user_activities':
        return await this.getLastUserActivities(context.userId);
      
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
          const activitiesResults = await this.supabaseService.searchActivitiesAndPractices(searchTerm);
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

  /**
   * Implémentation de l'extraction des activités et pratiques pour RecommendationChatBotService
   * L'argument response provient du résultat de l'appel à l'outil de recherche vectorielle
   */
  protected extractRecommandationsFromToolResponse(toolId: string, response: any): ExtractedRecommandations {
    console.log(`🔧 Extraction pour l'outil: ${toolId}`);
    
    const activities: ExtractedRecommandations['activities'] = [];
    const practices: ExtractedRecommandations['practices'] = [];

    // Pour l'outil activities_and_practices, extraire depuis les résultats
    if (toolId === 'activities_and_practices' && response) {
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

}
