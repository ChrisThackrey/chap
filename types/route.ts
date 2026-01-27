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
  // Parking information
  hasParking?: boolean;
  parkingQuality?: 'ample' | 'limited' | 'street' | 'none';
  parkingNotes?: string; // extracted from tips/categories
}

// Parking location (intermediate stop)
export interface ParkingLocation {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  distanceToVenue: number; // meters
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
  // Parking strategy information
  parkingStrategy?: 'drive-to-venue' | 'park-and-walk';
  parkingLocation?: ParkingLocation;
  walkingDistance?: number; // meters
}

// Travel mode for route segments
export type TravelMode = 'driving' | 'walking';

// Route coordinate
export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

// Route segment between two points
export interface RouteSegment {
  id: string;
  startStop: number; // order of start stop
  endStop: number; // order of end stop
  mode: TravelMode;
  coordinates: RouteCoordinate[];
  distance: number; // meters
  duration: number; // seconds
  parkingLocation?: ParkingLocation;
}

export interface Route {
  id: string;
  title: string;
  stops: RouteStop[];
  createdAt: string;
  segments?: RouteSegment[]; // route segments with travel modes
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
