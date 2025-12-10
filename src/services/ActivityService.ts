import { ActivitySearchResult } from '../types/search';
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
    // 1. Extraire les coordonnées depuis l'adresse de l'activité
    let activityCoordinates = this.extractCoordinatesFromActivity(activity);

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
        activityCoordinates = await this.geolocationService.geocodeAddress(addressString, supabaseClient);
      }
    }

    if (!activityCoordinates) {
      return null;
    }

    // 3. Calculer la distance
    return this.geolocationService.getDistanceFrom(origin, activityCoordinates);
  }

  /**
   * Associe les distances aux activités depuis une adresse
   * @param activities Liste des activités
   * @param address Adresse d'origine (string)
   * @param supabaseClient Client Supabase optionnel pour le cache de géocodage
   * @returns Liste des activités avec leurs distances
   */
  async associateDistancesFromAddress(
    activities: ActivitySearchResult[],
    address: string,
    supabaseClient?: any
  ): Promise<Array<ActivitySearchResult & { distanceFromOrigin?: DistanceResult }>> {
    // 1. Géocoder l'adresse en coordonnées GPS
    const originCoordinates = await this.geolocationService.geocodeAddress(address, supabaseClient);
    
    if (!originCoordinates) {
      console.warn('⚠️ Impossible de géocoder l\'adresse, retour des activités sans distance');
      return activities.map(activity => ({ ...activity }));
    }

    // 2. Calculer les distances pour chaque activité
    const results = await Promise.all(
      activities.map(async (activity) => {
        const distance = await this.getDistanceForActivity(activity, originCoordinates, supabaseClient);
        return {
          ...activity,
          ...(distance && { distanceFromOrigin: distance })
        };
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
   * Associe les distances aux activités depuis des coordonnées GPS
   * @param activities Liste des activités
   * @param coordinates Coordonnées GPS d'origine
   * @param supabaseClient Client Supabase optionnel pour le géocodage
   * @returns Liste des activités avec leurs distances
   */
  async associateDistancesFromCoordinates(
    activities: ActivitySearchResult[],
    coordinates: GeolocationPosition,
    supabaseClient?: any
  ): Promise<Array<ActivitySearchResult & { distanceFromOrigin?: DistanceResult }>> {
    // Calculer les distances pour chaque activité
    const results = await Promise.all(
      activities.map(async (activity) => {
        const distance = await this.getDistanceForActivity(activity, coordinates, supabaseClient);
        return {
          ...activity,
          ...(distance && { distanceFromOrigin: distance })
        };
      })
    );

    // Trier par distance croissante
    return results.sort((a, b) => {
      const distanceA = a.distanceFromOrigin?.distance || Infinity;
      const distanceB = b.distanceFromOrigin?.distance || Infinity;
      return distanceA - distanceB;
    });
  }
}

