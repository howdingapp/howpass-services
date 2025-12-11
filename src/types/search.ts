/**
 * Type pour un chunk de situation utilisé dans les recherches
 */
export type SituationChunk = string;

/**
 * Type pour les scores de similarité
 */
export interface SimilarityScore {
  similarity: number;
  bm25Similarity: number | null;
  vectorSimilarity: number | null;
}

/**
 * Type pour les informations de match (optionnel)
 */
export interface MatchInfo {
  typicalSituations?: any;
  chunkId?: string | null;
  chunkText?: string | null;
}

/**
 * Type pour une pratique dans les résultats de recherche
 */
export interface PracticeSearchResult {
  type: 'practice';
  id: string;
  title: string;
  shortDescription?: string;
  longDescription?: string;
  benefits?: any;
  relevanceScore: number;
  similarity: number;
  vectorSimilarity: number | null;
  bm25Similarity: number | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryDescription?: string | null;
  familyId?: string | null;
  familyName?: string | null;
  familyDescription?: string | null;
  matchCount?: number;
  chunks?: string[];
  matchScores?: SimilarityScore[];
  typicalSituations?: any;
  chunkId?: string | null;
  chunkText?: string | null;
}

/**
 * Type pour une activité dans les résultats de recherche
 */
export interface ActivitySearchResult {
  type: 'activity';
  id: string;
  title: string;
  shortDescription?: string;
  longDescription?: string;
  durationMinutes?: number;
  participants?: number;
  rating?: number;
  price?: number;
  benefits?: any;
  locationType?: string;
  address?: any;
  selectedKeywords?: any;
  creatorId?: string | null;
  relevanceScore: number;
  similarity: number;
  vectorSimilarity: number | null;
  bm25Similarity: number | null;
  practiceId?: string | null;
  practiceTitle?: string | null;
  practiceShortDescription?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryDescription?: string | null;
  familyId?: string | null;
  familyName?: string | null;
  familyDescription?: string | null;
  matchCount?: number;
  chunks?: string[];
  matchScores?: SimilarityScore[];
  typicalSituations?: any;
  chunkId?: string | null;
  chunkText?: string | null;
}

/**
 * Type pour une spécialité d'un hower angel
 */
export interface HowerAngelSpecialty {
  id: string;
  title: string;
  shortDescription?: string;
}

/**
 * Type pour une activité d'un hower angel
 */
export interface HowerAngelActivity {
  id: string;
  title: string;
  shortDescription?: string;
  longDescription?: string;
  durationMinutes?: number;
  participants?: number;
  rating?: number;
  price?: number;
  benefits?: any;
  locationType?: string;
  address?: any;
  selectedKeywords?: any;
  presentationImagePublicUrl?: string;
  presentationVideoPublicUrl?: string;
  status?: string;
  isActive?: boolean;
}

/**
 * Type pour un hower angel dans les résultats de recherche
 */
export interface HowerAngelSearchResult {
  id: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  specialties?: HowerAngelSpecialty[];
  experience?: string;
  profile?: string;
  activities?: HowerAngelActivity[];
  relevanceScore: number;
  similarity: number;
  vectorSimilarity?: number | null;
  bm25Similarity?: number | null;
  matchCount?: number;
  chunks?: string[];
  matchScores?: SimilarityScore[];
  typicalSituations?: any;
  chunkId?: string | null;
  chunkText?: string | null;
}

/**
 * Type de retour pour searchPracticesBySituationChunks
 */
export interface SearchPracticesBySituationChunksResponse {
  results: PracticeSearchResult[];
  searchTerm: string;
  total: number;
}

/**
 * Type de retour pour searchActivitiesBySituationChunks
 */
export interface SearchActivitiesBySituationChunksResponse {
  results: ActivitySearchResult[];
  searchTerm: string;
  total: number;
}

/**
 * Type de retour pour searchHowerAngelsByUserSituation
 */
export interface SearchHowerAngelsByUserSituationResponse {
  success: boolean;
  data?: HowerAngelSearchResult[];
  searchTerm: string;
  total: number;
  error?: string;
}

