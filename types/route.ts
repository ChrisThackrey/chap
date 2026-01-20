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

export interface RouteStop {
  name: string;
  type: StopType;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  duration: number; // minutes
  order: number;
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
