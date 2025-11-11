import OpenAI from 'openai';
import { SupabaseService } from './SupabaseService';

/**
 * Service pour générer des embeddings vectoriels à partir de texte
 */
export class EmbeddingService {
  private openai: OpenAI;
  private supabaseService: SupabaseService;

  constructor(supabaseService?: SupabaseService) {
    this.openai = new OpenAI({
      apiKey: process.env["OPENAI_API_KEY"],
    });
    this.supabaseService = supabaseService || new SupabaseService();
  }

  /**
   * Génère un embedding vectoriel pour un texte donné
   * Vérifie d'abord dans user_search avant d'appeler OpenAI
   * @param text Le texte à convertir en vecteur
   * @returns Un vecteur d'embedding de dimension 1536
   */
  async generateEmbedding(text: string): Promise<number[] | undefined > {
    try {
      // Vérifier d'abord si un embedding existe déjà dans user_search
      const existingRecord = await this.supabaseService.findEmbeddingByText(text);
      
      if (existingRecord && existingRecord.vector) {
        console.log(`✅ Embedding trouvé dans le cache user_search pour: "${text.substring(0, 100)}..."`);
        return existingRecord.vector;
      }

      // Si aucun embedding n'existe, générer un nouveau via OpenAI
      console.log(`🔄 Génération d'embedding pour: "${text.substring(0, 100)}..."`);
      
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small', // Modèle recommandé pour les embeddings
        input: text,
        encoding_format: 'float',
      });

      const embedding = response.data[0]?.embedding;
      
      if (!embedding) {
        throw new Error('Aucun embedding généré par OpenAI');
      }
      
      console.log(`✅ Embedding généré avec succès (dimension: ${embedding.length})`);
      
      // Sauvegarder l'embedding dans user_search pour les prochaines fois
      await this.supabaseService.upsertEmbedding(text, embedding);
      console.log(`✅ Embedding sauvegardé dans user_search`);
      
      return embedding;
    } catch (error) {
      console.error('❌ Erreur lors de la génération d\'embedding:', error);
      throw new Error(`Impossible de générer l'embedding: ${error}`);
    }
  }

  /**
   * Génère des embeddings pour plusieurs textes en batch
   * Vérifie d'abord dans user_search pour chaque texte avant d'appeler OpenAI
   * @param texts Tableau de textes à convertir
   * @returns Tableau de vecteurs d'embeddings
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      console.log(`🔄 Génération d'embeddings en batch pour ${texts.length} textes`);
      
      const embeddings: number[][] = [];
      const textsToGenerate: { text: string; index: number }[] = [];
      
      // Vérifier d'abord quels textes ont déjà un embedding
      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        
        if (!text) {
          console.warn(`⚠️ Texte vide à l'index ${i}, ignoré`);
          continue;
        }
        
        const existingRecord = await this.supabaseService.findEmbeddingByText(text);
        
        if (existingRecord && existingRecord.vector) {
          embeddings[i] = existingRecord.vector;
        } else {
          textsToGenerate.push({ text, index: i });
        }
      }
      
      // Générer les embeddings manquants en batch
      if (textsToGenerate.length > 0) {
        const textsToProcess = textsToGenerate.map(item => item.text);
        
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: textsToProcess,
          encoding_format: 'float',
        });

        // Sauvegarder les nouveaux embeddings et les ajouter au tableau
        for (let i = 0; i < response.data.length; i++) {
          const dataItem = response.data[i];
          const textItem = textsToGenerate[i];
          
          if (!dataItem || !textItem) {
            console.warn(`⚠️ Données manquantes à l'index ${i}, ignoré`);
            continue;
          }
          
          const embedding = dataItem.embedding;
          const { text, index } = textItem;
          
          if (!embedding) {
            console.warn(`⚠️ Embedding manquant pour le texte à l'index ${i}, ignoré`);
            continue;
          }
          
          embeddings[index] = embedding;
          
          // Sauvegarder dans user_search
          await this.supabaseService.upsertEmbedding(text, embedding);
        }
        
        console.log(`✅ ${textsToGenerate.length} nouveaux embeddings générés et sauvegardés`);
      }
      
      console.log(`✅ ${embeddings.length} embeddings au total (${textsToGenerate.length} nouveaux, ${texts.length - textsToGenerate.length} depuis le cache)`);
      
      return embeddings;
    } catch (error) {
      console.error('❌ Erreur lors de la génération d\'embeddings en batch:', error);
      throw new Error(`Impossible de générer les embeddings: ${error}`);
    }
  }

}
