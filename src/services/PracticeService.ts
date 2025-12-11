import { PracticeSearchResult, HowerAngelSearchResult } from '../types/search';
import { DistanceResult } from './GeolocationService';
import { HowerAngelWithDistance } from './HowerAngelService';

/**
 * Service pour calculer les distances des pratiques
 */
export class PracticeService {
  constructor() {
    // Pas besoin de GeolocationService car on utilise les distances déjà calculées des hower angels
  }

  /**
   * Détermine si une pratique devrait avoir une distance explicable
   * @param practice Pratique à vérifier
   * @param howerAngels Liste des hower angels avec distances (optionnel) pour trouver ceux qui proposent cette pratique
   * @returns true si la pratique devrait avoir une distance, false sinon
   */
  haveExplanableDistance(
    practice: PracticeSearchResult,
    howerAngels?: Array<HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult }>
  ): boolean {
    // Si on n'a pas de hower angels, on ne peut pas déterminer
    if (!howerAngels || howerAngels.length === 0) {
      return false;
    }

    // Trouver tous les hower angels qui proposent cette pratique (via leurs spécialités)
    const howerAngelsWithPractice = howerAngels.filter(howerAngel => {
      if (!howerAngel.specialties || howerAngel.specialties.length === 0) {
        return false;
      }
      // Vérifier si une spécialité correspond à la pratique
      return howerAngel.specialties.some(specialty => specialty.id === practice.id);
    });

    // Si aucun hower angel ne propose cette pratique, c'est normal qu'il n'y ait pas de distance
    if (howerAngelsWithPractice.length === 0) {
      return false;
    }

    // Si au moins un hower angel qui propose cette pratique a une distance, la pratique devrait en avoir une
    return howerAngelsWithPractice.some(ha => ha.distanceFromOrigin !== undefined);
  }

  /**
   * Calcule la distance la plus courte d'une pratique en trouvant les hower angels qui la proposent
   * @param practiceId ID de la pratique
   * @param howerAngels Liste des hower angels avec distances (doivent avoir été calculées)
   * @returns Distance la plus courte ou null si aucun hower angel ne propose cette pratique
   */
  getShortestDistanceForPractice(
    practiceId: string,
    howerAngels: HowerAngelWithDistance[]
  ): DistanceResult | null {
    console.log(`[PracticeService] getShortestDistanceForPractice - Début pour pratique ${practiceId}`, {
      howerAngelsCount: howerAngels.length,
      howerAngelsWithDistance: howerAngels.filter(ha => ha.distanceFromOrigin).length
    });
    
    // Trouver tous les hower angels qui proposent cette pratique (via leurs spécialités)
    const howerAngelsWithPractice = howerAngels.filter(howerAngel => {
      if (!howerAngel.specialties || howerAngel.specialties.length === 0) {
        return false;
      }
      // Vérifier si une spécialité correspond à la pratique
      return howerAngel.specialties.some(specialty => specialty.id === practiceId);
    });

    console.log(`[PracticeService] getShortestDistanceForPractice - Hower angels avec pratique ${practiceId}:`, {
      count: howerAngelsWithPractice.length,
      howerAngelsIds: howerAngelsWithPractice.map(ha => ha.id),
      howerAngelsWithDistance: howerAngelsWithPractice.filter(ha => ha.distanceFromOrigin).map(ha => ({
        id: ha.id,
        distance: ha.distanceFromOrigin?.distance
      }))
    });
    
    if (howerAngelsWithPractice.length === 0) {
      console.warn(`[PracticeService] getShortestDistanceForPractice - Aucun hower angel ne propose la pratique ${practiceId}`);
      return null;
    }

    // Trouver la distance la plus courte
    let shortestDistance: DistanceResult | null = null;
    let minDistance = Infinity;

    for (const howerAngel of howerAngelsWithPractice) {
      if (howerAngel.distanceFromOrigin && howerAngel.distanceFromOrigin.distance < minDistance) {
        minDistance = howerAngel.distanceFromOrigin.distance;
        shortestDistance = howerAngel.distanceFromOrigin;
      }
    }

    console.log(`[PracticeService] getShortestDistanceForPractice - Distance la plus courte pour pratique ${practiceId}:`, {
      hasDistance: !!shortestDistance,
      distance: shortestDistance
    });
    
    return shortestDistance;
  }

  /**
   * Associe les distances aux pratiques en trouvant les hower angels qui les proposent
   * @param practices Liste des pratiques
   * @param howerAngels Liste des hower angels avec distances (doivent avoir été calculées)
   * @returns Liste des pratiques avec leurs distances (distance la plus courte)
   */
  associateDistancesToPractices(
    practices: PracticeSearchResult[],
    howerAngels: HowerAngelWithDistance[]
  ): Array<PracticeSearchResult & { distanceFromOrigin?: DistanceResult }> {
    return practices.map(practice => {
      const distance = this.getShortestDistanceForPractice(practice.id, howerAngels);
      return {
        ...practice,
        ...(distance && { distanceFromOrigin: distance })
      };
    });
  }
}

