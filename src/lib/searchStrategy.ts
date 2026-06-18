import type { ScenarioId, SearchParams } from './types';
import { getDistanceMeters, getLatLng } from './placeUtils';

export const DEFAULT_RADIUS_METERS = 5000;
export const MAX_INITIAL_SEARCH_REQUESTS = 8;
export const MAX_LOAD_MORE_SEARCH_REQUESTS = 6;
export const MAX_LOAD_MORE_ROUNDS = 6;
export const MAX_NO_CHANGE_ROUNDS = 2;

const FOOD_RELATED_TYPES = ['restaurant', 'cafe', 'bakery', 'meal_takeaway'];
const TYPE_EXPANSIONS: Record<string, string[]> = {
  restaurant: FOOD_RELATED_TYPES,
  cafe: ['cafe', 'bakery', 'restaurant'],
  store: ['store', 'supermarket', 'convenience_store'],
};

const KEYWORD_EXPANSIONS: Record<string, string[]> = {
  '拉麵': ['ramen', '日式拉麵'],
  '咖啡': ['coffee', '咖啡廳'],
  '甜點': ['dessert', '蛋糕', '下午茶'],
  '早餐': ['breakfast', '早午餐'],
  '早午餐': ['brunch', '早餐'],
  '火鍋': ['hot pot', '鍋物'],
  '壽司': ['sushi', '日本料理'],
  '燒肉': ['yakiniku', '烤肉'],
  '義大利麵': ['pasta', '義式餐廳'],
  '酒吧': ['bar', '餐酒館'],
};

export const SCENARIOS: Array<{ id: ScenarioId; label: string; params: Partial<SearchParams> }> = [
  { id: 'open_now', label: '現在能吃', params: { openNow: true } },
  { id: 'walkable', label: '走路近', params: { radius: '1000' } },
  { id: 'high_rating', label: '高評價', params: { ratingFilter: true } },
  { id: 'budget', label: '便宜', params: { price: '1' } },
  { id: 'hidden_gem', label: '隱藏小店', params: { hiddenGem: true, ratingFilter: false } },
  { id: 'coffee_dessert', label: '咖啡甜點', params: { keyword: '咖啡 甜點', type: 'cafe', radius: '3000' } },
];

export const getSearchCenters = (center: any, radius: number, searchRound: number) => {
  const { lat, lng } = getLatLng(center);
  const stepRatio = searchRound === 0 ? 0.38 : 0.38 + searchRound * 0.22;
  const stepMeters = Math.min(Math.max(radius * stepRatio, 450), radius * 0.85, 3500);
  const latStep = stepMeters / 111320;
  const lngStep = stepMeters / (111320 * Math.max(Math.cos(lat * Math.PI / 180), 0.2));
  const centers = [
    { lat, lng, label: '中心' },
    { lat: lat + latStep, lng, label: '北側' },
    { lat: lat - latStep, lng, label: '南側' },
    { lat, lng: lng + lngStep, label: '東側' },
    { lat, lng: lng - lngStep, label: '西側' },
  ];

  if (searchRound > 0) {
    centers.push(
      { lat: lat + latStep, lng: lng + lngStep, label: '東北側' },
      { lat: lat + latStep, lng: lng - lngStep, label: '西北側' },
      { lat: lat - latStep, lng: lng + lngStep, label: '東南側' },
      { lat: lat - latStep, lng: lng - lngStep, label: '西南側' },
    );
  }

  return centers;
};

const uniqueStrings = (items: string[]) => Array.from(new Set(items.map(item => item.trim()).filter(Boolean)));

export const getKeywordVariants = (keyword: string, type: string, isLoadMore: boolean) => {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const expansions = Object.entries(KEYWORD_EXPANSIONS)
    .filter(([seed]) => trimmed.includes(seed))
    .flatMap(([, variants]) => variants);
  const foodSuffixes = type === 'restaurant' || type === 'cafe' ? [`${trimmed} 餐廳`, `${trimmed} 美食`] : [];
  const variants = uniqueStrings([trimmed, ...foodSuffixes, ...expansions]);
  return variants.slice(0, isLoadMore ? 4 : 3);
};

export const getTypeVariants = (type: string, isLoadMore: boolean) => {
  const variants = TYPE_EXPANSIONS[type] || [type];
  return variants.slice(0, isLoadMore ? 4 : 3);
};

export const scorePlace = (place: any, center: any) => {
  const distance = place.location ? getDistanceMeters(center, place.location) : 999999;
  const rating = typeof place.rating === 'number' ? place.rating : 0;
  const reviews = typeof place.userRatingCount === 'number' ? place.userRatingCount : 0;
  const ratingScore = rating * 18;
  const reviewScore = Math.min(Math.log10(reviews + 1) * 10, 35);
  const distancePenalty = Math.min(distance / 120, 45);
  return ratingScore + reviewScore - distancePenalty;
};

export const getWeightedRandom = (items: any[], getWeight: (item: any) => number) => {
  const weighted = items.map(item => ({ item, weight: Math.max(getWeight(item), 1) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.random() * total;

  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }

  return weighted[weighted.length - 1]?.item;
};

