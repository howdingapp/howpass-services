import { ActivitySearchResult, HowerAngelSearchResult } from '../types/search';
import { GeolocationService, GeolocationPosition, DistanceResult } from './GeolocationService';

/**
 * Service pour calculer les distances des activités
 */
export class ActivityService {
  private geolocationService: GeolocationService;

  constructor() {
    this.geolocationService = new GeolocationService();
  }

  /**
   * Extrait les coordonnées GPS depuis l'adresse d'une activité
   * @param activity Activité avec adresse
   * @returns Coordonnées GPS ou null
   */
  private extractCoordinatesFromActivity(activity: ActivitySearchResult): GeolocationPosition | null {
    if (!activity.address) {
      return null;
    }

    // Si l'adresse est un objet avec des coordonnées GPS
    if (typeof activity.address === 'object') {
      // Format 1: latitude/longitude directes
      if (activity.address.latitude && activity.address.longitude) {
        return {
          lat: activity.address.latitude,
          lng: activity.address.longitude
        };
      }

      // Format 2: gpsLocation avec lat/lng
      if (activity.address.gpsLocation) {
        const gps = activity.address.gpsLocation;
        if (gps.lat && gps.lng) {
          return { lat: gps.lat, lng: gps.lng };
        }
        if (gps.latitude && gps.longitude) {
          return { lat: gps.latitude, lng: gps.longitude };
        }
      }

      // Format 3: adresse textuelle (string dans un objet)
      if (typeof activity.address === 'object' && 'address' in activity.address && typeof activity.address.address === 'string') {
        // On retourne null car on devra géocoder l'adresse
        return null;
      }
    }

    // Si l'adresse est une string, on retourne null car on devra la géocoder
    if (typeof activity.address === 'string') {
      return null;
    }

    return null;
  }

  /**
   * Calcule la distance d'une activité depuis une origine
   * @param activity Activité avec adresse
   * @param origin Coordonnées GPS d'origine
   * @param supabaseClient Client Supabase optionnel pour le géocodage
   * @returns Distance ou null si l'adresse ne peut pas être géocodée
   */
  async getDistanceForActivity(
    activity: ActivitySearchResult,
    origin: GeolocationPosition,
    supabaseClient?: any
  ): Promise<DistanceResult | null> {
    console.log(`[ActivityService] getDistanceForActivity - Début pour activité ${activity.id}`, {
      hasAddress: !!activity.address,
      addressType: activity.address ? typeof activity.address : 'none',
      addressValue: activity.address ? (typeof activity.address === 'string' ? activity.address.substring(0, 50) : 'object') : null
    });
    
    // 1. Extraire les coordonnées depuis l'adresse de l'activité
    let activityCoordinates = this.extractCoordinatesFromActivity(activity);
    
    console.log(`[ActivityService] getDistanceForActivity - Coordonnées extraites:`, {
      activityId: activity.id,
      hasCoordinates: !!activityCoordinates,
      coordinates: activityCoordinates
    });

    // 2. Si pas de coordonnées directes, essayer de géocoder l'adresse
    if (!activityCoordinates && activity.address) {
      let addressString: string | null = null;

      // Extraire l'adresse textuelle
      if (typeof activity.address === 'string') {
        addressString = activity.address;
      } else if (typeof activity.address === 'object' && 'address' in activity.address) {
        addressString = activity.address.address as string;
      } else if (typeof activity.address === 'object' && 'street' in activity.address) {
        // Construire l'adresse depuis les champs individuels
        const parts: string[] = [];
        if (activity.address.street) parts.push(activity.address.street);
        if (activity.address.city) parts.push(activity.address.city);
        if (activity.address.postalCode) parts.push(activity.address.postalCode);
        if (activity.address.country) parts.push(activity.address.country);
        addressString = parts.join(', ');
      }

      if (addressString) {
        console.log(`[ActivityService] getDistanceForActivity - Géocodage de l'adresse pour activité ${activity.id}:`, addressString.substring(0, 100));
        activityCoordinates = await this.geolocationService.geocodeAddress(addressString, supabaseClient);
        console.log(`[ActivityService] getDistanceForActivity - Coordonnées après géocodage:`, {
          activityId: activity.id,
          hasCoordinates: !!activityCoordinates,
          coordinates: activityCoordinates
        });
      }
    }

    if (!activityCoordinates) {
      console.warn(`[ActivityService] getDistanceForActivity - Aucune coordonnée trouvée pour activité ${activity.id}, retour null`);
      return null;
    }

    // 3. Calculer la distance
    console.log(`[ActivityService] getDistanceForActivity - Calcul de la distance pour activité ${activity.id}`, {
      origin,
      destination: activityCoordinates
    });
    const distance = this.geolocationService.getDistanceFrom(origin, activityCoordinates);
    console.log(`[ActivityService] getDistanceForActivity - Distance calculée pour activité ${activity.id}:`, distance);
    return distance;
  }

  /**
   * Détermine si une activité devrait avoir une distance explicable
   * @param activity Activité à vérifier
   * @param howerAngelsMap Map des hower angels par ID (optionnel) pour trouver le créateur
   * @returns true si l'activité devrait avoir une distance, false sinon
   */
  haveExplanableDistance(
    activity: ActivitySearchResult,
    howerAngelsMap?: Map<string, HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult }>
  ): boolean {
    // Si l'activité est en remote, c'est normal qu'elle n'ait pas de distance
    if (activity.locationType === 'remote') {
      return false;
    }

    // Si l'activité a sa propre adresse, elle devrait avoir une distance
    if (activity.address) {
      return true;
    }

    // Si l'activité n'a pas d'adresse, chercher l'adresse du créateur (hower angel) via creatorId
    if (activity.creatorId && howerAngelsMap) {
      // Chercher le hower angel par userId (qui correspond au creatorId de l'activité)
      const creatorHowerAngel = howerAngelsMap.get(activity.creatorId);
      if (creatorHowerAngel) {
        // Si le hower angel créateur a une distance (donc une adresse), l'activité devrait aussi en avoir une
        if (creatorHowerAngel.distanceFromOrigin) {
          return true;
        }
        // Si le hower angel créateur n'a pas d'adresse, c'est normal que l'activité n'en ait pas non plus
        return false;
      }
    }

    // Si on ne trouve pas le créateur ou qu'il n'a pas d'adresse, c'est normal qu'il n'y ait pas de distance
    return false;
  }

  /**
   * Associe les distances aux activités depuis une adresse
   * Logique :
   * - Si une activité n'a pas d'adresse et qu'elle est en remote, c'est normal (pas de distance)
   * - Sinon, si elle a une adresse propre, l'utiliser
   * - Sinon, utiliser l'adresse de son créateur (hower angel)
   * @param activities Liste des activités
   * @param address Adresse d'origine (string)
   * @param supabaseClient Client Supabase optionnel pour le cache de géocodage
   * @param howerAngels Liste des hower angels avec leurs distances (optionnel) pour trouver les créateurs
   * @returns Liste des activités avec leurs distances
   */
  async associateDistancesFromAddress(
    activities: ActivitySearchResult[],
    address: string,
    supabaseClient?: any,
    howerAngels?: Array<HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult }>
  ): Promise<Array<ActivitySearchResult & { distanceFromOrigin?: DistanceResult }>> {
    // 1. Géocoder l'adresse en coordonnées GPS
    const originCoordinates = await this.geolocationService.geocodeAddress(address, supabaseClient);
    
    if (!originCoordinates) {
      console.warn('⚠️ Impossible de géocoder l\'adresse, retour des activités sans distance');
      return activities.map(activity => ({ ...activity }));
    }

    // 2. Créer une map des hower angels par ID pour recherche rapide
    const howerAngelsMap = new Map<string, HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult }>();
    if (howerAngels) {
      howerAngels.forEach(ha => {
        howerAngelsMap.set(ha.id, ha);
        // Aussi indexer par userId pour recherche alternative
        if (ha.userId) {
          howerAngelsMap.set(ha.userId, ha);
        }
      });
    }

    // 3. Calculer les distances pour chaque activité
    const results = await Promise.all(
      activities.map(async (activity) => {
        // Si l'activité est en remote, pas de distance
        if (activity.locationType === 'remote') {
          return { ...activity };
        }

        // Si l'activité a sa propre adresse, l'utiliser
        if (activity.address) {
          console.log(`[ActivityService] associateDistancesFromAddress - Activité ${activity.id} a une adresse, calcul de la distance`);
          const distance = await this.getDistanceForActivity(activity, originCoordinates, supabaseClient);
          return {
            ...activity,
            ...(distance && { distanceFromOrigin: distance })
          };
        } else {
          console.log(`[ActivityService] associateDistancesFromAddress - Activité ${activity.id} n'a PAS d'adresse`);
        }

        // Sinon, chercher l'adresse du créateur (hower angel) via creatorId
        if (activity.creatorId && howerAngelsMap) {
          // Chercher le hower angel par userId (qui correspond au creatorId de l'activité)
          const creatorHowerAngel = howerAngelsMap.get(activity.creatorId);
          if (creatorHowerAngel) {
            // Si le hower angel créateur a une distance, utiliser cette distance pour l'activité
            if (creatorHowerAngel.distanceFromOrigin) {
              return {
                ...activity,
                distanceFromOrigin: creatorHowerAngel.distanceFromOrigin
              };
            }
            // Si le hower angel créateur n'a pas de distance, l'activité n'en a pas non plus
            return { ...activity };
          }
        }

        // Si on ne trouve pas le créateur, pas de distance
        return { ...activity };
      })
    );

    // 4. Trier par distance croissante
    return results.sort((a, b) => {
      const distanceA = a.distanceFromOrigin?.distance || Infinity;
      const distanceB = b.distanceFromOrigin?.distance || Infinity;
      return distanceA - distanceB;
    });
  }

  /**
   * Associe les distances aux activités depuis des coordonnées GPS
   * Logique :
   * - Si une activité n'a pas d'adresse et qu'elle est en remote, c'est normal (pas de distance)
   * - Sinon, si elle a une adresse propre, l'utiliser
   * - Sinon, utiliser l'adresse de son créateur (hower angel)
   * @param activities Liste des activités
   * @param coordinates Coordonnées GPS d'origine
   * @param supabaseClient Client Supabase optionnel pour le géocodage
   * @param howerAngels Liste des hower angels avec leurs distances (optionnel) pour trouver les créateurs
   * @returns Liste des activités avec leurs distances
   */
  async associateDistancesFromCoordinates(
    activities: ActivitySearchResult[],
    coordinates: GeolocationPosition,
    supabaseClient?: any,
    howerAngels?: Array<HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult }>
  ): Promise<Array<ActivitySearchResult & { distanceFromOrigin?: DistanceResult }>> {
    // 1. Créer une map des hower angels par ID pour recherche rapide
    const howerAngelsMap = new Map<string, HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult }>();
    if (howerAngels) {
      howerAngels.forEach(ha => {
        howerAngelsMap.set(ha.id, ha);
        // Aussi indexer par userId pour recherche alternative
        if (ha.userId) {
          howerAngelsMap.set(ha.userId, ha);
        }
      });
    }

    // 2. Calculer les distances pour chaque activité
    const results = await Promise.all(
      activities.map(async (activity) => {
        // Si l'activité est en remote, pas de distance
        if (activity.locationType === 'remote') {
          return { ...activity };
        }

        // Si l'activité a sa propre adresse, l'utiliser
        if (activity.address) {
          console.log(`[ActivityService] associateDistancesFromCoordinates - Activité ${activity.id} a une adresse, calcul de la distance`);
          const distance = await this.getDistanceForActivity(activity, coordinates, supabaseClient);
          return {
            ...activity,
            ...(distance && { distanceFromOrigin: distance })
          };
        } else {
          console.log(`[ActivityService] associateDistancesFromCoordinates - Activité ${activity.id} n'a PAS d'adresse`);
        }

        // Sinon, chercher l'adresse du créateur (hower angel) via creatorId
        if (activity.creatorId && howerAngelsMap) {
          // Chercher le hower angel par userId (qui correspond au creatorId de l'activité)
          const creatorHowerAngel = howerAngelsMap.get(activity.creatorId);
          if (creatorHowerAngel) {
            // Si le hower angel créateur a une distance, utiliser cette distance pour l'activité
            if (creatorHowerAngel.distanceFromOrigin) {
              return {
                ...activity,
                distanceFromOrigin: creatorHowerAngel.distanceFromOrigin
              };
            }
            // Si le hower angel créateur n'a pas de distance, l'activité n'en a pas non plus
            return { ...activity };
          }
        }

        // Si on ne trouve pas le créateur, pas de distance
        return { ...activity };
      })
    );

    // 3. Trier par distance croissante
    return results.sort((a, b) => {
      const distanceA = a.distanceFromOrigin?.distance || Infinity;
      const distanceB = b.distanceFromOrigin?.distance || Infinity;
      return distanceA - distanceB;
    });
  }

  /**
   * Récupère l'adresse depuis la base de données pour une activité
   * @param activityId ID de l'activité
   * @param supabaseClient Client Supabase
   * @returns Adresse ou null
   */
  async getAddressFromDatabase(
    activityId: string,
    supabaseClient: any
  ): Promise<any | null> {
    try {
      const { data, error } = await supabaseClient
        .from('activities')
        .select('address')
        .eq('id', activityId)
        .single();

      if (error || !data) {
        return null;
      }

      return data.address || null;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de l\'adresse depuis la base de données:', error);
      return null;
    }
  }

  /**
   * Enrichit une liste d'activités avec leurs adresses depuis la base de données
   * @param activities Liste des activités à enrichir
   * @param supabaseClient Client Supabase
   * @returns Liste des activités enrichies avec leurs adresses
   */
  async enrichActivitiesWithAddresses(
    activities: ActivitySearchResult[],
    supabaseClient: any
  ): Promise<ActivitySearchResult[]> {
    if (!supabaseClient || activities.length === 0) {
      return activities;
    }

    try {
      // Récupérer les adresses en parallèle pour toutes les activités qui n'en ont pas
      const enrichmentPromises = activities.map(async (activity) => {
        // Si l'activité a déjà une adresse, ne pas la modifier
        if (activity.address) {
          return activity;
        }

        // Si l'activité est en remote, c'est normal qu'elle n'ait pas d'adresse
        if (activity.locationType === 'remote') {
          return activity;
        }

        // Récupérer l'adresse depuis la base de données
        const address = await this.getAddressFromDatabase(activity.id, supabaseClient);
        
        if (address) {
          return {
            ...activity,
            address: address
          };
        }

        return activity;
      });

      const enrichedActivities = await Promise.all(enrichmentPromises);
      console.log(`✅ [ActivityService] ${enrichedActivities.length} activités enrichies avec leurs adresses`);
      
      return enrichedActivities;
    } catch (error) {
      console.error('❌ Erreur lors de l\'enrichissement des activités avec les adresses:', error);
      return activities;
    }
  }
}

