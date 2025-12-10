import { PracticeSearchResult } from '../types/search';
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
   * Calcule la distance la plus courte d'une pratique en trouvant les hower angels qui la proposent
   * @param practiceId ID de la pratique
   * @param howerAngels Liste des hower angels avec distances (doivent avoir été calculées)
   * @returns Distance la plus courte ou null si aucun hower angel ne propose cette pratique
   */
  getShortestDistanceForPractice(
    practiceId: string,
    howerAngels: HowerAngelWithDistance[]
  ): DistanceResult | null {
    // Trouver tous les hower angels qui proposent cette pratique (via leurs spécialités)
    const howerAngelsWithPractice = howerAngels.filter(howerAngel => {
      if (!howerAngel.specialties || howerAngel.specialties.length === 0) {
        return false;
      }
      // Vérifier si une spécialité correspond à la pratique
      return howerAngel.specialties.some(specialty => specialty.id === practiceId);
    });

    if (howerAngelsWithPractice.length === 0) {
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

