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
 * Service pour la géolocalisation et le géocodage
 */
export class GeolocationService {
  private googleMapsApiKey: string | undefined;

  constructor() {
    this.googleMapsApiKey = process.env['GOOGLE_MAPS_API_KEY'];
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
      const data = await response.json() as {
        status: string;
        results?: Array<{
          geometry?: {
            location?: {
              lat: number;
              lng: number;
            };
          };
        }>;
      };
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const firstResult = data.results[0];
        if (!firstResult) {
          console.warn('⚠️ Géocodage échoué: pas de résultat dans la réponse');
          return null;
        }
        const location = firstResult.geometry?.location;
        if (!location) {
          console.warn('⚠️ Géocodage échoué: pas de location dans la réponse');
          return null;
        }
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
   * Calcule la distance en ligne droite entre deux points (formule de Haversine)
   * @param origin Point d'origine
   * @param destination Point de destination
   * @returns Résultat de distance avec distance en km et formatage pour l'affichage
   */
  getDistanceFrom(
    origin: GeolocationPosition,
    destination: GeolocationPosition
  ): DistanceResult {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (destination.lat - origin.lat) * Math.PI / 180;
    const dLon = (destination.lng - origin.lng) * Math.PI / 180;
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    return {
      distance,
      formattedDistance: this.formatDistance(distance)
    };
  }
}

