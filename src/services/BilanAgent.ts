import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { SupabaseService } from './SupabaseService';
import { 
  BilanRequest, 
  BilanResponse, 
  UserStateAnalysis,
  BilanAgentConfig,
  RAGDocument 
} from '../types/bilan';

export class BilanAgent {
  private supabaseService: SupabaseService;
  private llm: ChatOpenAI;
  private config: BilanAgentConfig;
  private promptTemplate: PromptTemplate;

  constructor(config?: Partial<BilanAgentConfig>) {
    this.supabaseService = new SupabaseService();
    
    // Configuration par défaut
    this.config = {
      modelName: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2000,
      topK: 5,
      similarityThreshold: 0.7,
      ...config
    };

    // Initialiser le modèle LangChain
    this.llm = new ChatOpenAI({
      modelName: this.config.modelName,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      ...(process.env['OPENAI_API_KEY'] && { openAIApiKey: process.env['OPENAI_API_KEY'] }),
    });

    // Template de prompt pour l'analyse et les recommandations
    this.promptTemplate = PromptTemplate.fromTemplate(`
Tu es un expert en bien-être et développement personnel spécialisé dans l'analyse des états émotionnels et la recommandation d'activités thérapeutiques.

CONTEXTE UTILISATEUR:
{userState}

HISTORIQUE ET PRÉFÉRENCES:
{context}

ACTIVITÉS DISPONIBLES (RAG):
{ragContext}

TÂCHES:
1. Analyser l'état émotionnel et les besoins de l'utilisateur
2. Recommander les 3-5 activités les plus pertinentes avec un score de pertinence
3. Fournir une analyse détaillée de l'état de l'utilisateur
4. Donner des suggestions personnalisées

FORMAT DE RÉPONSE JSON:
{
  "analysis": {
    "emotionalState": "Description de l'état émotionnel actuel",
    "currentNeeds": ["besoin1", "besoin2", "besoin3"],
    "potentialChallenges": ["défi1", "défi2"],
    "growthAreas": ["domaine1", "domaine2"],
    "recommendedApproach": "Approche recommandée pour accompagner l'utilisateur"
  },
  "recommendations": [
    {
      "id": "id_activité",
      "title": "Titre de l'activité",
      "shortDescription": "Description courte",
      "longDescription": "Description détaillée",
      "category": "Catégorie",
      "practice": {
        "id": "id_pratique",
        "title": "Titre de la pratique",
        "description": "Description de la pratique"
      },
      "relevanceScore": 0.95,
      "reasoning": "Pourquoi cette activité est recommandée",
      "benefits": ["bénéfice1", "bénéfice2"],
      "typicalSituations": "Situations typiques où cette activité est utile",
      "estimatedDuration": "30-45 minutes",
      "difficulty": "beginner"
    }
  ],
  "suggestions": [
    "Suggestion personnalisée 1",
    "Suggestion personnalisée 2"
  ]
}

Réponds uniquement avec le JSON valide, sans texte supplémentaire.
    `);
  }

  /**
   * Génère un bilan et des recommandations d'activités basées sur l'état de l'utilisateur
   */
  async generateBilan(request: BilanRequest): Promise<BilanResponse> {
    try {
      // 1. Récupérer le contexte RAG des activités disponibles
      const ragContext = await this.getRAGContext(request.userState);
      
      // 2. Préparer le contexte pour le prompt
      const contextString = this.formatContext(request.context);
      
      // 3. Créer la chaîne de traitement LangChain
      const chain = RunnableSequence.from([
        this.promptTemplate,
        this.llm,
        new StringOutputParser()
      ]);

      // 4. Exécuter la chaîne
      const result = await chain.invoke({
        userState: request.userState,
        context: contextString,
        ragContext: ragContext
      });

      // 5. Parser la réponse JSON
      const parsedResult = this.parseLLMResponse(result);
      
      return {
        success: true,
        recommendations: parsedResult.recommendations || [],
        analysis: parsedResult.analysis || this.getDefaultAnalysis(),
        suggestions: parsedResult.suggestions || []
      };

    } catch (error) {
      console.error('Erreur lors de la génération du bilan:', error);
      return {
        success: false,
        recommendations: [],
        analysis: this.getDefaultAnalysis(),
        suggestions: [],
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }

  /**
   * Récupère le contexte RAG basé sur l'état de l'utilisateur
   */
  private async getRAGContext(userState: string): Promise<string> {
    try {
      // Récupérer les activités et pratiques depuis Supabase
      const activities = await this.supabaseService.getActivities();
      const practices = await this.supabaseService.getPractices();
      
      // Créer des documents RAG
      const documents: RAGDocument[] = [];
      
      // Ajouter les activités
      if (activities.data) {
        activities.data.forEach((activity: {
          id: string;
          title: string;
          short_description?: string;
          long_description?: string;
          category_id: string;
          tags?: string[];
        }) => {
          documents.push({
            id: activity.id,
            content: `${activity.title} ${activity.short_description || ''} ${activity.long_description || ''}`,
            metadata: {
              type: 'activity',
              title: activity.title,
              category: activity.category_id,
              tags: activity.tags || []
            }
          });
        });
      }

      // Ajouter les pratiques
      if (practices.data) {
        practices.data.forEach((practice: {
          id: string;
          title: string;
          short_description?: string;
          long_description?: string;
          category_id: string;
          tags?: string[];
        }) => {
          documents.push({
            id: practice.id,
            content: `${practice.title} ${practice.short_description || ''} ${practice.long_description || ''}`,
            metadata: {
              type: 'practice',
              title: practice.title,
              category: practice.category_id,
              tags: practice.tags || []
            }
          });
        });
      }

      // Simuler une recherche RAG basée sur la similarité sémantique
      // Dans une implémentation réelle, on utiliserait des embeddings et une recherche vectorielle
      const relevantDocs = this.simulateRAGSearch(userState, documents);
      
      return this.formatRAGContext(relevantDocs);

    } catch (error) {
      console.error('Erreur lors de la récupération du contexte RAG:', error);
      return 'Aucune activité disponible pour le moment.';
    }
  }

  /**
   * Simule une recherche RAG basée sur des mots-clés
   * Dans une implémentation réelle, on utiliserait des embeddings OpenAI et une base vectorielle
   */
  private simulateRAGSearch(userState: string, documents: RAGDocument[]): RAGDocument[] {
    const userKeywords = userState.toLowerCase().split(/\s+/);
    
    return documents
      .map(doc => {
        const docContent = doc.content.toLowerCase();
        let score = 0;
        
        userKeywords.forEach(keyword => {
          if (docContent.includes(keyword)) {
            score += 1;
          }
        });
        
        return { ...doc, relevanceScore: score };
      })
      .filter(doc => doc.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, this.config.topK);
  }

  /**
   * Formate le contexte RAG pour le prompt
   */
  private formatRAGContext(documents: RAGDocument[]): string {
    if (documents.length === 0) {
      return 'Aucune activité pertinente trouvée.';
    }

    return documents
      .map(doc => `
ACTIVITÉ: ${doc.metadata.title}
Type: ${doc.metadata.type}
Catégorie: ${doc.metadata.category}
Description: ${doc.content.substring(0, 200)}...
      `)
      .join('\n');
  }

  /**
   * Formate le contexte utilisateur pour le prompt
   */
  private formatContext(context?: BilanRequest['context']): string {
    if (!context) return 'Aucun contexte supplémentaire.';

    const parts: string[] = [];
    
    if (context.previousActivities?.length) {
      parts.push(`Activités précédentes: ${context.previousActivities.join(', ')}`);
    }
    
    if (context.preferences?.length) {
      parts.push(`Préférences: ${context.preferences.join(', ')}`);
    }
    
    if (context.goals?.length) {
      parts.push(`Objectifs: ${context.goals.join(', ')}`);
    }

    return parts.length > 0 ? parts.join('\n') : 'Aucun contexte supplémentaire.';
  }

  /**
   * Parse la réponse JSON du LLM
   */
  private parseLLMResponse(response: string): any {
    try {
      // Nettoyer la réponse pour extraire le JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Aucun JSON trouvé dans la réponse');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Erreur lors du parsing de la réponse LLM:', error);
      return {};
    }
  }

  /**
   * Retourne une analyse par défaut en cas d'erreur
   */
  private getDefaultAnalysis(): UserStateAnalysis {
    return {
      emotionalState: 'État émotionnel non analysé',
      currentNeeds: ['Besoins non identifiés'],
      potentialChallenges: ['Défis non identifiés'],
      growthAreas: ['Domaines de croissance non identifiés'],
      recommendedApproach: 'Approche non définie'
    };
  }

  /**
   * Met à jour la configuration de l'agent
   */
  updateConfig(newConfig: Partial<BilanAgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Mettre à jour le modèle si nécessaire
    if (newConfig.modelName || newConfig.temperature || newConfig.maxTokens) {
      this.llm = new ChatOpenAI({
        modelName: this.config.modelName,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        ...(process.env['OPENAI_API_KEY'] && { openAIApiKey: process.env['OPENAI_API_KEY'] }),
      });
    }
  }

  /**
   * Récupère la configuration actuelle
   */
  getConfig(): BilanAgentConfig {
    return { ...this.config };
  }
}
