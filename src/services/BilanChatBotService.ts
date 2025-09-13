import { RecommendationChatBotService } from './RecommendationChatBotService';
import { HowanaBilanContext, HowanaContext } from '../types/repositories';

export class BilanChatBotService extends RecommendationChatBotService {
  
  /**
   * Règles par défaut pour les bilans
   */
  protected getDefaultBilanRules(): string {
    return `1. [BILAN] Analyse du bilan et accompagnement: Tu es spécialisée dans l'analyse des bilans de bien-être 
    et l'accompagnement personnalisé. Ton objectif est d'aider l'utilisateur à comprendre son bilan, 
    à identifier les points d'amélioration et à lui proposer des recommandations HOWPASS adaptées.`;
  }

  /**
   * Informations contextuelles du bilan
   */
  protected override getBilanContextInfo(context: any): string {
    if (!context.bilanData) return '';

    return `\n\nL'utilisateur vient de remplir son bilan de bien-être. 
    Aide-le à comprendre ses résultats, identifie les points d'amélioration et propose des recommandations personnalisées.`;
  }

  /**
   * Informations contextuelles des conversations précédentes
   */
  protected override getPreviousConversationContext(context: any): string {
    if (!context.lastHowanaRecommandation) return '';

    let previousContext = `\n\nCONTEXTE DES DERNIERS ECHANGES:`;
    
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
      const categories = context.lastHowanaRecommandation.recommendedCategories.map((cat: any) => cat.name).join(', ');
      previousContext += `\n- Pratiques recommandées précédemment: ${categories}`;
    }

    if (context.lastHowanaRecommandation.recommendedActivities && context.lastHowanaRecommandation.recommendedActivities.length > 0) {
      const activities = context.lastHowanaRecommandation.recommendedActivities.map((act: any) => act.name).join(', ');
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

    previousContext += `\n\nUtilise ces informations pour comprendre l'évolution de l'utilisateur et adapter tes questions. Évite de répéter exactement les mêmes suggestions.`;

    return previousContext;
  }

  /**
   * Informations détaillées du bilan
   */
  protected getDetailedBilanInfo(context: HowanaBilanContext & HowanaContext): string {
    if (!context.bilanData) return '';

    let bilanInfo = `\n\nINFORMATIONS DU PRE-BILAN DISPONIBLES:
    - Confort physique: ${context.bilanData.scores.principaux.confortPhysique}/9
    - Équilibre émotionnel: ${context.bilanData.scores.principaux.equilibreEmotionnel}/9
    - Qualité du sommeil: ${context.bilanData.scores.principaux.qualiteSommeil}/9
    - Niveau d'énergie: ${context.bilanData.scores.principaux.niveauEnergie}/9`;
    
    if (context.bilanData.douleurs) {
      bilanInfo += `\n- Douleurs: ${context.bilanData.douleurs}`;
    }
    if (context.bilanData.notesPersonnelles) {
      bilanInfo += `\n- Notes personnelles: ${context.bilanData.notesPersonnelles}`;
    }
    
    bilanInfo += `\n\nNote: Les scores vont de 1 (très déséquilibré) à 9 (très équilibré). Utilise ces informations pour adapter tes recommandations.
    
    DÉCOUVERTE DE CATÉGORIES PERSONNALISÉES:
    - Pose des questions pour identifier d'autres aspects du bien-être importants pour l'utilisateur
    - Demande des scores de 1 à 9 pour ces nouvelles catégories
    - Exemples: relations sociales, créativité, spiritualité, équilibre travail-vie, etc.
    - Ces informations enrichiront le bilan et permettront des recommandations plus personnalisées.`;

    return bilanInfo;
  }

  /**
   * Règles contextuelles spécifiques aux bilans
   */
  protected getBilanSpecificRules(): string {
    return `
    - Analyse les données du bilan pour comprendre l'état actuel de l'utilisateur
    - Identifie les points d'amélioration et les forces
    - Propose des activités et pratiques adaptées aux scores du bilan
    - Accompagne l'utilisateur dans la compréhension de ses résultats
    - DÉCOUVRE DES SCORES PERSONNALISÉS: Pose des questions pour identifier d'autres aspects du bien-être non couverts par le bilan standard
    - Demande des scores de 1 à 9 pour ces nouvelles catégories (1 = très déséquilibré, 9 = très équilibré)
    - IMPORTANT: L'échange doit se limiter à environ 10 questions maximum
    - Chaque réponse doit impérativement contenir une question pour maintenir l'engagement`;
  }
  
  protected override async buildSystemPrompt(_context: HowanaContext): Promise<string> {

    const context:HowanaBilanContext & HowanaContext = _context as HowanaBilanContext & HowanaContext;
    
    let basePrompt = `Tu es Howana, un assistant personnel et confident spécialisé dans le bien-être et les activités de santé. 
    Tu es bienveillant.  Réponses courtes (maximum 30 mots).`;

    // Règles de comportement et d'information spécifiques à respecter
    basePrompt += `\n\nRègles de comportement et d'information spécifiques à respecter :`;

    // RÈGLE OBLIGATOIRE : Toujours faire référence aux conversations précédentes si disponibles
    if (context.lastHowanaRecommandation || context.bilanData) {
      basePrompt += `\n0. [CONFIANT] Comportement de confident: Tu es comme un confident qui retrouve quelqu'un qu'il connaît bien. 
      Tu DOIS TOUJOURS faire référence aux conversations précédentes, demander des nouvelles, et montrer que tu te souviens 
      de vos échanges. Cette règle est PRIORITAIRE sur toutes les autres.`;
    }

    basePrompt += await this.getIaRules(context.type, this.getDefaultBilanRules());

    // Ajouter le contexte spécifique au bilan
    basePrompt += this.getBilanContextInfo(context);

    // Règles générales (toujours présentes)
    basePrompt += `\n\n${this.getCommonRules()}`;

    // Ajouter le contexte de la dernière recommandation Howana si disponible
    basePrompt += this.getPreviousConversationContext(context);
    
    // Règles contextuelles spécifiques
    basePrompt += this.getBilanSpecificRules();

    // Ajouter les informations du bilan si disponibles
    basePrompt += this.getDetailedBilanInfo(context);

    return basePrompt;
  }

  protected override getSummaryOutputSchema(context: HowanaContext): any {
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
            userProfile: this.getUserProfileSchemaFragment("Profil utilisateur analysé à partir de la conversation de bilan"),
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
                    required: ["categoryName", "score", "description"],
                    additionalProperties: false
                  },
                  description: "Catégories personnalisées identifiées lors de votre conversation avec leurs scores"
                }
              },
              required: ["scoresAnalysis", "customCategories"],
              additionalProperties: false
            },
            recommendation: this.getRecommendationSchemaFragment(
              availableActivityIds,
              availableActivityNames,
              availablePracticeIds,
              availablePracticeNames,
              "Recommandation personnalisée basée sur l'analyse du bilan de bien-être"
            ),
            importanteKnowledge: {
              type: "array",
              items: { type: "string" },
              description: "Messages destinés à l'utilisateur contenant les points clés à retenir pour optimiser votre parcours de bien-être (formulés en vous parlant directement)"
            }
          },
          required: ["userProfile", "bilanAnalysis", "recommendation", "importanteKnowledge"],
          additionalProperties: false,
          description: `Résumé personnalisé de votre bilan de bien-être avec recommandations adaptées. Les recommandations sont contraintes aux ${allAvailableIds.length} éléments disponibles dans le contexte.`
        },
        strict: true
      }
    };
  }

  protected override buildFirstUserPrompt(_context: HowanaContext): string {
    const context: HowanaBilanContext & HowanaContext = _context as HowanaBilanContext & HowanaContext;
    
    let prompt = `Salue l'utilisateur et présente-toi en tant qu'assistant Howana spécialisé dans l'analyse des bilans de bien-être.
    
    Indique que tu es là pour l'aider à comprendre son bilan, identifier les points d'amélioration et lui proposer des recommandations personnalisées.`;

    // Vérifier s'il y a des informations de conversations précédentes
    const hasPreviousContext = context.lastHowanaRecommandation || context.bilanData;
    
    if (hasPreviousContext) {
      prompt += `\n\nIMPORTANT - COMPORTEMENT DE CONFIANT:
      Tu es comme un confident qui retrouve quelqu'un qu'il connaît bien. Tu DOIS absolument:
      - Demander des nouvelles de manière chaleureuse et personnelle
      - Faire référence aux conversations précédentes de manière naturelle
      - Montrer que tu te souviens de vos échanges précédents
      - Adopter un ton de confident qui s'intéresse sincèrement à l'évolution de la personne
      - Ne jamais ignorer ou omettre ces éléments contextuels`;
    }

    if (context.bilanData) {
      prompt += `\n\nTu as accès à son bilan de bien-être. Utilise ces informations pour:
      - Faire référence à ses scores de manière bienveillante et confidente
      - Montrer que tu connais déjà son état de bien-être
      - Adapter ton approche selon les résultats de son bilan
      - Poser des questions ciblées basées sur ses scores`;
    }

    if (context.lastHowanaRecommandation) {
      prompt += `\n\nTu as également accès à nos échanges précédents. Utilise ces informations pour:
      - Demander des nouvelles des recommandations précédentes
      - Montrer que tu te souviens de ses préférences et besoins passés
      - Adapter ton approche selon l'évolution de sa situation
      - Créer une continuité dans votre relation de confiance`;
    }

    prompt += `\n\nCommence par un accueil chaleureux de confident qui demande des nouvelles, fait référence à vos échanges précédents (si disponibles) et pose une première question engageante pour l'accompagner dans l'analyse de son bilan.`;

    return prompt;
  }

  protected override buildSummarySystemPrompt(_context: HowanaContext): string {
    return `Tu es un assistant spécialisé dans l'analyse de conversations de bilan de bien-être. 
    Analyse la conversation et génère un résumé structuré qui permettra de comprendre l'état de l'utilisateur, 
    l'analyse de son bilan et les recommandations proposées.
    
    IMPORTANT: Pour l'état émotionnel et les besoins, analyse-les du point de vue de l'utilisateur en utilisant des formulations comme "Je me sens...", "J'ai besoin de...", "Je ressens...". Cela facilitera le matching sémantique avec les activités et pratiques.
    
    Note: Les suggestions de réponses courtes (quickReplies) sont optionnelles et servent à faciliter l'interaction utilisateur.`;
  }

}
