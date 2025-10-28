import { BaseChatBotService } from './BaseChatBotService';
import { HowanaActivityContext, HowanaContext } from '../types/repositories';
import { IAMessageResponse, ExtractedRecommandations } from '../types/chatbot-output';

export class ActivityChatBotService extends BaseChatBotService<IAMessageResponse> {
  
  /**
   * Règles par défaut pour les activités (format tableau)
   */
  protected getDefaultRules(): string[] {
    return [
      "Tu es Howana, l'assistant exclusif du portail bien-être HOW PASS. Tu es bienveillant et professionnel. Réponses courtes (maximum 30 mots).",
      
      "[EXPERTISE] Expertise des pratiques: Tu es experte des pratiques de bien-être et de santé. Ton objectif est d'aider à valider la cohérence entre l'activité et la pratique qui lui est associée.",
      
      `OBJECTIFS SPÉCIFIQUES POUR LE RÉSUMÉ STRUCTURÉ: Tu dois collecter des informations précises pour générer automatiquement un résumé structuré avec ces 6 éléments:
      
      A) TITRE (max 100 caractères): Un titre optimisé et descriptif de l'activité
      B) DESCRIPTION COURTE (max 200 caractères): Description accrocheuse mettant en avant l'unicité
      C) DESCRIPTION DÉTAILLÉE (max 500 caractères): Déroulement, approche et expérience des participants
      D) MOTS-CLÉS: Liste des termes les plus pertinents pour cette activité
      E) BÉNÉFICES: Liste des bénéfices concrets et mesurables pour les participants
      F) PROFIL IDÉAL: Description du profil psychologique et situation idéale de l'utilisateur cible`,
      
      `STRATÉGIE DE COLLECTE:
      - Tu n'as le droit de poser qu'une seule question ou demande d'information dans chacune de tes réponses pour ne pas surcharger l'utilisateur
      - Pose des questions ciblées pour chaque élément
      - Demande des exemples concrets et spécifiques
      - Vérifie la cohérence avec la pratique associée
      - Collecte des détails qui permettront de remplir automatiquement les formulaires`
    ];
  }

  /**
   * Règles par défaut pour les sessions d'amélioration
   */
  protected getDefaultEditingRules(): string {
    return `1. [EXPERTISE] Expertise des pratiques: Tu es experte des pratiques de bien-être et de santé. 
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
  }

  /**
   * Informations contextuelles de l'activité
   */
  protected async getActivityContextInfo(context: HowanaActivityContext & HowanaContext): Promise<string> {
    if (!context.activityData) return '';

    let activityInfo = `\n\nINFORMATIONS DE L'ACTIVITÉ (déclarées par le praticien Howel Angel):
    - Titre: "${context.activityData.title}"`;
    
    if (context.activityData.shortDescription) {
      activityInfo += `\n- Description courte: ${context.activityData.shortDescription}`;
    }
    if (context.activityData.longDescription) {
      activityInfo += `\n- Description détaillée: ${context.activityData.longDescription}`;
    }

    return activityInfo;
  }

  /**
   * Informations contextuelles de la pratique associée
   */
  protected getPracticeContextInfo(context: HowanaActivityContext & HowanaContext): string {
    if (!context.activityData?.practice) return '';

    const practice = context.activityData.practice;
    let practiceInfo = `\n\nPRATIQUE ASSOCIÉE (référentiel certifié):
    - Nom: ${practice.title}
    - Description courte: ${practice.shortDescription || 'Non disponible'}
    - Description détaillée: ${practice.longDescription || 'Non disponible'}`;
    
    // Ajouter les informations de catégorie si disponibles
    if (practice.categoryData) {
      practiceInfo += `\n- Catégorie: ${practice.categoryData.name}
      - Description de la catégorie: ${practice.categoryData.description || 'Non disponible'}`;
    }
    
    // Ajouter les informations de famille si disponibles
    if (practice.familyData) {
      practiceInfo += `\n- Famille de pratiques: ${practice.familyData.name}
      - Description de la famille: ${practice.familyData.description || 'Non disponible'}`;
    }

    return practiceInfo;
  }

  /**
   * Instructions pour utiliser les données de catégorie et famille
   */
  protected getCategoryFamilyInstructions(context: HowanaActivityContext & HowanaContext): string {
    if (!context.activityData?.practice?.categoryData && !context.activityData?.practice?.familyData) {
      return '';
    }

    return `\n\nUTILISATION DES DONNÉES DE CATÉGORIE ET FAMILLE:
    Ces informations te permettent de:
    - Comprendre le contexte plus large de la pratique
    - Adapter tes questions selon la spécialisation de la catégorie
    - Utiliser le vocabulaire et les concepts appropriés à la famille de pratiques
    - Suggérer des améliorations cohérentes avec le référentiel de la pratique
    - Guider l'utilisateur vers des formulations plus précises et professionnelles`;
  }

  /**
   * Informations contextuelles du praticien
   */
  protected getPractitionerContextInfo(context: HowanaActivityContext & HowanaContext): string {
    if (!context.practicienData?.creatorExperience) return '';

    return `\n\nPROFIL DU PRATICIEN:
    - Expérience: ${context.practicienData.creatorExperience}`;
  }

  /**
   * Instructions pour les sessions d'amélioration
   */
  protected getEditingSessionInstructions(context: HowanaActivityContext & HowanaContext): string {
    if (!context.isEditing) return '';

    let editingInfo = `\n\n🎯 SESSION D'AMÉLIORATION - INFORMATIONS PRÉEXISTANTES:
    Cette session fait suite à une conversation précédente où tu as aidé à générer des informations.
    
    Données déjà collectées et à améliorer:`;
    
    if (context.activityData.selectedKeywords && context.activityData.selectedKeywords.length > 0) {
      editingInfo += `\n- Mots-clés actuels: ${context.activityData.selectedKeywords.join(', ')}`;
    }
    if (context.activityData.benefits && context.activityData.benefits.length > 0) {
      editingInfo += `\n- Bénéfices actuels: ${context.activityData.benefits.join(', ')}`;
    }
    if (context.activityData.typicalSituations) {
      editingInfo += `\n- Situations typiques actuelles: ${context.activityData.typicalSituations}`;
    }
    
    editingInfo += `\n\nOBJECTIF DE LA SESSION D'AMÉLIORATION:
    - Analyser la qualité des informations existantes
    - Identifier les points d'amélioration et les lacunes
    - Enrichir et affiner chaque élément pour optimiser l'impact
    - Vérifier la cohérence avec la pratique et les données de catégorie/famille
    - S'assurer que les informations sont suffisamment détaillées et précises
    
    APPROCHE:
    - Commence par évaluer la qualité des informations existantes
    - Pose des questions ciblées pour améliorer chaque élément
    - Utilise les données de catégorie et famille pour enrichir le contexte
    - Vérifie la cohérence avec l'expérience du praticien
    - Exploite les informations de catégorie et famille pour suggérer des améliorations pertinentes
    - Adapte tes conseils selon le niveau d'expérience du praticien`;

    return editingInfo;
  }

  /**
   * Instructions pour les conversations normales
   */
  protected getNormalConversationInstructions(context: HowanaActivityContext & HowanaContext): string {
    if (context.isEditing) return '';

    return `\n\nOBJECTIF DE LA CONVERSATION:
    Collecter les informations manquantes pour générer un résumé structuré complet.
    Vérifier et enrichir les informations existantes pour optimiser l'auto-remplissage des formulaires.
    
    POINTS D'ATTENTION:
    - Si des informations sont déjà présentes, demande des précisions ou des améliorations
    - Si des informations manquent, pose des questions ciblées pour les collecter
    - Assure-toi que chaque élément du résumé sera suffisamment détaillé et précis
    - Le format de sortie doit etre un texte adapté à un chat sur mobile
    - Utilise les informations de catégorie et famille pour enrichir le contexte et guider tes suggestions
    - Adapte tes conseils selon l'expérience du praticien`;
  }

  /**
   * Instructions spécifiques pour le mode édition
   */
  protected getEditingModeInstructions(): string {
    return `
    - Tu es en mode AMÉLIORATION : l'utilisateur revient pour affiner des informations déjà générées
    - Analyse la qualité des données existantes et propose des améliorations ciblées
    - Utilise les informations de catégorie et famille pour enrichir le contexte
    - Vérifie la cohérence avec l'expérience du praticien
    - L'objectif est d'optimiser l'impact et la précision des informations
    
    STRATÉGIE D'AMÉLIORATION:
    - Évalue la pertinence et la précision de chaque élément existant
    - Propose des enrichissements basés sur les données de catégorie/famille
    - Vérifie l'alignement avec l'expérience du praticien
    - Assure-toi que les informations sont suffisamment détaillées pour l'auto-remplissage
    
    - IMPORTANT: L'échange doit se limiter à environ 10 questions maximum
    - Chaque réponse doit impérativement contenir une question pour maintenir l'engagement`;
  }

  /**
   * Instructions spécifiques pour le mode normal (non-édition)
   */
  protected getNormalModeInstructions(): string {
    return `
    - Ton objectif principal est d'aider le praticien à valider la conformité de son activité avec la pratique associée
    - Pose des questions pertinentes pour mieux comprendre l'activité et établir la conformité
    - Identifie le profil d'utilisateur idéal pour cette activité/pratique
    - Suggère des ajustements si nécessaire pour optimiser la synergie
    - Utilise les informations de catégorie et famille pour enrichir le contexte
    - Prends en compte l'expérience du praticien dans tes recommandations
    
    COLLECTE POUR LE RÉSUMÉ STRUCTURÉ:
    - Guide la conversation pour collecter les 6 éléments requis du résumé
    - Demande des précisions sur chaque aspect (titre, descriptions, mots-clés, bénéfices, profil cible)
    - Vérifie que les informations sont suffisamment détaillées pour l'auto-remplissage
    - Adapte tes questions selon les informations déjà fournies
    - Utilise les données de catégorie et famille pour enrichir le contexte
    
    - IMPORTANT: L'échange doit se limiter à environ 10 questions maximum
    - Chaque réponse doit impérativement contenir une question pour maintenir l'engagement`;
  }
  
  /**
   * Fonction centralisée pour toutes les informations de contexte système
   */
  protected async getSystemContext(context: HowanaActivityContext & HowanaContext): Promise<string> {
    let contextInfo = '';

    // Règles de comportement et d'information spécifiques à respecter
    contextInfo += `\n\nRègles de comportement et d'information spécifiques à respecter :`;

    // Ajouter le contexte de l'activité et de la pratique si disponible
    if (context.activityData) {
      contextInfo += await this.getActivityContextInfo(context);
      contextInfo += this.getPracticeContextInfo(context);
      contextInfo += this.getCategoryFamilyInstructions(context);
      contextInfo += this.getPractitionerContextInfo(context);
      contextInfo += this.getEditingSessionInstructions(context);
      contextInfo += this.getNormalConversationInstructions(context);

      // Ajouter les pratiques HOW PASS existantes
      contextInfo += await this.getAvailablePracticesContext();

    }

    // Règles générales (toujours présentes)
    contextInfo += `\n\n${this.getCommonRules()}
    - L'échange doit contenir environ 10 questions maximum
    - Chaque réponse doit TOUJOURS contenir une question pertinente`;
    
    // Règles contextuelles spécifiques selon le mode
    if (context.isEditing) {
      contextInfo += this.getEditingModeInstructions();
    } else {
      contextInfo += this.getNormalModeInstructions();
    }

    return contextInfo;
  }

  protected buildFirstUserPrompt(_context: HowanaContext): string {

    const context:HowanaActivityContext & HowanaContext = _context as HowanaActivityContext & HowanaContext;

    if (context.activityData) {
      const isEditing = context.isEditing;
      
      if (isEditing) {
        return `Salue le praticien et présente-toi en tant qu'assistant Howana spécialisé dans l'accompagnement des praticiens experts.
        
        Au lieu de te présenter longuement, dis simplement "Rebonjour sur ce sujet !"
        
        Fais un très bref état des lieux résumé de ce qui a été déclaré et des informations existantes :
        - Activité : "${context.activityData.title}"
        ${context.activityData.shortDescription ? `- Description : ${context.activityData.shortDescription}` : ''}
        ${context.activityData.typicalSituations ? `- Situations typiques : ${context.activityData.typicalSituations}` : ''}
        
        Indique que tu es là pour l'aider à améliorer et affiner sa déclaration d'activité existante.
        
        OBJECTIF SPÉCIFIQUE: Analyser et améliorer les informations existantes pour optimiser le résumé structuré avec:
        - Titre optimisé, descriptions (courte et détaillée), mots-clés, bénéfices, et profil utilisateur idéal.
        
        Pose une question engageante pour mieux comprendre ce qu'il souhaite modifier ou améliorer dans sa déclaration d'activité existante.`;
      } else {
        return `Salue le praticien et présente-toi en tant qu'assistant Howana spécialisé dans l'accompagnement des praticiens experts.
        
        Fais un petit état des lieux résumé de ce qui a été déclaré :
        - Activité : "${context.activityData.title}"
        ${context.activityData.shortDescription ? `- Description courte : ${context.activityData.shortDescription}` : ''}
        
        Indique que tu es là pour l'aider à compléter et optimiser sa déclaration d'activité.
        
        OBJECTIF SPÉCIFIQUE: Collecter les informations nécessaires pour générer automatiquement un résumé structuré avec:
        - Titre optimisé, descriptions (courte et détaillée), mots-clés, bénéfices, et profil utilisateur idéal.
        
        Commence par un accueil chaleureux et pose une première question engageante pour mieux comprendre son activité et commencer à établir la conformité avec sa pratique associée.`;
      }
    }
    
    return "Salue le praticien et présente-toi en tant qu'assistant Howana spécialisé dans l'accompagnement des praticiens experts.";
  }

  protected buildSummarySystemPrompt(_context: HowanaContext): string {
    return `Tu es un assistant spécialisé dans l'analyse de conversations entre praticiens et experts. 
    Analyse la conversation et génère un résumé structuré qui permettra de remplir automatiquement les formulaires d'activité.`;
  }

  protected getSummaryOutputSchema(_context: HowanaContext): any {
    return {
      format: { 
        type: "json_schema",
        name: "ActivitySummary",
        schema: {
          type: "object",
          properties: {
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
            selectedKeywords: {
              type: "array",
              items: { type: "string" },
              description: "Liste des mots-clés les plus pertinents pour cette activité."
            },
            benefits: {
              type: "array",
              items: { type: "string" },
              description: "Liste des bénéfices concrets et mesurables que les participants peuvent attendre de cette activité."
            },
            typicalSituations: {
              type: "string",
              description: "Description de l'état mental et émotionnel de l'utilisateur AVANT de pratiquer cette activité. Décrire ce que l'utilisateur ressent, vit, ou expérimente quand il est dans une situation qui nécessite cette pratique. Inclure les émotions, sensations, besoins, expériences vécues, etc. du point de vue de l'utilisateur, mais AVANT qu'il commence l'activité recommandée. Exemples: 'Je me sens stressé et surchargé, j'ai besoin de me recentrer et de retrouver mon calme intérieur' ou 'Je ressens une fatigue mentale et un manque d'énergie, j'ai envie de me ressourcer et de me reconnecter à moi-même'. Indiquer seulement si pertinent: faire des connexions avec l'expérience du praticien pour identifier des matchings de personnalité ou de parcours qui pourraient enrichir la description de la situation idéale."
            }
          },
          required: ["shortDescription", "longDescription", "title", "selectedKeywords", "benefits", "typicalSituations"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  protected getStartConversationOutputSchema(_context: HowanaContext): any | null {
    return null;
  }


  protected getToolsDescription(_context: HowanaContext, _forceSummaryToolCall:boolean, _forWoo:boolean = false): any | null {
    return null;
  }

  protected async callTool(toolName: string, _toolArgs: any, _context: HowanaContext): Promise<any> {
    throw new Error(`Tool ${toolName} not implemented in ActivityChatBotService`);
  }

  protected extractRecommandationsFromToolResponse(_toolId: string, _response: any): ExtractedRecommandations {
    // ActivityChatBotService n'utilise pas d'outils, donc rien à extraire
    return { activities: [], practices: [] };
  }
}
