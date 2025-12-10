import { HowerAngelSearchResult, PracticeSearchResult } from '../types/search';
import { GeolocationService, GeolocationPosition, DistanceResult } from './GeolocationService';

// Réexport pour compatibilité
export type { GeolocationPosition, DistanceResult } from './GeolocationService';

/**
 * Interface pour un hower angel avec distance
 */
export interface HowerAngelWithDistance extends HowerAngelSearchResult {
  distanceFromOrigin?: DistanceResult;
  coordinates?: GeolocationPosition;
}

/**
 * Service pour calculer les distances des hower angels
 */
export class HowerAngelService {
  private geolocationService: GeolocationService;

  constructor() {
    this.geolocationService = new GeolocationService();
  }

  /**
   * Calcule les distances pour une liste de destinations depuis une origine
   * Utilise uniquement la formule de Haversine (distance à vol d'oiseau)
   */
  private async calculateMultipleDistances(
    origin: GeolocationPosition,
    destinations: GeolocationPosition[]
  ): Promise<Array<{ destination: GeolocationPosition; result: DistanceResult }>> {
    const results = [];

    for (const destination of destinations) {
      // Utiliser getDistanceFrom depuis GeolocationService
      const result = this.geolocationService.getDistanceFrom(origin, destination);
      results.push({ destination, result });
    }

    return results;
  }


  /**
   * Extrait les coordonnées GPS depuis un hower angel
   * Les coordonnées peuvent être dans différentes structures selon la source des données
   */
  private extractCoordinates(howerAngel: HowerAngelSearchResult): GeolocationPosition | null {
    // Essayer différentes sources de coordonnées
    // 1. Depuis les activités (si une activité a des coordonnées)
    if (howerAngel.activities && howerAngel.activities.length > 0) {
      for (const activity of howerAngel.activities) {
        if (activity.address) {
          // Si l'adresse contient des coordonnées GPS
          if (typeof activity.address === 'object') {
            if (activity.address.latitude && activity.address.longitude) {
              return {
                lat: activity.address.latitude,
                lng: activity.address.longitude
              };
            }
            // Si l'adresse contient gpsLocation
            if (activity.address.gpsLocation) {
              const gps = activity.address.gpsLocation;
              if (gps.lat && gps.lng) {
                return { lat: gps.lat, lng: gps.lng };
              }
              if (gps.latitude && gps.longitude) {
                return { lat: gps.latitude, lng: gps.longitude };
              }
            }
          }
        }
      }
    }

    // 2. Depuis les données brutes (si disponibles dans les métadonnées)
    // Les données peuvent contenir gps_location depuis open_map_data
    const rawData = (howerAngel as any).rawData;
    if (rawData) {
      if (rawData.gps_location) {
        const gps = rawData.gps_location;
        if (gps.lat && gps.lng) {
          return { lat: gps.lat, lng: gps.lng };
        }
        if (gps.latitude && gps.longitude) {
          return { lat: gps.latitude, lng: gps.longitude };
        }
      }
    }
    
    return null;
  }

  /**
   * Récupère les coordonnées GPS depuis open_map_data pour un user_data_id
   * @param userDataId ID du user_data
   * @param supabaseClient Client Supabase
   * @returns Coordonnées GPS ou null
   */
  async getCoordinatesFromOpenMapData(
    userDataId: string,
    supabaseClient: any
  ): Promise<GeolocationPosition | null> {
    try {
      const { data, error } = await supabaseClient
        .from('open_map_data')
        .select('gps_location')
        .eq('user_data_id', userDataId)
        .single();

      if (error || !data) {
        return null;
      }

      const gpsLocation = data.gps_location;
      if (!gpsLocation) {
        return null;
      }

      // Gérer différents formats de gps_location
      if (gpsLocation.lat && gpsLocation.lng) {
        return { lat: gpsLocation.lat, lng: gpsLocation.lng };
      }
      if (gpsLocation.latitude && gpsLocation.longitude) {
        return { lat: gpsLocation.latitude, lng: gpsLocation.longitude };
      }

      return null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des coordonnées depuis open_map_data:', error);
      return null;
    }
  }

  /**
   * Associe à une liste de hower angels une distance à une adresse
   * @param howerAngels Liste des hower angels
   * @param address Adresse d'origine (string)
   * @param supabaseClient Client Supabase optionnel pour le cache de géocodage et récupération des coordonnées
   * @returns Liste des hower angels avec leurs distances
   */
  async associateDistancesFromAddress(
    howerAngels: HowerAngelSearchResult[],
    address: string,
    supabaseClient?: any
  ): Promise<HowerAngelWithDistance[]> {
    try {
      // 1. Géocoder l'adresse en coordonnées GPS
      const originCoordinates = await this.geolocationService.geocodeAddress(address, supabaseClient);
      
      if (!originCoordinates) {
        console.warn('⚠️ Impossible de géocoder l\'adresse, retour des hower angels sans distance');
        return howerAngels.map(ha => ({ ...ha }));
      }

      // 2. Extraire les coordonnées de chaque hower angel
      const howerAngelsWithCoords: Array<{ howerAngel: HowerAngelSearchResult; coordinates: GeolocationPosition }> = [];
      
      for (const howerAngel of howerAngels) {
        // Essayer d'abord d'extraire depuis les données du hower angel
        let coordinates = this.extractCoordinates(howerAngel);
        
        // Si pas trouvé et qu'on a un supabaseClient, essayer de récupérer depuis open_map_data
        if (!coordinates && supabaseClient && howerAngel.id) {
          coordinates = await this.getCoordinatesFromOpenMapData(howerAngel.id, supabaseClient);
        }
        
        if (coordinates) {
          howerAngelsWithCoords.push({ howerAngel, coordinates });
        }
      }

      if (howerAngelsWithCoords.length === 0) {
        console.warn('⚠️ Aucun hower angel avec coordonnées trouvé');
        return howerAngels.map(ha => ({ ...ha }));
      }

      // 3. Calculer les distances
      const destinations = howerAngelsWithCoords.map(item => item.coordinates);
      const distanceResults = await this.calculateMultipleDistances(originCoordinates, destinations);

      // 4. Associer les distances aux hower angels
      const result: HowerAngelWithDistance[] = howerAngels.map(howerAngel => {
        const coordsIndex = howerAngelsWithCoords.findIndex(item => item.howerAngel.id === howerAngel.id);
        
        if (coordsIndex >= 0 && coordsIndex < distanceResults.length) {
          const distanceResult = distanceResults[coordsIndex];
          if (distanceResult) {
            return {
              ...howerAngel,
              distanceFromOrigin: distanceResult.result,
              coordinates: distanceResult.destination
            };
          }
        }
        
        return { ...howerAngel };
      });

      // 5. Trier par distance croissante
      return result.sort((a, b) => {
        const distanceA = a.distanceFromOrigin?.distance || Infinity;
        const distanceB = b.distanceFromOrigin?.distance || Infinity;
        return distanceA - distanceB;
      });

    } catch (error) {
      console.error('❌ Erreur lors de l\'association des distances depuis l\'adresse:', error);
      return howerAngels.map(ha => ({ ...ha }));
    }
  }

  /**
   * Associe à une liste de hower angels une distance à une coordonnée GPS
   * @param howerAngels Liste des hower angels
   * @param coordinates Coordonnées GPS d'origine
   * @param supabaseClient Client Supabase optionnel pour récupérer les coordonnées depuis open_map_data
   * @returns Liste des hower angels avec leurs distances
   */
  async associateDistancesFromCoordinates(
    howerAngels: HowerAngelSearchResult[],
    coordinates: GeolocationPosition,
    supabaseClient?: any
  ): Promise<HowerAngelWithDistance[]> {
    try {
      // 1. Extraire les coordonnées de chaque hower angel
      const howerAngelsWithCoords: Array<{ howerAngel: HowerAngelSearchResult; coordinates: GeolocationPosition }> = [];
      
      for (const howerAngel of howerAngels) {
        // Essayer d'abord d'extraire depuis les données du hower angel
        let coords = this.extractCoordinates(howerAngel);
        
        // Si pas trouvé et qu'on a un supabaseClient, essayer de récupérer depuis open_map_data
        if (!coords && supabaseClient && howerAngel.id) {
          coords = await this.getCoordinatesFromOpenMapData(howerAngel.id, supabaseClient);
        }
        
        if (coords) {
          howerAngelsWithCoords.push({ howerAngel, coordinates: coords });
        }
      }

      if (howerAngelsWithCoords.length === 0) {
        console.warn('⚠️ Aucun hower angel avec coordonnées trouvé');
        return howerAngels.map(ha => ({ ...ha }));
      }

      // 2. Calculer les distances
      const destinations = howerAngelsWithCoords.map(item => item.coordinates);
      const distanceResults = await this.calculateMultipleDistances(coordinates, destinations);

      // 3. Associer les distances aux hower angels
      const result: HowerAngelWithDistance[] = howerAngels.map(howerAngel => {
        const coordsIndex = howerAngelsWithCoords.findIndex(item => item.howerAngel.id === howerAngel.id);
        
        if (coordsIndex >= 0 && coordsIndex < distanceResults.length) {
          const distanceResult = distanceResults[coordsIndex];
          if (distanceResult) {
            return {
              ...howerAngel,
              distanceFromOrigin: distanceResult.result,
              coordinates: distanceResult.destination
            };
          }
        }
        
        return { ...howerAngel };
      });

      // 4. Trier par distance croissante
      return result.sort((a, b) => {
        const distanceA = a.distanceFromOrigin?.distance || Infinity;
        const distanceB = b.distanceFromOrigin?.distance || Infinity;
        return distanceA - distanceB;
      });

    } catch (error) {
      console.error('❌ Erreur lors de l\'association des distances depuis les coordonnées:', error);
      return howerAngels.map(ha => ({ ...ha }));
    }
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

