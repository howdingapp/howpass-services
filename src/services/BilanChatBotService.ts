import { RecommendationChatBotService } from './RecommendationChatBotService';
import { HowanaBilanContext, HowanaContext } from '../types/repositories';
import { ChatBotOutputSchema } from '../types';

export class BilanChatBotService extends RecommendationChatBotService {
  
  /**
   * Règles par défaut pour les bilans (format tableau)
   */
  protected override getDefaultRules(): string[] {
    return [
      "Tu es Howana, l'assistant exclusif du portail bien-être HOW PASS. Tu es bienveillant et professionnel. Réponses courtes (maximum 30 mots).",
      
      "[BILAN] Analyse du bilan et accompagnement: Tu es spécialisée dans l'analyse des bilans de bien-être et l'accompagnement personnalisé. Ton objectif est d'aider l'utilisateur à comprendre son bilan, à identifier les points d'amélioration et à lui proposer des recommandations HOWPASS adaptées.",
      
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
      
      "L'utilisateur vient de remplir son bilan de bien-être. Aide-le à comprendre ses résultats, identifie les points d'amélioration et propose des recommandations personnalisées sur la plateforme HOW PASS.",
      
      `Utilisation des outils:
      - Utilise l'outil 'faq_search' UNIQUEMENT pour des questions informationnelles relevant des thèmes suivants: stress, anxiété, méditation, sommeil, concentration, équilibre émotionnel, confiance en soi, débutants (pratiques/activités), parrainage, ambassadeur Howana, Aper'How bien-être (définition, participation, organisation, types de pratiques)
      - Pour toute autre question (y compris compte/connexion, abonnement/prix, sécurité/données, support/bugs), ne pas utiliser 'faq_search'
      - Si la question concerne des recommandations personnalisées d'activités/pratiques, utilise 'activities_and_practices'`
    ];
  }

  /**
   * Fonction centralisée pour toutes les informations de contexte système
   */
  protected override async getSystemContext(context: any): Promise<string> {
    let contextInfo = '';

    // Contexte du bilan
    contextInfo += this.getDetailedBilanInfo(context);
    
    contextInfo += this.getLastBilanContextInfo(context);

    // Contexte de la dernière recommandation Howana
    contextInfo += this.getPreviousConversationContext(context as any);

    // Ajouter les pratiques HOW PASS existantes
    contextInfo += (await this.getAvailablePracticesContext());

    return contextInfo;
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
    
    return bilanInfo;
  
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
                      categoryKey: {
                        type: "string",
                        description: "Identifiant unique de la catégorie personnalisée"
                      },
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
                    required: ["categoryKey", "categoryName", "score", "description"],
                    additionalProperties: false
                  },
                  description: "Catégories personnalisées identifiées lors de votre conversation avec leurs scores. Soit le score a été explicitement donné par l'utilisateur, soit analysé à partir de l'échange"
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
    const hasPreviousContext = context.lastHowanaRecommandation || context.bilanData;
    
    let prompt = hasPreviousContext 
      ? `Dis bonjour et fais référence au contexte précédent pour personnaliser ta première réponse.`
      : `Salue l'utilisateur et présente-toi en tant qu'assistant Howana spécialisé dans l'analyse des bilans de bien-être. Indique que tu es là pour l'aider à comprendre son bilan et identifier les points d'amélioration.`;

    prompt += `\n\nCommence par un accueil chaleureux et pose une question engageante pour l'accompagner dans l'analyse de son bilan.`;

    return prompt;
  }

   /**
   * Détermine le schéma de sortie approprié selon l'outil utilisé
   */
   protected override getSchemaByUsedTool(_toolName: string, context: HowanaContext, forceSummaryToolCall:boolean = false): ChatBotOutputSchema {
      return this.getAddMessageOutputSchema(context, forceSummaryToolCall);
   }

  /**
   * Schéma de sortie pour le calcul d'intent spécifique aux bilans
   */
  protected override getIntentSchema(_context: HowanaContext): ChatBotOutputSchema {
    return {
      format: { 
        type: "json_schema",
        name: "BilanIntent",
        schema: {
          type: "object",
          properties: {
            primaryIntent: {
              type: "string",
              description: "Intent principal de l'utilisateur (ex: 'understand_scores', 'analyze_bilan', 'request_recommendations', 'discuss_improvements', 'ask_about_category', 'clarify_needs', 'other')",
              enum: ["understand_scores", "analyze_bilan", "request_recommendations", "discuss_improvements", "ask_about_category", "clarify_needs", "other"]
            },
            secondaryIntent: {
              type: "string",
              description: "Intent secondaire ou nuance de l'intent principal"
            },
            confidence: {
              type: "number",
              description: "Niveau de confiance dans l'identification de l'intent (0-1)",
              minimum: 0,
              maximum: 1
            },
            focusArea: {
              type: "string",
              description: "Domaine de bien-être sur lequel l'utilisateur se concentre (ex: 'confort_physique', 'equilibre_emotionnel', 'qualite_sommeil', 'niveau_energie', 'douleurs', 'other')",
              enum: ["confort_physique", "equilibre_emotionnel", "qualite_sommeil", "niveau_energie", "douleurs", "other"]
            },
            mentionedScores: {
              type: "array",
              items: { type: "string" },
              description: "Scores de bilan mentionnés dans le message (ex: 'confortPhysique', 'equilibreEmotionnel', 'qualiteSommeil', 'niveauEnergie')"
            },
            wantsRecommendations: {
              type: "boolean",
              description: "Indique si l'utilisateur demande explicitement des recommandations"
            },
            needsClarification: {
              type: "boolean",
              description: "Indique si l'utilisateur a besoin de clarifications sur son bilan"
            }
          },
          required: ["primaryIntent", "confidence"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  /**
   * Calcule le globalIntentInfos à partir de l'intent courant et du contexte
   */
  protected override async computeGlobalIntentInfos(intent: any, _context: HowanaContext): Promise<any> {
    // Implémentation par défaut - peut être surchargée selon les besoins
    return intent;
  }
}
