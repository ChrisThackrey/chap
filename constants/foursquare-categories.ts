import { StopType } from '@/types/route';

/**
 * Maps app StopType to Foursquare Places API category IDs
 *
 * Foursquare Categories (v3 API):
 * https://docs.foursquare.com/data-products/docs/categories
 *
 * These IDs are used to filter venue search results to match the desired stop type.
 */
export const FOURSQUARE_CATEGORY_MAP: Record<StopType, string[]> = {
  restaurant: [
    '13065', // Restaurant (top-level)
    '13001', // Bistro
    '13003', // Steakhouse
    '13025', // Fine Dining
    '13377', // Italian Restaurant
    '13376', // French Restaurant
    '13378', // Japanese Restaurant
    '13275', // Mexican Restaurant
    '13334', // Asian Restaurant
  ],
  cafe: [
    '13032', // Café
    '13033', // Coffee Shop
    '13034', // Dessert Shop
    '13035', // Bakery
    '13278', // Tea Room
  ],
  bar: [
    '13003', // Bar (top-level)
    '13028', // Cocktail Bar
    '13037', // Wine Bar
    '13031', // Lounge
    '13038', // Pub
    '13057', // Beer Garden
  ],
  park: [
    '16032', // Park (top-level)
    '16033', // Garden
    '16030', // National Park
    '16046', // Botanical Garden
    '16051', // Dog Park
    '16037', // Playground
  ],
  museum: [
    '10027', // Museum (top-level)
    '10001', // Art Museum
    '10002', // History Museum
    '10020', // Science Museum
    '10025', // Natural History Museum
  ],
  theater: [
    '10005', // Movie Theater
    '10006', // Performing Arts Venue
    '10061', // Theater
    '10062', // Opera House
    '10042', // Concert Hall
    '10011', // Music Venue
  ],
  viewpoint: [
    '16002', // Scenic Lookout
    '16050', // Beach
    '16052', // Waterfront
    '12047', // Observation Deck
    '16026', // Lake
    '16027', // Mountain
  ],
  activity: [
    '18021', // Sports & Recreation (top-level)
    '18062', // Climbing Gym
    '18042', // Bowling Alley
    '18003', // Arcade
    '18053', // Mini Golf
    '18066', // Yoga Studio
    '18032', // Gym / Fitness Center
  ],
  shopping: [
    '17000', // Retail (top-level)
    '17001', // Clothing Store
    '17024', // Bookstore
    '17069', // Gift Shop
    '17114', // Shopping Mall
    '17027', // Record Shop
    '17044', // Boutique
  ],
};

/**
 * Get Foursquare category IDs for a given StopType
 */
export function getCategoriesForStopType(stopType: StopType): string[] {
  return FOURSQUARE_CATEGORY_MAP[stopType] || [];
}

/**
 * Get all category IDs as a comma-separated string for API requests
 */
export function getCategoryQueryString(stopType: StopType): string {
  const categories = getCategoriesForStopType(stopType);
  return categories.join(',');
}

/**
 * Foursquare parking-related category IDs
 * Used for finding nearby parking when a venue has limited parking
 */
export const PARKING_CATEGORIES = [
  '19001', // Parking Garage
  '19002', // Parking Lot
  '19003', // Street Parking
  '19004', // Parking Meter
];

/**
 * Get parking categories as comma-separated string for API requests
 */
export function getParkingCategoryQueryString(): string {
  return PARKING_CATEGORIES.join(',');
}
