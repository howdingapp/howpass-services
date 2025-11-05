#!/usr/bin/env node

import dotenv from 'dotenv';
import { SupabaseService } from '../services/SupabaseService';
import path from 'path';
import fs from 'fs-extra';

// Charger les variables d'environnement
// Charger d'abord .env, puis .env.local (qui override .env)
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface PracticeResult {
  id: string;
  similarity: number;
  title: string;
  typical_situation: string | null;
}

class VectorSearchTester {
  private supabaseService: SupabaseService;

  constructor() {
    try {
      this.supabaseService = new SupabaseService();
      console.log('✅ SupabaseService initialisé avec succès\n');
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation de SupabaseService:', error);
      process.exit(1);
    }
  }

  /**
   * Récupère les données complètes des pratiques (incluant typical_situation) via Supabase
   */
  async getPracticeDetails(practiceIds: string[]): Promise<Map<string, any>> {
    if (practiceIds.length === 0) {
      return new Map();
    }

    try {
      const supabase = this.supabaseService.getSupabaseClient();
      const { data, error } = await supabase
        .from('practices')
        .select('id, title, typical_situation')
        .in('id', practiceIds);

      if (error) {
        console.error('❌ Erreur lors de la récupération des détails:', error);
        return new Map();
      }

      const detailsMap = new Map();
      (data || []).forEach((practice: any) => {
        detailsMap.set(practice.id, {
          title: practice.title,
          typical_situation: practice.typical_situation
        });
      });

      return detailsMap;
    } catch (error: any) {
      console.error(`❌ Erreur lors de la récupération des détails: ${error.message}`);
      return new Map();
    }
  }

  /**
   * Recherche de pratiques avec une phrase en français et retourne les résultats formatés
   */
  async searchPracticesWithDetails(searchTerm: string, limit: number = 4): Promise<PracticeResult[]> {
    try {
      // Recherche vectorielle
      const results = await this.supabaseService.searchVectorSimilarity(
        'practices',
        'vector_summary',
        searchTerm,
        limit
      );

      if (results.length === 0) {
        return [];
      }

      // Récupérer les IDs des pratiques trouvées (filtrer les undefined)
      const practiceIds = results.map((p: any) => p.id).filter((id: any): id is string => id !== undefined && id !== null);

      // Récupérer les détails complets via Supabase
      const detailsMap = await this.getPracticeDetails(practiceIds);

      // Combiner les résultats (filtrer les pratiques sans ID)
      const formattedResults: PracticeResult[] = results
        .filter((practice: any) => practice.id)
        .map((practice: any) => {
          const details = detailsMap.get(practice.id) || {};
          return {
            id: practice.id,
            similarity: practice.similarity || 0,
            title: details.title || practice.title || 'Sans titre',
            typical_situation: details.typical_situation || null
          };
        });

      return formattedResults;
    } catch (error: any) {
      console.error(`❌ Erreur lors de la recherche: ${error.message}`);
      return [];
    }
  }

  /**
   * Affiche les résultats d'une recherche au format demandé
   */
  displayResults(searchTerm: string, results: PracticeResult[], index: number): void {
    console.log(`\n${'='.repeat(100)}`);
    console.log(`Test ${index + 1}: "${searchTerm}"`);
    console.log('='.repeat(100));

    if (results.length === 0) {
      console.log('⚠️  Aucun résultat trouvé\n');
      return;
    }

    console.log(`\n📊 Top ${results.length} pratiques trouvées :\n`);

    results.forEach((practice, rank) => {
      const percentage = (practice.similarity * 100).toFixed(1);
      console.log(`${rank + 1}. ${practice.title}`);
      console.log(`   Pourcentage: ${percentage}%`);
      console.log(`   ID: ${practice.id}`);
      console.log(`   Situation idéale: ${practice.typical_situation || 'Non renseigné'}`);
      console.log('');
    });
  }

  /**
   * Formate les résultats pour l'écriture dans un fichier
   */
  formatResultsForFile(allResults: Array<{ searchTerm: string; results: PracticeResult[]; duration: number }>): string {
    let content = '';
    
    content += '='.repeat(100) + '\n';
    content += 'RÉSULTATS DES TESTS DE SIMILARITÉ VECTORIELLE\n';
    content += '='.repeat(100) + '\n\n';
    content += `Date: ${new Date().toLocaleString('fr-FR')}\n`;
    content += `Nombre de tests: ${allResults.length}\n\n`;

    // Résultats détaillés pour chaque test
    allResults.forEach((testResult, index) => {
      content += '\n' + '='.repeat(100) + '\n';
      content += `Test ${index + 1}: "${testResult.searchTerm}"\n`;
      content += '='.repeat(100) + '\n\n';

      if (testResult.results.length === 0) {
        content += '⚠️  Aucun résultat trouvé\n\n';
        return;
      }

      content += `📊 Top ${testResult.results.length} pratiques trouvées :\n\n`;

      testResult.results.forEach((practice, rank) => {
        const percentage = (practice.similarity * 100).toFixed(1);
        content += `${rank + 1}. ${practice.title}\n`;
        content += `   Pourcentage: ${percentage}%\n`;
        content += `   ID: ${practice.id}\n`;
        content += `   Situation idéale: ${practice.typical_situation || 'Non renseigné'}\n`;
        content += '\n';
      });

      content += `⏱️  Durée: ${testResult.duration}ms\n\n`;
    });

    // Résumé final
    const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = (totalDuration / allResults.length).toFixed(0);
    const totalResults = allResults.reduce((sum, r) => sum + r.results.length, 0);

    content += '\n' + '='.repeat(100) + '\n';
    content += '📈 RÉSUMÉ DES TESTS\n';
    content += '='.repeat(100) + '\n\n';
    content += `✅ ${allResults.length} tests terminés\n\n`;
    content += `⏱️  Durée totale: ${totalDuration}ms\n`;
    content += `⏱️  Durée moyenne: ${avgDuration}ms\n`;
    content += `📊 Total de résultats: ${totalResults}\n`;
    content += `📊 Moyenne de résultats par test: ${(totalResults / allResults.length).toFixed(1)}\n`;

    return content;
  }

  /**
   * Écrit les résultats dans un fichier
   */
  async writeResultsToFile(allResults: Array<{ searchTerm: string; results: PracticeResult[]; duration: number }>): Promise<string> {
    const outputDir = 'C:\\Users\\veloc\\Documents\\Travail\\Julie-Vogt\\Tech data\\similatity_tests';
    
    // Créer le répertoire s'il n'existe pas
    await fs.ensureDir(outputDir);

    // Générer un nom de fichier avec horodatage
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const fileName = `similarity_test_${timestamp}.txt`;
    const filePath = path.join(outputDir, fileName);

    // Formater et écrire le contenu
    const content = this.formatResultsForFile(allResults);
    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * Exécute une série de tests sur toutes les phrases
   */
  async runBatchTests(searchTerms: string[], limit: number = 4): Promise<void> {
    console.log(`🚀 Démarrage de ${searchTerms.length} tests en série...\n`);
    console.log(`📊 Limite: ${limit} pratiques par test\n`);

    const allResults: Array<{ searchTerm: string; results: PracticeResult[]; duration: number }> = [];

    for (let i = 0; i < searchTerms.length; i++) {
      const searchTerm = searchTerms[i];
      if (!searchTerm) {
        continue;
      }
      
      const startTime = Date.now();
      console.log(`\n⏳ Test ${i + 1}/${searchTerms.length} en cours...`);
      
      const results = await this.searchPracticesWithDetails(searchTerm, limit);
      const duration = Date.now() - startTime;

      allResults.push({
        searchTerm,
        results,
        duration
      });

      // Afficher les résultats immédiatement
      this.displayResults(searchTerm, results, i);

      // Petite pause pour éviter de surcharger l'API
      if (i < searchTerms.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Résumé final
    console.log(`\n${'='.repeat(100)}`);
    console.log('📈 RÉSUMÉ DES TESTS');
    console.log('='.repeat(100));
    console.log(`\n✅ ${allResults.length} tests terminés\n`);

    const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = (totalDuration / allResults.length).toFixed(0);
    const totalResults = allResults.reduce((sum, r) => sum + r.results.length, 0);

    console.log(`⏱️  Durée totale: ${totalDuration}ms`);
    console.log(`⏱️  Durée moyenne: ${avgDuration}ms`);
    console.log(`📊 Total de résultats: ${totalResults}`);
    console.log(`📊 Moyenne de résultats par test: ${(totalResults / allResults.length).toFixed(1)}\n`);

    // Écrire les résultats dans un fichier
    try {
      const filePath = await this.writeResultsToFile(allResults);
      console.log(`\n💾 Résultats sauvegardés dans: ${filePath}\n`);
    } catch (error: any) {
      console.error(`\n❌ Erreur lors de l'écriture du fichier: ${error.message}\n`);
    }
  }
}

// Point d'entrée principal
async function main() {
  const tester = new VectorSearchTester();

  // Liste des phrases à tester
  const searchTerms = [
    "J'ai l'impression d'étouffer avec toutes mes émotions, je n'arrive pas à les sortir.",
    "Je sens que j'ai plein de choses enfouies en moi, et ça me pèse.",
    "Je me sens tendu tout le temps, comme si je gardais tout pour moi.",
    "J'ai besoin de trouver un moyen doux pour libérer ce que je ressens.",
    "Je suis submergé par mes émotions, ça bouffe mon énergie.",
    "J'ai plein d'émotions bloquées et ça me gâche la vie.",
    "Je ne sais pas comment accepter mes émotions, je les retiens toujours.",
    "J'aimerais réussir à lâcher prise et libérer ce que j'ai accumulé.",
    "Je sens une tension intérieure permanente, je voudrais m'en débarrasser.",
    "J'ai des émotions coincées en moi, et je ne sais pas comment les gérer.",
    "J'en peux plus, je garde tout en moi et ça me ronge.",
    "J'ai un blocage émotionnel, j'aimerais trouver quelque chose de doux pour m'aider.",
    "Je me sens surchargé d'émotions, j'arrive pas à les libérer.",
    "Tout reste coincé en moi, ça me fait trop de tension.",
    "Je voudrais apprendre à accepter ce que je ressens au lieu de tout refouler."
  ];

  const limit = 4; // Top 4 pratiques par test

  await tester.runBatchTests(searchTerms, limit);
}

// Gestion des erreurs
main().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
