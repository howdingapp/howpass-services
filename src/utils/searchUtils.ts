/**
 * Interface pour les scores de similarité d'un résultat de recherche
 */
export interface SimilarityScores {
  id: string;
  similarity?: number;
  vectorSimilarity?: number | null;
  bm25Similarity?: number | null;
  relevanceScore?: number; // Alias pour similarity
}

/**
 * Interface pour les résultats avec matchCount
 */
export interface SearchResultWithMatchCount extends SimilarityScores {
  matchCount?: number;
}

/**
 * Fonction de comparaison pour le classement sophistiqué des résultats de recherche
 * 
 * Algorithme :
 * 1. Si r1.similarity > r2.similarity, alors r1 vient avant r2 (retourne -1)
 * 2. Si r1.similarity < r2.similarity, alors r1 vient après r2 (retourne 1)
 * 3. Si r1.similarity === r2.similarity, on regarde d'où vient l'égalité :
 *    - Si l'égalité vient du vectoriel (vector_similarity >= bm25_co_score), 
 *      alors on classe par bm25_co_score (le plus grand vient en premier)
 *    - Si l'égalité vient du BM25 (bm25_co_score > vector_similarity),
 *      alors on classe par vector_similarity (le plus grand vient en premier)
 * 
 * @param similarity1 Score de similarité du premier résultat
 * @param vectorSimilarity1 Score vectoriel du premier résultat
 * @param bm25CoScore1 Score BM25 co-score du premier résultat
 * @param similarity2 Score de similarité du deuxième résultat
 * @param vectorSimilarity2 Score vectoriel du deuxième résultat
 * @param bm25CoScore2 Score BM25 co-score du deuxième résultat
 * @returns -1 si r1 vient avant r2, 1 si r1 vient après r2, 0 si égalité
 */
export function compareSearchResults(
  similarity1: number,
  vectorSimilarity1: number | null,
  bm25CoScore1: number | null,
  similarity2: number,
  vectorSimilarity2: number | null,
  bm25CoScore2: number | null
): number {
  // 1. Comparaison principale par similarity
  if (similarity1 > similarity2) {
    return -1; // r1 vient avant r2
  }
  if (similarity1 < similarity2) {
    return 1; // r1 vient après r2
  }

  // 2. Égalité de similarity : déterminer d'où vient l'égalité et classer par la méthode alternative
  const v1 = vectorSimilarity1 ?? 0;
  const b1 = bm25CoScore1 ?? 0;
  const v2 = vectorSimilarity2 ?? 0;
  const b2 = bm25CoScore2 ?? 0;

  // Si l'égalité vient du vectoriel (vector_similarity >= bm25_co_score)
  // alors on classe par BM25 en secondaire
  if (v1 >= b1 && v2 >= b2) {
    // Les deux viennent du vectoriel, classer par BM25
    if (b1 > b2) return -1;
    if (b1 < b2) return 1;
    return 0;
  } else if (v1 >= b1) {
    // r1 vient du vectoriel, r2 vient du BM25
    // r2 a un meilleur score BM25 que r1, donc r2 vient avant
    return 1;
  } else if (v2 >= b2) {
    // r2 vient du vectoriel, r1 vient du BM25
    // r1 a un meilleur score BM25 que r2, donc r1 vient avant
    return -1;
  } else {
    // Les deux viennent du BM25, classer par vectoriel
    if (v1 > v2) return -1;
    if (v1 < v2) return 1;
    return 0;
  }
}

/**
 * Fonction de tri pour les résultats de recherche avec scores de similarité et matchCount
 * 
 * Algorithme de tri :
 * 1. D'abord par matchCount décroissant (le plus grand matchCount vient en premier)
 * 2. Si matchCount est égal, alors on utilise la similarité avec compareSearchResults
 * 
 * @param results Tableau de résultats avec scores de similarité et matchCount
 * @returns Tableau trié
 */
export function sortSearchResultsBySimilarity<T extends SearchResultWithMatchCount>(
  results: T[]
): T[] {
  return results.sort((a, b) => {
    // 1. Comparaison par matchCount (décroissant)
    const matchCountA = a.matchCount || 0;
    const matchCountB = b.matchCount || 0;
    
    if (matchCountA > matchCountB) {
      return -1; // a vient avant b
    }
    if (matchCountA < matchCountB) {
      return 1; // a vient après b
    }

    return compareSearchResults(
      a.similarity!,
      a.vectorSimilarity ?? null,
      a.bm25Similarity ?? null, // Utiliser bm25Similarity comme bm25_co_score
      b.similarity!,
      b.vectorSimilarity ?? null,
      b.bm25Similarity ?? null
    );
  });
}

