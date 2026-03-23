import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, Dices, Copy, Star, DollarSign, MapPinOff, MapPin, Check, Compass, Heart, Navigation, Moon, Sun, Clock, ExternalLink } from 'lucide-react';

declare global {
  interface Window {
    google: any;
  }
}

interface SearchParams {
  keyword: string;
  type: string;
  radius: string;
  price: string;
  openNow: boolean;
  ratingFilter: boolean;
}

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];

export default function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [map, setMap] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [places, setPlaces] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>(() => {
    const saved = localStorage.getItem('favorites');
    return saved ? JSON.parse(saved) : [];
  });
  const [distances, setDistances] = useState<Record<string, string>>({});
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [searchParams, setSearchParams] = useState<SearchParams>({
    keyword: '',
    type: 'restaurant',
    radius: 'any',
    price: 'any',
    openNow: false,
    ratingFilter: true
  });
  const [winner, setWinner] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState<'search' | 'favorites'>('search');

  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem('favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('darkMode', String(darkMode));
    if (map) {
      map.setOptions({ styles: darkMode ? DARK_MAP_STYLE : [] });
    }
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode, map]);

  useEffect(() => {
    const initMap = async () => {
      if (!window.google) return;
      try {
        const { Map } = await window.google.maps.importLibrary("maps");
        const defaultCenter = { lat: 25.0479, lng: 121.5171 };
        
        const newMap = new Map(mapRef.current, {
          center: defaultCenter,
          zoom: 15,
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          styles: darkMode ? DARK_MAP_STYLE : []
        });
        
        setMap(newMap);
        setIsLoaded(true);

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
              setUserLocation(loc);
              newMap.setCenter(loc);
              
              const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary("marker");
              const pin = new PinElement({ background: '#4285F4', borderColor: '#FFFFFF', glyphColor: '#FFFFFF' });
              userMarkerRef.current = new AdvancedMarkerElement({
                map: newMap, position: loc, title: "您的位置", content: pin.element, zIndex: 99
              });
            },
            () => {
              setUserLocation(defaultCenter);
            },
            { timeout: 10000, enableHighAccuracy: true }
          );
        } else {
          setUserLocation(defaultCenter);
        }
      } catch (error) {
        console.error("Map initialization failed", error);
      }
    };

    if (window.google && window.google.maps) {
      initMap();
    } else {
      const interval = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(interval);
          initMap();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !searchInputRef.current || !window.google) return;

    const initAutocomplete = async () => {
      const { Autocomplete } = await window.google.maps.importLibrary("places");
      const autocomplete = new Autocomplete(searchInputRef.current, {
        componentRestrictions: { country: "tw" },
        fields: ["geometry", "name"],
        types: ["establishment", "geocode"]
      });

      autocomplete.addListener('place_changed', async () => {
        const place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
          const loc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
          setUserLocation(loc);
          map.setCenter(loc);
          map.setZoom(15);
          
          if (userMarkerRef.current) {
            userMarkerRef.current.position = loc;
          } else {
            const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary("marker");
            const pin = new PinElement({ background: '#4285F4', borderColor: '#FFFFFF', glyphColor: '#FFFFFF' });
            userMarkerRef.current = new AdvancedMarkerElement({
              map, position: loc, title: "搜尋中心", content: pin.element, zIndex: 99
            });
          }
        }
      });
    };
    initAutocomplete();
  }, [isLoaded, map]);

  const updateMarkers = async (newPlaces: any[]) => {
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];

    if (!window.google || newPlaces.length === 0) return;
    const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary("marker");

    newPlaces.forEach(place => {
      const pin = new PinElement({ background: '#EA4335', borderColor: '#FFFFFF', glyphColor: '#FFFFFF' });
      const marker = new AdvancedMarkerElement({
        map,
        position: place.location,
        title: place.displayName,
        content: pin.element
      });
      
      marker.addListener('click', () => {
        setActivePlaceId(place.id);
        map.panTo(place.location);
        map.setZoom(17);
      });
      
      markersRef.current.push(marker);
    });
  };

  const performSearch = async (isLoadMore = false) => {
    if (!userLocation || !map) return;
    if (isLoadMore) setIsLoadingMore(true);
    else setIsSearching(true);
    
    setWinner(null);
    setViewMode('search');
    
    try {
      const { Place } = await window.google.maps.importLibrary("places");
      const baseFields = [
        'displayName', 
        'location', 
        'rating', 
        'priceLevel', 
        'formattedAddress', 
        'id', 
        'regularOpeningHours', 
        'businessStatus', 
        'userRatingCount'
      ];

      let results = [];
      let currentHasNextPage = false;
      
      if (searchParams.keyword) {
        let textQuery = searchParams.keyword;
        if (isLoadMore) {
          const exclusionQuery = places.map(p => `-"${p.displayName.replace(/"/g, '')}"`).join(' ');
          textQuery = `${searchParams.keyword} ${exclusionQuery}`;
        }

        const request: any = {
          fields: baseFields,
          textQuery: textQuery,
          maxResultCount: 20,
        };
        const radius = searchParams.radius === 'any' ? 50000 : parseInt(searchParams.radius);
        request.locationBias = { center: userLocation, radius };
        
        const response = await Place.searchByText(request);
        results = response.places || [];
        if (results.length === 20) currentHasNextPage = true;
      } else {
        const request: any = {
          fields: baseFields,
          includedTypes: [searchParams.type],
          maxResultCount: 20,
        };
        const radius = searchParams.radius === 'any' ? 5000 : parseInt(searchParams.radius);
        request.locationRestriction = { center: userLocation, radius };
        
        const response = await Place.searchNearby(request);
        results = response.places || [];
      }

      // Manual distance calculation (straight line estimate)
      const newDistances: Record<string, string> = {};
      results.forEach((p: any) => {
        if (p.location && userLocation) {
          const lat1 = userLocation.lat;
          const lon1 = userLocation.lng;
          const lat2 = p.location.lat;
          const lon2 = p.location.lng;
          
          // Haversine formula
          const R = 6371e3; // metres
          const φ1 = lat1 * Math.PI/180;
          const φ2 = lat2 * Math.PI/180;
          const Δφ = (lat2-lat1) * Math.PI/180;
          const Δλ = (lon2-lon1) * Math.PI/180;

          const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c; // in metres
          
          // Estimate walking time (approx 80m per minute)
          const minutes = Math.ceil((distance * 1.3) / 80); // 1.3 factor for actual walking path vs straight line
          newDistances[p.id] = `${minutes} 分鐘`;
        }
      });
      setDistances(prev => ({ ...prev, ...newDistances }));

      const existingIds = isLoadMore ? new Set(places.map(p => p.id)) : new Set();
      const uniqueNew = results.filter((p: any) => !existingIds.has(p.id));

      const filtered = uniqueNew.filter((p: any) => {
        if (searchParams.ratingFilter && p.rating && p.rating < 4.0) return false;
        if (searchParams.price !== 'any') {
          if (p.priceLevel == null || p.priceLevel > parseInt(searchParams.price)) return false;
        }
        if (searchParams.openNow) {
          // If openNow is checked, only show if we are sure it's open
          const isOpen = checkIsOpenNow(p);
          if (isOpen === false || isOpen === null) return false;
        }
        return true;
      });

      const combined = isLoadMore ? [...places, ...filtered] : filtered;
      setPlaces(combined);
      updateMarkers(combined);
      setHasNextPage(currentHasNextPage);
      
      if (!isLoadMore && window.innerWidth < 768) {
        setShowFilters(false);
      }

    } catch (error) {
      console.error("Search failed", error);
      alert("搜尋失敗，請稍後再試");
    } finally {
      if (isLoadMore) setIsLoadingMore(false);
      else setIsSearching(false);
    }
  };

  const toggleFavorite = (place: any) => {
    setFavorites(prev => {
      const isFav = prev.some(f => f.id === place.id);
      if (isFav) {
        return prev.filter(f => f.id !== place.id);
      } else {
        return [...prev, place];
      }
    });
  };

  const checkIsOpenNow = (place: any) => {
    if (place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') {
      return false;
    }
    
    // Some APIs return a direct isOpenNow boolean, check that first
    if (place.regularOpeningHours && typeof place.regularOpeningHours.isOpenNow === 'boolean') {
      return place.regularOpeningHours.isOpenNow;
    }
    if (place.currentOpeningHours && typeof place.currentOpeningHours.isOpenNow === 'boolean') {
      return place.currentOpeningHours.isOpenNow;
    }

    // Otherwise calculate manually from periods
    const hours = place.currentOpeningHours || place.regularOpeningHours;
    if (!hours || !hours.periods) return null; // Unknown

    const is24Hours = hours.periods.some((p: any) => 
      p.open?.day === 0 && p.open?.hour === 0 && p.open?.minute === 0 && !p.close
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
      
      const openMinutes = period.open.day * 24 * 60 + period.open.hour * 60 + period.open.minute;
      
      if (!period.close) {
        // If there's an open but no close, assume it's open 24 hours from that day
        if (currentMinutes >= openMinutes) return true;
        continue;
      }
      
      let closeMinutes = period.close.day * 24 * 60 + period.close.hour * 60 + period.close.minute;
      
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

  const getOpeningStatus = (place: any) => {
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

  const handleNavigate = (place: any) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.displayName)}&destination_place_id=${place.id}`;
    window.open(url, '_blank');
  };

  const drawWinner = () => {
    if (places.length === 0) {
      alert("請先搜尋，才能抽籤喔！");
      return;
    }
    const randomIndex = Math.floor(Math.random() * places.length);
    const w = places[randomIndex];
    setWinner(w);
    setActivePlaceId(w.id);
    map.panTo(w.location);
    map.setZoom(17);
  };

  const handleCopy = async (place: any) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName)}&query_place_id=${place.id}`;
    const text = `嘿！我找到一家很棒的店：\n\n【${place.displayName}】\n\n推薦給你！\n點擊查看地圖：${url}`;
    try {
      await navigator.clipboard.writeText(text);
      alert("已複製分享文字！");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className={`flex flex-col h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans overflow-hidden transition-colors duration-300`}>
      <header className="bg-white dark:bg-gray-800 px-4 h-14 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 shrink-0 z-10 shadow-sm">
        <div className="flex items-center">
          <Compass className="w-6 h-6 text-blue-600 mr-2" />
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">附近優質店家探測器 V5.0</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={darkMode ? "切換亮色模式" : "切換深色模式"}
          >
            {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-gray-600" />}
          </button>
        </div>
      </header>

      <main className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
        <aside className="w-full md:w-[400px] bg-white dark:bg-gray-800 flex flex-col border-r border-gray-200 dark:border-gray-700 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] md:shadow-none flex-1 md:h-full order-2 md:order-1 overflow-hidden">
          
          <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
            <button 
              onClick={() => { setViewMode('search'); updateMarkers(places); }}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === 'search' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30 dark:bg-blue-900/20' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              搜尋結果
            </button>
            <button 
              onClick={() => { setViewMode('favorites'); updateMarkers(favorites); }}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${viewMode === 'favorites' ? 'text-pink-600 border-b-2 border-pink-600 bg-pink-50/30 dark:bg-pink-900/20' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              我的收藏 ({favorites.length})
            </button>
          </div>

          {/* Search Button - Always visible on mobile when in search mode */}
          {viewMode === 'search' && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 md:hidden flex gap-2 shrink-0">
              <button 
                onClick={() => performSearch(false)}
                disabled={isSearching || !userLocation}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
              >
                {isSearching ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                {isSearching ? '搜尋中...' : '開始搜尋'}
              </button>
              <button 
                onClick={drawWinner}
                disabled={places.length === 0}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                title="天選之店！"
              >
                <Dices className="w-5 h-5" />
              </button>
            </div>
          )}

          <div className="md:hidden flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <span className="font-semibold text-sm text-gray-600 dark:text-gray-400">
              {viewMode === 'search' ? (places.length > 0 ? `找到 ${places.length} 間店家` : '設定搜尋條件') : `收藏了 ${favorites.length} 間店家`}
            </span>
            {viewMode === 'search' && (
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center text-sm text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full"
              >
                <Filter className="w-4 h-4 mr-1" />
                {showFilters ? '隱藏篩選' : '展開篩選'}
              </button>
            )}
          </div>

          {viewMode === 'search' && (
            <div className={`flex-col shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all duration-300 overflow-y-auto max-h-[60vh] md:max-h-none ${showFilters ? 'flex' : 'hidden md:flex'}`}>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">搜尋地點</label>
                  <div className="relative">
                    <input 
                      ref={searchInputRef}
                      type="text" 
                      placeholder="輸入地址、地標或區域" 
                      className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow dark:text-gray-100"
                    />
                    <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">關鍵字</label>
                    <input 
                      type="text" 
                      value={searchParams.keyword}
                      onChange={e => setSearchParams({...searchParams, keyword: e.target.value})}
                      placeholder="例如: 拉麵" 
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">類型</label>
                    <select 
                      value={searchParams.type}
                      onChange={e => setSearchParams({...searchParams, type: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-100"
                    >
                      <option value="restaurant">餐廳美食</option>
                      <option value="cafe">咖啡廳</option>
                      <option value="clothing_store">服飾店</option>
                      <option value="art_gallery">藝術展覽</option>
                      <option value="book_store">書店</option>
                      <option value="store">特色小物</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">距離</label>
                    <select 
                      value={searchParams.radius}
                      onChange={e => setSearchParams({...searchParams, radius: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-100"
                    >
                      <option value="any">不限</option>
                      <option value="1000">1 km 內</option>
                      <option value="3000">3 km 內</option>
                      <option value="5000">5 km 內</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">價位</label>
                    <select 
                      value={searchParams.price}
                      onChange={e => setSearchParams({...searchParams, price: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-100"
                    >
                      <option value="any">不限</option>
                      <option value="1">$</option>
                      <option value="2">$$</option>
                      <option value="3">$$$</option>
                      <option value="4">$$$$</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <input 
                        type="checkbox" 
                        checked={searchParams.openNow}
                        onChange={e => setSearchParams({...searchParams, openNow: e.target.checked})}
                        className="peer appearance-none w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 checked:bg-blue-500 checked:border-blue-500 transition-colors cursor-pointer"
                      />
                      <Check className="w-3.5 h-3.5 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">只顯示現在營業中</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <input 
                        type="checkbox" 
                        checked={searchParams.ratingFilter}
                        onChange={e => setSearchParams({...searchParams, ratingFilter: e.target.checked})}
                        className="peer appearance-none w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 checked:bg-blue-500 checked:border-blue-500 transition-colors cursor-pointer"
                      />
                      <Check className="w-3.5 h-3.5 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">只顯示 4.0★ 以上店家</span>
                  </label>
                </div>

                {winner && (
                  <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-center">
                    <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">🎉 天選之店</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{winner.displayName}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search Button - Desktop version inside filters */}
          {viewMode === 'search' && (
            <div className="hidden md:block p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <button 
                  onClick={() => performSearch(false)}
                  disabled={isSearching || !userLocation}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
                >
                  {isSearching ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                  {isSearching ? '搜尋中...' : '開始搜尋'}
                </button>
                <button 
                  onClick={drawWinner}
                  disabled={places.length === 0}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  title="天選之店！"
                >
                  <Dices className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/50">
            {(viewMode === 'search' ? places : favorites).length === 0 && !isSearching ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400 dark:text-gray-600">
                {viewMode === 'search' ? <MapPinOff className="w-12 h-12 mb-3 opacity-50" /> : <Heart className="w-12 h-12 mb-3 opacity-50" />}
                <p className="text-sm font-medium">{viewMode === 'search' ? '開始探索附近的店家吧！' : '還沒有收藏任何店家喔'}</p>
                <p className="text-xs mt-1 opacity-70">{viewMode === 'search' ? '輸入地點或調整篩選條件' : '在搜尋結果中點擊愛心來收藏'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {(viewMode === 'search' ? places : favorites).map(place => {
                  const status = getOpeningStatus(place);
                  const isFav = favorites.some(f => f.id === place.id);
                  
                  return (
                    <div 
                      key={place.id}
                      onClick={() => {
                        setActivePlaceId(place.id);
                        map.panTo(place.location);
                        map.setZoom(17);
                      }}
                      className={`p-4 cursor-pointer transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/10 ${activePlaceId === place.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight pr-8">{place.displayName}</h3>
                        <div className="flex gap-1 shrink-0">
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(place); }} 
                            className={`p-1.5 rounded-full transition-colors ${isFav ? 'text-pink-500 bg-pink-50 dark:bg-pink-900/30' : 'text-gray-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20'}`}
                            title={isFav ? "取消收藏" : "加入收藏"}
                          >
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleCopy(place); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-full transition-colors" title="分享">
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {place.rating && (
                          <div className="flex items-center text-amber-500 font-semibold">
                            <Star className="w-3.5 h-3.5 fill-current mr-1" />
                            {place.rating.toFixed(1)}
                            {place.userRatingCount && <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">({place.userRatingCount})</span>}
                          </div>
                        )}
                        {place.priceLevel != null && (
                          <div className="flex items-center text-gray-500 dark:text-gray-400">
                            <DollarSign className="w-3.5 h-3.5 mr-0.5" />
                            {'$'.repeat(place.priceLevel)}
                          </div>
                        )}
                        {status && (
                          <div className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${status.color}`}>
                            <Clock className="w-3 h-3" />
                            {status.text}
                          </div>
                        )}
                        {distances[place.id] && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                            <Navigation className="w-3 h-3" />
                            步行 {distances[place.id]}
                          </div>
                        )}
                      </div>
                      
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{place.formattedAddress}</p>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleNavigate(place); }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          開始導航
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName)}&query_place_id=${place.id}`, '_blank'); }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          查看詳情
                        </button>
                      </div>
                    </div>
                  );
                })}
                
                {viewMode === 'search' && hasNextPage && (
                  <div className="p-4 flex justify-center">
                    <button
                      onClick={() => performSearch(true)}
                      disabled={isLoadingMore}
                      className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {isLoadingMore ? '載入中...' : '載入更多結果'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        <div className="w-full h-[40vh] md:h-full md:flex-1 relative z-0 order-1 md:order-2 shrink-0">
          <div ref={mapRef} className="w-full h-full bg-gray-200 dark:bg-gray-800" />
          
          {/* Floating Controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <button 
              onClick={() => {
                if (userLocation && map) {
                  map.panTo(userLocation);
                  map.setZoom(15);
                }
              }}
              className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="回到我的位置"
            >
              <Compass className="w-6 h-6" />
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
