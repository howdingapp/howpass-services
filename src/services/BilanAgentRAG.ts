import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
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

export class BilanAgentRAG {
  private supabaseService: SupabaseService;
  private llm: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;
  private config: BilanAgentConfig;
  private promptTemplate: PromptTemplate;
  private documentCache: Map<string, RAGDocument[]> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes

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

    // Initialiser les embeddings OpenAI
    this.embeddings = new OpenAIEmbeddings({
      ...(process.env['OPENAI_API_KEY'] && { openAIApiKey: process.env['OPENAI_API_KEY'] }),
    });

    // Template de prompt optimisé pour le RAG
    this.promptTemplate = PromptTemplate.fromTemplate(`
Tu es un expert en bien-être et développement personnel spécialisé dans l'analyse des états émotionnels et la recommandation d'activités thérapeutiques.

CONTEXTE UTILISATEUR:
{userState}

HISTORIQUE ET PRÉFÉRENCES:
{context}

ACTIVITÉS PERTINENTES (RAG):
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
      // 1. Récupérer le contexte RAG des activités disponibles avec embeddings
      const ragContext = await this.getRAGContextWithEmbeddings(request.userState);
      
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
   * Récupère le contexte RAG avec embeddings pour une recherche vectorielle
   */
  private async getRAGContextWithEmbeddings(userState: string): Promise<string> {
    try {
      // Vérifier le cache
      const cacheKey = this.getCacheKey();
      let documents = this.documentCache.get(cacheKey);
      
      if (!documents) {
        // Récupérer les activités et pratiques depuis Supabase
        const activities = await this.supabaseService.getActivities();
        const practices = await this.supabaseService.getPractices();
        
        // Créer des documents RAG avec embeddings
        documents = await this.createDocumentsWithEmbeddings(activities.data || [], practices.data || []);
        
        // Mettre en cache
        this.documentCache.set(cacheKey, documents);
        
        // Nettoyer le cache après expiration
        setTimeout(() => {
          this.documentCache.delete(cacheKey);
        }, this.cacheExpiry);
      }

      // Recherche vectorielle basée sur la similarité des embeddings
      const relevantDocs = await this.vectorSearch(userState, documents);
      
      return this.formatRAGContext(relevantDocs);

    } catch (error) {
      console.error('Erreur lors de la récupération du contexte RAG:', error);
      return 'Aucune activité disponible pour le moment.';
    }
  }

  /**
   * Crée des documents RAG avec embeddings
   */
  private async createDocumentsWithEmbeddings(activities: any[], practices: any[]): Promise<RAGDocument[]> {
    const documents: RAGDocument[] = [];
    
    // Traiter les activités
    if (activities) {
      for (const activity of activities) {
        const content = `${activity.title} ${activity.short_description || ''} ${activity.long_description || ''}`;
        const embedding = await this.embeddings.embedQuery(content);
        
        documents.push({
          id: activity.id,
          content: content,
          metadata: {
            type: 'activity',
            title: activity.title,
            category: activity.category_id,
            tags: activity.tags || [],
            difficulty: activity.difficulty || 'beginner'
          },
          embedding: embedding
        });
      }
    }

    // Traiter les pratiques
    if (practices) {
      for (const practice of practices) {
        const content = `${practice.title} ${practice.short_description || ''} ${practice.long_description || ''}`;
        const embedding = await this.embeddings.embedQuery(content);
        
        documents.push({
          id: practice.id,
          content: content,
          metadata: {
            type: 'practice',
            title: practice.title,
            category: practice.category_id,
            tags: practice.tags || [],
            difficulty: practice.difficulty || 'beginner'
          },
          embedding: embedding
        });
      }
    }

    return documents;
  }

  /**
   * Recherche vectorielle basée sur la similarité des embeddings
   */
  private async vectorSearch(userState: string, documents: RAGDocument[]): Promise<RAGDocument[]> {
    try {
      // Générer l'embedding de l'état de l'utilisateur
      const userEmbedding = await this.embeddings.embedQuery(userState);
      
      // Calculer la similarité cosinus pour chaque document
      const scoredDocuments = documents.map(doc => {
        if (!doc.embedding) return { ...doc, similarityScore: 0 };
        
        const similarity = this.cosineSimilarity(userEmbedding, doc.embedding);
        return { ...doc, similarityScore: similarity };
      });

      // Filtrer et trier par similarité
      return scoredDocuments
        .filter(doc => doc.similarityScore >= this.config.similarityThreshold)
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, this.config.topK);

    } catch (error) {
      console.error('Erreur lors de la recherche vectorielle:', error);
      // Fallback vers la recherche par mots-clés
      return this.fallbackKeywordSearch(userState, documents);
    }
  }

  /**
   * Calcule la similarité cosinus entre deux vecteurs
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i] || 0;
      const b = vecB[i] || 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Recherche de fallback basée sur les mots-clés
   */
  private fallbackKeywordSearch(userState: string, documents: RAGDocument[]): RAGDocument[] {
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
        
        return { ...doc, similarityScore: score };
      })
      .filter(doc => doc.similarityScore > 0)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, this.config.topK);
  }

  /**
   * Génère une clé de cache basée sur le timestamp
   */
  private getCacheKey(): string {
    const now = Date.now();
    return Math.floor(now / this.cacheExpiry).toString();
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
Difficulté: ${doc.metadata.difficulty || 'Non spécifiée'}
Score de pertinence: ${((doc as any).similarityScore ? (doc as any).similarityScore * 100 : 0).toFixed(1)}%
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

  /**
   * Vide le cache des documents
   */
  clearCache(): void {
    this.documentCache.clear();
  }

  /**
   * Met à jour le cache des documents
   */
  async refreshCache(): Promise<void> {
    this.clearCache();
    // Forcer la régénération du cache au prochain appel
    const cacheKey = this.getCacheKey();
    this.documentCache.delete(cacheKey);
  }
}
