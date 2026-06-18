import type { OpeningStatus } from './types';

export const getLatLng = (loc: any) => {
  if (!loc) return { lat: 0, lng: 0 };
  const latNum = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
  const lngNum = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
  return { lat: Number(latNum), lng: Number(lngNum) };
};

export const getDistanceMeters = (from: any, to: any) => {
  const { lat: lat1, lng: lon1 } = getLatLng(from);
  const { lat: lat2, lng: lon2 } = getLatLng(to);
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};


export const parsePriceLevel = (level: any): number => {
  if (level == null) return -1;
  if (typeof level === 'number') return level;
  if (typeof level === 'string') {
    const l = level.toUpperCase();
    if (l === 'PRICE_LEVEL_FREE' || l === 'FREE' || l === '0') return 0;
    if (l === 'PRICE_LEVEL_INEXPENSIVE' || l === 'INEXPENSIVE' || l === '1') return 1;
    if (l === 'PRICE_LEVEL_MODERATE' || l === 'MODERATE' || l === '2') return 2;
    if (l === 'PRICE_LEVEL_EXPENSIVE' || l === 'EXPENSIVE' || l === '3') return 3;
    if (l === 'PRICE_LEVEL_VERY_EXPENSIVE' || l === 'VERY_EXPENSIVE' || l === '4') return 4;
  }
  return -1;
};

export const normalizePlaceForStorage = (place: any) => ({
  id: place.id,
  displayName: place.displayName,
  location: getLatLng(place.location),
  rating: place.rating,
  priceLevel: place.priceLevel,
  formattedAddress: place.formattedAddress,
  businessStatus: place.businessStatus,
  userRatingCount: place.userRatingCount,
});


export const checkIsOpenNow = (place: any) => {
    if (place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') {
      return false;
    }
    
    // Check if the place object has a native isOpen()
    if (typeof place.isOpen === 'function') {
      try {
        const nativeIsOpen = place.isOpen();
        if (typeof nativeIsOpen === 'boolean') return nativeIsOpen;
      } catch(e) {}
    }

    // Otherwise calculate manually from periods
    const hours = place.currentOpeningHours || place.regularOpeningHours;
    if (!hours) return null; // Unknown

    // Some APIs return a direct isOpenNow boolean, check that first
    if (typeof hours.isOpen === 'function') {
      try {
        const hIsOpen = hours.isOpen();
        if (typeof hIsOpen === 'boolean') return hIsOpen;
      } catch(e) {}
    }
    if (typeof hours.isOpenNow === 'boolean') return hours.isOpenNow;

    if (!hours.periods || hours.periods.length === 0) return null; // Unknown

    const getDay = (pt: any) => pt.day ?? pt.dayOfWeek ?? 0;
    const getHour = (pt: any) => pt.hour ?? (pt.time ? parseInt(pt.time.substring(0,2)) : 0);
    const getMin = (pt: any) => pt.minute ?? (pt.time ? parseInt(pt.time.substring(2)) : 0);

    const is24Hours = hours.periods.some((p: any) => 
      p.open && getDay(p.open) === 0 && getHour(p.open) === 0 && getMin(p.open) === 0 && !p.close
    );
    if (is24Hours) return true;

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Convert to minutes from start of week (Sunday 00:00)
    const currentMinutes = currentDay * 24 * 60 + currentHour * 60 + currentMinute;

    for (const period of hours.periods) {
      if (!period.open) continue;
      
      const openMinutes = getDay(period.open) * 24 * 60 + getHour(period.open) * 60 + getMin(period.open);
      
      if (!period.close) {
        // If there's an open but no close, assume it's open 24 hours from that day
        if (currentMinutes >= openMinutes) return true;
        continue;
      }
      
      let closeMinutes = getDay(period.close) * 24 * 60 + getHour(period.close) * 60 + getMin(period.close);
      
      // If close time is before open time, it means it wraps around the week (e.g., open Saturday, close Sunday)
      if (closeMinutes < openMinutes) {
        closeMinutes += 7 * 24 * 60;
      }
      
      // We also need to check if current time wrapped around
      let checkMinutes = currentMinutes;
      if (checkMinutes < openMinutes && closeMinutes > 7 * 24 * 60) {
        checkMinutes += 7 * 24 * 60;
      }
      
      if (checkMinutes >= openMinutes && checkMinutes < closeMinutes) {
        return true;
      }
    }
    
    return false;
  };


export const getOpeningStatus = (place: any) => {
    // Check business status first
    if (place.businessStatus === 'CLOSED_TEMPORARILY') {
      return {
        isOpen: false,
        text: '暫時關閉',
        color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400'
      };
    }
    if (place.businessStatus === 'CLOSED_PERMANENTLY') {
      return {
        isOpen: false,
        text: '永久停業',
        color: 'text-gray-600 bg-gray-50 dark:bg-gray-900/20 dark:text-gray-400'
      };
    }

    // Use currentOpeningHours if available, fallback to regularOpeningHours
    const hours = place.currentOpeningHours || place.regularOpeningHours;
    if (!hours) return null;
    
    const isOpen = checkIsOpenNow(place);
    if (isOpen === null) return null;
    
    // Check if it's 24 hours
    const is24Hours = hours.periods?.some((p: any) => 
      p.open?.day === 0 && p.open?.hour === 0 && p.open?.minute === 0 && !p.close
    );

    return {
      isOpen,
      text: is24Hours ? '24 小時營業' : (isOpen ? '營業中' : '已打烊'),
      color: isOpen ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400' : 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400'
    };
  };
