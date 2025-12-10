import { HowerAngelSearchResult } from '../types/search';

/**
 * Interface pour les coordonnées GPS
 */
export interface GeolocationPosition {
  lat: number;
  lng: number;
}

/**
 * Interface pour le résultat de distance
 */
export interface DistanceResult {
  distance: number; // en kilomètres
  duration?: number; // en minutes (si disponible)
  formattedDistance: string; // formaté pour l'affichage
}

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
  private googleMapsApiKey: string | undefined;

  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  }

  /**
   * Calcule la distance en ligne droite entre deux points (formule de Haversine)
   */
  private calculateHaversineDistance(
    point1: GeolocationPosition,
    point2: GeolocationPosition
  ): DistanceResult {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lng - point1.lng) * Math.PI / 180;
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    return {
      distance,
      formattedDistance: this.formatDistance(distance)
    };
  }

  /**
   * Calcule la distance routière via Google Maps Distance Matrix API
   * Fallback vers Haversine si l'API n'est pas disponible ou échoue
   */
  private async calculateGoogleMapsDistance(
    origin: GeolocationPosition,
    destination: GeolocationPosition
  ): Promise<DistanceResult> {
    try {
      if (!this.googleMapsApiKey) {
        console.warn('⚠️ Clé API Google Maps non configurée, utilisation de Haversine');
        return this.calculateHaversineDistance(origin, destination);
      }

      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destination.lat},${destination.lng}&key=${this.googleMapsApiKey}&mode=driving&units=metric`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
        const element = data.rows[0].elements[0];
        const distance = element.distance.value / 1000; // Convertir en km
        const duration = element.duration.value / 60; // Convertir en minutes

        return {
          distance,
          duration,
          formattedDistance: this.formatDistance(distance)
        };
      } else {
        // Fallback vers Haversine si l'API échoue
        console.warn('⚠️ Google Maps Distance Matrix API a échoué, fallback vers Haversine');
        return this.calculateHaversineDistance(origin, destination);
      }
    } catch (error) {
      console.warn('⚠️ Erreur Google Maps Distance Matrix API, fallback vers Haversine:', error);
      return this.calculateHaversineDistance(origin, destination);
    }
  }

  /**
   * Calcule les distances pour une liste de destinations depuis une origine
   */
  private async calculateMultipleDistances(
    origin: GeolocationPosition,
    destinations: GeolocationPosition[]
  ): Promise<Array<{ destination: GeolocationPosition; result: DistanceResult }>> {
    const results = [];

    for (const destination of destinations) {
      let result: DistanceResult;
      
      if (this.googleMapsApiKey) {
        result = await this.calculateGoogleMapsDistance(origin, destination);
      } else {
        result = this.calculateHaversineDistance(origin, destination);
      }

      results.push({ destination, result });
    }

    return results;
  }

  /**
   * Formate la distance pour l'affichage
   */
  private formatDistance(distance: number): string {
    if (distance < 1) {
      return `${Math.round(distance * 1000)} m`;
    } else if (distance < 10) {
      return `${distance.toFixed(0)} km`;
    } else {
      return `${Math.round(distance)} km`;
    }
  }

  /**
   * Géocode une adresse en coordonnées GPS via Google Maps Geocoding API
   * Utilise le cache Supabase si disponible (via la table geocoding_results)
   */
  async geocodeAddress(
    address: string,
    supabaseClient?: any
  ): Promise<GeolocationPosition | null> {
    try {
      if (!address || typeof address !== 'string' || address.trim() === '') {
        console.warn('⚠️ Adresse vide ou invalide');
        return null;
      }

      const normalizedAddress = address.trim();

      // 1. Vérifier si le résultat existe déjà dans le cache Supabase
      if (supabaseClient) {
        try {
          const { data: cachedData, error: cacheError } = await supabaseClient
            .from('geocoding_results')
            .select('latitude, longitude')
            .eq('address', normalizedAddress)
            .single();

          if (cachedData && !cacheError) {
            console.log(`✅ Résultat de géocodage trouvé dans le cache pour: ${normalizedAddress}`);
            return {
              lat: cachedData.latitude,
              lng: cachedData.longitude
            };
          }
        } catch (cacheErr) {
          // Si le cache échoue, continuer avec l'API Google Maps
          console.warn('⚠️ Erreur lors de la vérification du cache:', cacheErr);
        }
      }

      // 2. Si pas dans le cache, appeler Google Maps API
      if (!this.googleMapsApiKey) {
        console.error('❌ Clé API Google Maps non configurée');
        return null;
      }

      // Prétraiter l'adresse pour corriger les codes postaux incomplets
      const processedAddress = this.preprocessAddress(normalizedAddress);
      const encodedAddress = encodeURIComponent(processedAddress);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${this.googleMapsApiKey}`;
      
      console.log(`🌍 Appel à Google Maps API pour: ${normalizedAddress}`);
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const latitude = location.lat;
        const longitude = location.lng;

        // 3. Sauvegarder le résultat dans le cache Supabase si disponible
        if (supabaseClient) {
          try {
            const { error: saveError } = await supabaseClient
              .from('geocoding_results')
              .upsert(
                {
                  address: normalizedAddress,
                  latitude,
                  longitude
                },
                {
                  onConflict: 'address',
                  ignoreDuplicates: false
                }
              );

            if (saveError) {
              console.warn('⚠️ Impossible de sauvegarder le résultat dans le cache:', saveError);
            } else {
              console.log(`✅ Résultat de géocodage sauvegardé dans le cache pour: ${normalizedAddress}`);
            }
          } catch (saveErr) {
            console.warn('⚠️ Erreur lors de la sauvegarde dans le cache:', saveErr);
          }
        }

        return {
          lat: latitude,
          lng: longitude
        };
      }
      
      console.warn('⚠️ Géocodage échoué pour l\'adresse:', normalizedAddress, data.status);
      return null;

    } catch (error) {
      console.error('❌ Erreur lors du géocodage:', error);
      return null;
    }
  }

  /**
   * Prétraite une adresse pour corriger les codes postaux incomplets
   * Règle spécifique aux codes postaux français : complète les codes de 1 à 4 chiffres
   * en ajoutant des zéros à gauche pour obtenir 5 chiffres
   */
  private preprocessAddress(address: string): string {
    // Expression régulière pour détecter les codes postaux français incomplets (1 à 4 chiffres)
    const frenchPostalCodeRegex = /\b(\d{1,4})\b/g;
    
    return address.replace(frenchPostalCodeRegex, (match, digits) => {
      // Si c'est un code postal français incomplet (1 à 4 chiffres), le compléter avec des zéros à gauche
      if (digits.length >= 1 && digits.length <= 4) {
        return digits.padStart(5, '0');
      }
      return match;
    });
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
      const originCoordinates = await this.geocodeAddress(address, supabaseClient);
      
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
          return {
            ...howerAngel,
            distanceFromOrigin: distanceResult.result,
            coordinates: distanceResult.destination
          };
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
          return {
            ...howerAngel,
            distanceFromOrigin: distanceResult.result,
            coordinates: distanceResult.destination
          };
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
}

