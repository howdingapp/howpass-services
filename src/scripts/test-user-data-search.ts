#!/usr/bin/env node

import dotenv from 'dotenv';
import { SupabaseService } from '../services/SupabaseService';
import path from 'path';
import fs from 'fs-extra';

// Charger les variables d'environnement
// Charger d'abord .env, puis .env.local (qui override .env)
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface UserDataResult {
  id: string;
  similarity: number;
  vectorSimilarity: number | null;
  bm25Similarity: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  user_id: string | null;
  data_folder: string | null;
  summary: string | null;
}

class UserDataVectorSearchTester {
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
   * Recherche de user_data avec une phrase en français et retourne les résultats formatés
   */
  async searchUserDataWithDetails(searchTerm: string, limit: number = 10): Promise<UserDataResult[]> {
    try {
      // Recherche vectorielle avec withMatchInfos pour récupérer typical_situations
      const searchResult = await this.supabaseService.searchHowerAngelsByUserSituation(
        [searchTerm],
        limit,
        true // withMatchInfos = true pour récupérer typicalSituations
      );

      if (!searchResult.success || !searchResult.data || searchResult.data.length === 0) {
        return [];
      }

      // Mapper les résultats au format attendu
      const formattedResults: UserDataResult[] = searchResult.data
        .map((user: any) => ({
          id: user.id,
          similarity: user.relevanceScore || 0,
          vectorSimilarity: user.vectorSimilarity ?? null,
          bm25Similarity: user.bm25Similarity ?? null,
          first_name: user.firstName || null,
          last_name: user.lastName || null,
          email: user.email || null,
          user_id: user.userId || null,
          data_folder: null, // Non disponible dans searchHowerAngelsByUserSituation
          summary: null // Non disponible dans searchHowerAngelsByUserSituation
        }));

      return formattedResults;
    } catch (error: any) {
      console.error(`❌ Erreur lors de la recherche: ${error.message}`);
      return [];
    }
  }

  /**
   * Affiche les résultats d'une recherche au format demandé
   */
  displayResults(searchTerm: string, results: UserDataResult[], index: number): void {
    console.log(`\n${'='.repeat(100)}`);
    console.log(`Test ${index + 1}: "${searchTerm}"`);
    console.log('='.repeat(100));

    if (results.length === 0) {
      console.log('⚠️  Aucun résultat trouvé\n');
      return;
    }

    console.log(`\n📊 Top ${results.length} user_data trouvés :\n`);

    results.forEach((userData, rank) => {
      const percentage = (userData.similarity * 100).toFixed(1);
      const vectorPct = userData.vectorSimilarity !== null ? (userData.vectorSimilarity * 100).toFixed(1) : 'N/A';
      const bm25Pct = userData.bm25Similarity !== null ? (userData.bm25Similarity * 100).toFixed(1) : 'N/A';
      const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || 'Nom non renseigné';
      console.log(`${rank + 1}. ${fullName}`);
      console.log(`   Score RRF (fusionné): ${percentage}%`);
      console.log(`   Similarité vectorielle: ${vectorPct}%`);
      console.log(`   Similarité BM25: ${bm25Pct}%`);
      console.log(`   ID: ${userData.id}`);
      console.log(`   User ID: ${userData.user_id || 'Non renseigné'}`);
      console.log(`   Email: ${userData.email || 'Non renseigné'}`);
      console.log(`   Data Folder: ${userData.data_folder || 'Non renseigné'}`);
      console.log(`   Summary: ${userData.summary ? userData.summary.substring(0, 100) + '...' : 'Non renseigné'}`);
      console.log('');
    });
  }

  /**
   * Formate les résultats pour l'écriture dans un fichier
   */
  formatResultsForFile(allResults: Array<{ searchTerm: string; results: UserDataResult[]; duration: number }>): string {
    let content = '';
    
    content += '='.repeat(100) + '\n';
    content += 'RÉSULTATS DES TESTS DE SIMILARITÉ VECTORIELLE - USER_DATA\n';
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

      content += `📊 Top ${testResult.results.length} user_data trouvés :\n\n`;

      testResult.results.forEach((userData, rank) => {
        const percentage = (userData.similarity * 100).toFixed(1);
        const vectorPct = userData.vectorSimilarity !== null ? (userData.vectorSimilarity * 100).toFixed(1) : 'N/A';
        const bm25Pct = userData.bm25Similarity !== null ? (userData.bm25Similarity * 100).toFixed(1) : 'N/A';
        const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || 'Nom non renseigné';
        content += `${rank + 1}. ${fullName}\n`;
        content += `   Score RRF (fusionné): ${percentage}%\n`;
        content += `   Similarité vectorielle: ${vectorPct}%\n`;
        content += `   Similarité BM25: ${bm25Pct}%\n`;
        content += `   ID: ${userData.id}\n`;
        content += `   User ID: ${userData.user_id || 'Non renseigné'}\n`;
        content += `   Email: ${userData.email || 'Non renseigné'}\n`;
        content += `   Data Folder: ${userData.data_folder || 'Non renseigné'}\n`;
        content += `   Summary: ${userData.summary ? userData.summary.substring(0, 200) + '...' : 'Non renseigné'}\n`;
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
  async writeResultsToFile(allResults: Array<{ searchTerm: string; results: UserDataResult[]; duration: number }>): Promise<string> {
    const outputDir = 'C:\\Users\\veloc\\Documents\\Travail\\Julie-Vogt\\Tech data\\similatity_tests';
    
    // Créer le répertoire s'il n'existe pas
    await fs.ensureDir(outputDir);

    // Générer un nom de fichier avec horodatage
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const fileName = `user_data_similarity_test_${timestamp}.txt`;
    const filePath = path.join(outputDir, fileName);

    // Formater et écrire le contenu
    const content = this.formatResultsForFile(allResults);
    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * Exécute une série de tests sur toutes les phrases
   */
  async runBatchTests(searchTerms: string[], limit: number = 10): Promise<void> {
    console.log(`🚀 Démarrage de ${searchTerms.length} tests en série...\n`);
    console.log(`📊 Limite: ${limit} user_data par test\n`);

    const allResults: Array<{ searchTerm: string; results: UserDataResult[]; duration: number }> = [];

    for (let i = 0; i < searchTerms.length; i++) {
      const searchTerm = searchTerms[i];
      if (!searchTerm) {
        continue;
      }
      
      const startTime = Date.now();
      console.log(`\n⏳ Test ${i + 1}/${searchTerms.length} en cours...`);
      
      const results = await this.searchUserDataWithDetails(searchTerm, limit);
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
  const tester = new UserDataVectorSearchTester();

  // Recherche sémantique pour le chunk "informations sur Patricia DORFFER"
  const searchTerms = [
    "dos"
  ];

  const limit = 10; // Top 10 user_data par test

  await tester.runBatchTests(searchTerms, limit);
}

// Gestion des erreurs
main().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

