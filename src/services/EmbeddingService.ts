import OpenAI from 'openai';

/**
 * Service pour générer des embeddings vectoriels à partir de texte
 */
export class EmbeddingService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env["OPENAI_API_KEY"],
    });
  }

  /**
   * Génère un embedding vectoriel pour un texte donné
   * @param text Le texte à convertir en vecteur
   * @returns Un vecteur d'embedding de dimension 1536
   */
  async generateEmbedding(text: string): Promise<number[] | undefined > {
    try {
      console.log(`🔄 Génération d'embedding pour: "${text.substring(0, 100)}..."`);
      
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small', // Modèle recommandé pour les embeddings
        input: text,
        encoding_format: 'float',
      });

      const embedding = response.data[0]?.embedding;
      console.log(`✅ Embedding généré avec succès (dimension: ${embedding?.length})`);
      
      return embedding;
    } catch (error) {
      console.error('❌ Erreur lors de la génération d\'embedding:', error);
      throw new Error(`Impossible de générer l'embedding: ${error}`);
    }
  }

  /**
   * Génère des embeddings pour plusieurs textes en batch
   * @param texts Tableau de textes à convertir
   * @returns Tableau de vecteurs d'embeddings
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      console.log(`🔄 Génération d'embeddings en batch pour ${texts.length} textes`);
      
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
        encoding_format: 'float',
      });

      const embeddings = response.data.map(item => item.embedding);
      console.log(`✅ ${embeddings.length} embeddings générés avec succès`);
      
      return embeddings;
    } catch (error) {
      console.error('❌ Erreur lors de la génération d\'embeddings en batch:', error);
      throw new Error(`Impossible de générer les embeddings: ${error}`);
    }
  }

}
