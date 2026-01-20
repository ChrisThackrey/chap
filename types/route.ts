export type StopType =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'park'
  | 'museum'
  | 'theater'
  | 'viewpoint'
  | 'activity'
  | 'shopping';

export interface VenuePhoto {
  prefix: string;
  suffix: string;
  width: number;
  height: number;
}

export interface VenueDetails {
  placeId: string; // Foursquare FSQ ID
  rating?: number; // 0-10 scale
  ratingColor?: string; // Foursquare rating color
  price?: number; // 1-4 scale ($ to $$$$)
  categories?: string[]; // Array of categories
  photos?: VenuePhoto[]; // Array of photo URLs
  hours?: string; // Operating hours text
  isOpen?: boolean; // Current open status
  tips?: string[]; // User tips/reviews
  website?: string; // Venue website
  phone?: string; // Phone number
  verified?: boolean; // Foursquare verified status
}

export interface RouteStop {
  name: string;
  type: StopType;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  duration: number; // minutes
  order: number;
  venueDetails?: VenueDetails; // Optional Foursquare venue data
}

export interface Route {
  id: string;
  title: string;
  stops: RouteStop[];
  createdAt: string;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}
