import React, { useState, useEffect, useRef } from 'react';
import { DARK_MAP_STYLE } from './lib/darkMapStyle';
import { getMapInfoContent, getMapsSearchUrl, getResultTags } from './lib/mapInfoCard';
import { checkIsOpenNow, getDistanceMeters, getLatLng, getOpeningStatus, normalizePlaceForStorage, parsePriceLevel } from './lib/placeUtils';
import { DEFAULT_RADIUS_METERS, MAX_INITIAL_SEARCH_REQUESTS, MAX_LOAD_MORE_SEARCH_REQUESTS, MAX_LOAD_MORE_ROUNDS, MAX_NO_CHANGE_ROUNDS, SCENARIOS, getKeywordVariants, getSearchCenters, getTypeVariants, getWeightedRandom, scorePlace } from './lib/searchStrategy';
import type { ScenarioId, SearchParams } from './lib/types';
import { Search, Filter, Dices, Copy, Star, MapPinOff, MapPin, Check, Compass, Heart, Navigation, Moon, Sun, Clock, ExternalLink } from 'lucide-react';

declare global {
  interface Window {
    google: any;
  }
}

export default function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [map, setMap] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [places, setPlaces] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('favorites');
      return saved ? JSON.parse(saved).map(normalizePlaceForStorage) : [];
    } catch {
      return [];
    }
  });
  const [distances, setDistances] = useState<Record<string, string>>({});
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchCenterLabel, setSearchCenterLabel] = useState('正在取得位置');
  const [activeScenario, setActiveScenario] = useState<ScenarioId | null>(null);
  const [loadMoreRound, setLoadMoreRound] = useState(0);
  const [noChangeRounds, setNoChangeRounds] = useState(0);
  const [searchStats, setSearchStats] = useState({ requests: 0, results: 0, added: 0, round: 0, noChangeRounds: 0, message: '' });
  const [searchParams, setSearchParams] = useState<SearchParams>({
    keyword: '',
    type: 'restaurant',
    radius: String(DEFAULT_RADIUS_METERS),
    price: 'any',
    openNow: false,
    ratingFilter: false,
    hiddenGem: false,
  });
  const [winner, setWinner] = useState<any>(null);
  const [lastWinnerId, setLastWinnerId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState<'search' | 'favorites'>('search');

  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const markersRef = useRef<Array<{ id: string; marker: any; element: HTMLElement }>>([]);
  const placeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const userMarkerRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const searchRunRef = useRef(0);

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
              setSearchCenterLabel('我的目前位置');
              newMap.setCenter(loc);
              
              const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary("marker");
              const pin = new PinElement({ background: '#4285F4', borderColor: '#FFFFFF', glyphColor: '#FFFFFF' });
              userMarkerRef.current = new AdvancedMarkerElement({
                map: newMap, position: loc, title: "您的位置", content: pin.element, zIndex: 99
              });
            },
            () => {
              setUserLocation(defaultCenter);
              setSearchCenterLabel('台北車站附近');
            },
            { timeout: 10000, enableHighAccuracy: true }
          );
        } else {
          setUserLocation(defaultCenter);
          setSearchCenterLabel('台北車站附近');
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
        fields: ["geometry", "name", "formatted_address"],
        types: ["establishment", "geocode"]
      });

      autocomplete.addListener('place_changed', async () => {
        const place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
          const loc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
          setUserLocation(loc);
          setSearchCenterLabel(place.name || place.formatted_address || '自訂搜尋中心');
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

  const refreshMarkerFocus = (placeId: string | null) => {
    markersRef.current.forEach(({ id, marker, element }) => {
      const isActive = id === placeId;
      element.style.transform = isActive ? 'scale(1.22)' : 'scale(1)';
      element.style.transition = 'transform 160ms ease';
      marker.zIndex = isActive ? 80 : undefined;
    });
  };

  const focusPlace = (place: any, options: { scrollList?: boolean; zoom?: number } = {}) => {
    if (!place) return;
    const loc = getLatLng(place.location);
    setActivePlaceId(place.id);

    if (map && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      map.panTo(loc);
      map.setZoom(options.zoom ?? 17);
    }

    if (options.scrollList) {
      requestAnimationFrame(() => {
        placeRefs.current[place.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    const markerEntry = markersRef.current.find(entry => entry.id === place.id);
    if (markerEntry && infoWindowRef.current && map) {
      infoWindowRef.current.setContent(getMapInfoContent(place, {
        distanceText: distances[place.id],
        status: getOpeningStatus(place),
        tags: getResultTags(place, distances[place.id]),
      }));
      infoWindowRef.current.open({ anchor: markerEntry.marker, map });
    }
  };

  useEffect(() => {
    refreshMarkerFocus(activePlaceId);
  }, [activePlaceId]);

  const updateMarkers = async (newPlaces: any[]) => {
    markersRef.current.forEach(({ marker }) => { marker.map = null; });
    markersRef.current = [];

    if (!window.google || newPlaces.length === 0) return;
    const { AdvancedMarkerElement, PinElement } = await window.google.maps.importLibrary("marker");
    const { InfoWindow } = await window.google.maps.importLibrary("maps");
    if (!infoWindowRef.current) {
      infoWindowRef.current = new InfoWindow();
    }

    newPlaces.forEach(place => {
      const pin = new PinElement({ background: '#EA4335', borderColor: '#FFFFFF', glyphColor: '#FFFFFF' });
      const marker = new AdvancedMarkerElement({
        map,
        position: place.location,
        title: place.displayName,
        content: pin.element
      });
      
      marker.addListener('click', () => {
        focusPlace(place, { scrollList: true, zoom: 17 });
      });
      
      markersRef.current.push({ id: place.id, marker, element: pin.element });
    });

    refreshMarkerFocus(activePlaceId);
  };

  const performSearch = async (isLoadMore = false) => {
    if (!userLocation || !map) return;
    const searchRunId = ++searchRunRef.current;
    if (isLoadMore) setIsLoadingMore(true);
    else setIsSearching(true);
    
    setWinner(null);
    setViewMode('search');
    setHasSearched(true);
    if (!isLoadMore) {
      setDistances({});
      setHasNextPage(false);
      setLoadMoreRound(0);
      setNoChangeRounds(0);
      setSearchStats({ requests: 0, results: 0, added: 0, round: 0, noChangeRounds: 0, message: '' });
    }
    
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
        'currentOpeningHours',
        'businessStatus', 
        'userRatingCount'
      ];

      const radius = parseInt(searchParams.radius);
      const nextRound = isLoadMore ? Math.min(loadMoreRound + 1, MAX_LOAD_MORE_ROUNDS) : 0;
      const centers = getSearchCenters(userLocation, radius, nextRound);
      const maxRequests = isLoadMore ? MAX_LOAD_MORE_SEARCH_REQUESTS : MAX_INITIAL_SEARCH_REQUESTS;
      const tasks: any[] = [];

      if (searchParams.keyword.trim()) {
        const keywordVariants = getKeywordVariants(searchParams.keyword, searchParams.type, isLoadMore);
        if (isLoadMore) {
          centers.slice(1).forEach(center => {
            tasks.push({ kind: 'text', query: keywordVariants[0], center });
          });
          keywordVariants.slice(1).forEach(query => {
            tasks.push({ kind: 'text', query, center: centers[0] });
          });
        } else {
          keywordVariants.forEach(query => {
            tasks.push({ kind: 'text', query, center: centers[0] });
          });
          centers.slice(1).forEach(center => {
            tasks.push({ kind: 'text', query: keywordVariants[0], center });
          });
        }
      } else {
        const typeVariants = getTypeVariants(searchParams.type, isLoadMore);
        if (isLoadMore) {
          centers.slice(1).forEach(center => {
            tasks.push({ kind: 'nearby', type: searchParams.type, center });
          });
          typeVariants.slice(1).forEach(type => {
            tasks.push({ kind: 'nearby', type, center: centers[0] });
          });
        } else {
          typeVariants.forEach(type => {
            tasks.push({ kind: 'nearby', type, center: centers[0] });
          });
          centers.slice(1).forEach(center => {
            tasks.push({ kind: 'nearby', type: searchParams.type, center });
          });
        }
      }

      const selectedTasks = tasks.slice(0, maxRequests);
      const resultBuckets: any[] = [];
      let executedSearches = 0;
      let fullResultResponses = 0;

      for (const task of selectedTasks) {
        if (searchRunRef.current !== searchRunId) return;

        try {
          let response: any;
          if (task.kind === 'text') {
            const request: any = {
              fields: baseFields,
              textQuery: task.query,
              maxResultCount: 20,
              locationBias: { center: task.center, radius },
            };
            if (searchParams.hiddenGem) {
              request.rankPreference = 'DISTANCE';
            }
            response = await Place.searchByText(request);
          } else {
            const request: any = {
              fields: baseFields,
              includedTypes: [task.type],
              maxResultCount: 20,
              locationRestriction: { center: task.center, radius },
            };
            if (searchParams.hiddenGem) {
              request.rankPreference = 'DISTANCE';
            }
            response = await Place.searchNearby(request);
          }

          executedSearches += 1;
          const taskPlaces = response.places || [];
          if (taskPlaces.length === 20) fullResultResponses += 1;
          taskPlaces.forEach((place: any) => {
            resultBuckets.push({ place, score: scorePlace(place, userLocation) });
          });
        } catch (taskError) {
          executedSearches += 1;
          console.warn('A Places search task failed', task, taskError);
        }
      }

      const bestById = new Map<string, any>();
      resultBuckets.forEach(({ place, score }) => {
        if (!place.id) return;
        const existing = bestById.get(place.id);
        if (!existing || score > existing.score) {
          bestById.set(place.id, { place, score });
        }
      });

      const results = Array.from(bestById.values())
        .sort((a, b) => b.score - a.score)
        .map(item => item.place);
      const currentHasNextPage = (fullResultResponses > 0 || tasks.length > selectedTasks.length);

      const existingIds = isLoadMore ? new Set(places.map(p => p.id)) : new Set();
      const uniqueNew = results.filter((p: any) => !existingIds.has(p.id));

      const filtered = uniqueNew.filter((p: any) => {
        if (p.location && getDistanceMeters(userLocation, p.location) > radius * 1.35) return false;
        if (searchParams.ratingFilter && p.rating && p.rating < 4.0) return false;
        if (searchParams.hiddenGem && p.userRatingCount && p.userRatingCount > 1000) return false;
        if (searchParams.price !== 'any') {
          const pLevel = parsePriceLevel(p.priceLevel);
          // Only filter out if we strictly know it exceeds the requested price level.
          // Keep -1 (unknowns) or matching levels. Avoid eliminating places just because price is unlisted.
          if (pLevel !== -1 && pLevel > parseInt(searchParams.price)) return false;
        }
        if (searchParams.openNow) {
          // If openNow is checked, only show if we are sure it's open
          const isOpen = checkIsOpenNow(p);
          if (isOpen === false || isOpen === null) return false;
        }
        return true;
      });

      const combined = isLoadMore ? [...places, ...filtered] : filtered;
      const addedCount = filtered.length;
      const nextNoChangeRounds = isLoadMore
        ? (addedCount === 0 ? noChangeRounds + 1 : 0)
        : 0;
      const reachedMaxRound = nextRound >= MAX_LOAD_MORE_ROUNDS;
      const reachedNoChangeLimit = nextNoChangeRounds >= MAX_NO_CHANGE_ROUNDS;
      const shouldOfferMore = currentHasNextPage && !reachedMaxRound && !reachedNoChangeLimit;
      const searchMessage = reachedNoChangeLimit
        ? `已連續 ${MAX_NO_CHANGE_ROUNDS} 輪沒有新增店家，附近結果可能已接近極限`
        : reachedMaxRound
          ? '已達這次搜尋的安全上限，可放寬距離或換關鍵字再找'
          : isLoadMore && addedCount === 0
            ? `這一輪沒有新增店家，再試 ${MAX_NO_CHANGE_ROUNDS - nextNoChangeRounds} 輪沒有變化就會停止`
            : '';
      if (searchRunRef.current !== searchRunId) return;
      setPlaces(combined);
      updateMarkers(combined);
      setHasNextPage(shouldOfferMore);
      setLoadMoreRound(nextRound);
      setNoChangeRounds(nextNoChangeRounds);
      setSearchStats(prev => ({
        requests: isLoadMore ? prev.requests + executedSearches : executedSearches,
        results: combined.length,
        added: addedCount,
        round: nextRound,
        noChangeRounds: nextNoChangeRounds,
        message: searchMessage,
      }));

      // Manual distance calculation (straight line estimate to start with)
      const newDistances: Record<string, string> = {};
      filtered.forEach((p: any) => {
        if (p.location && userLocation) {
          const distance = getDistanceMeters(userLocation, p.location);
          // Estimate walking time (approx 80m per minute)
          const minutes = Math.ceil((distance * 1.3) / 80); // 1.3 factor for actual walking path vs straight line
          newDistances[p.id] = `約 ${minutes} 分鐘`;
        }
      });
      setDistances(prev => ({ ...prev, ...newDistances }));

      // Fetch accurate walking distances from BRouter asynchronously.
      const fetchBrouterDistances = async () => {
        for (const p of filtered) {
          if (searchRunRef.current !== searchRunId) return;
          if (p.location && userLocation) {
            try {
              const lon1 = userLocation.lng.toFixed(6);
              const lat1 = userLocation.lat.toFixed(6);
              const { lat: lat2Num, lng: lon2Num } = getLatLng(p.location);
              const lon2 = lon2Num.toFixed(6);
              const lat2 = lat2Num.toFixed(6);
              const brouterUrl = `https://brouter.de/brouter?lonlats=${lon1},${lat1}|${lon2},${lat2}&profile=foot&alternativeidx=0&format=geojson`;
              
              const res = await fetch(brouterUrl);
              const data = await res.json();
              
              if (searchRunRef.current !== searchRunId) return;
              if (data && data.features && data.features[0] && data.features[0].properties) {
                 const seconds = data.features[0].properties['total-time'];
                 if (seconds > 0) {
                    const minutes = Math.ceil(seconds / 60);
                    setDistances(prev => ({ ...prev, [p.id]: `${minutes} 分鐘` }));
                 }
              }
            } catch (e) {
              console.warn("Brouter API failed for", p.id);
            }
            // Add a small delay between requests to avoid rate limiting.
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      };
      
      // Run it in the background.
      fetchBrouterDistances();
      
      if (!isLoadMore) {
        setShowFilters(false);
      }

    } catch (error) {
      if (searchRunRef.current !== searchRunId) return;
      console.error("Search failed", error);
      alert("搜尋失敗，請稍後再試");
    } finally {
      if (searchRunRef.current === searchRunId) {
        if (isLoadMore) setIsLoadingMore(false);
        else setIsSearching(false);
      }
    }
  };

  const toggleFavorite = (place: any) => {
    setFavorites(prev => {
      const isFav = prev.some(f => f.id === place.id);
      if (isFav) {
        return prev.filter(f => f.id !== place.id);
      } else {
        return [...prev, normalizePlaceForStorage(place)];
      }
    });
  };

  const resetSearchProgress = () => {
    setHasNextPage(false);
    setLoadMoreRound(0);
    setNoChangeRounds(0);
    setSearchStats({ requests: 0, results: places.length, added: 0, round: 0, noChangeRounds: 0, message: '' });
  };

  const updateSearchParams = (patch: Partial<SearchParams>) => {
    setActiveScenario(null);
    setSearchParams(prev => ({ ...prev, ...patch }));
    resetSearchProgress();
  };

  const applyScenario = (scenarioId: ScenarioId) => {
    const scenario = SCENARIOS.find(item => item.id === scenarioId);
    if (!scenario) return;

    setActiveScenario(prev => prev === scenarioId ? null : scenarioId);
    setSearchParams(prev => {
      if (activeScenario === scenarioId) {
        return {
          ...prev,
          openNow: false,
          ratingFilter: false,
          hiddenGem: false,
          price: 'any',
          keyword: scenarioId === 'coffee_dessert' ? '' : prev.keyword,
          type: scenarioId === 'coffee_dessert' ? 'restaurant' : prev.type,
          radius: scenarioId === 'walkable' || scenarioId === 'coffee_dessert' ? String(DEFAULT_RADIUS_METERS) : prev.radius,
        };
      }

      return { ...prev, ...scenario.params };
    });
    resetSearchProgress();
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

    const openCandidates = places.filter(place => checkIsOpenNow(place) !== false);
    const baseCandidates = openCandidates.length >= 3 ? openCandidates : places;
    const candidates = baseCandidates.length > 1
      ? baseCandidates.filter(place => place.id !== lastWinnerId)
      : baseCandidates;
    const w = getWeightedRandom(candidates, (place) => {
      const rating = typeof place.rating === 'number' ? place.rating : 3.5;
      const reviews = typeof place.userRatingCount === 'number' ? place.userRatingCount : 0;
      const distanceText = distances[place.id] || '';
      const minutesMatch = distanceText.match(/\d+/);
      const minutes = minutesMatch ? Number(minutesMatch[0]) : 20;
      const openBonus = checkIsOpenNow(place) === true ? 18 : 0;
      const ratingWeight = Math.max((rating - 3) * 18, 6);
      const reviewWeight = Math.min(Math.log10(reviews + 1) * 8, 24);
      const distanceWeight = Math.max(30 - minutes, 4);
      return openBonus + ratingWeight + reviewWeight + distanceWeight;
    });
    if (!w) return;

    setWinner(w);
    setLastWinnerId(w.id);
    
    // Bring winner to the top
    setPlaces(prev => {
      const others = prev.filter(p => p.id !== w.id);
      return [w, ...others];
    });

    setActivePlaceId(w.id);
    
    if (map) {
      focusPlace(w, { scrollList: false, zoom: 17 });
    }
    
    // Scroll list to top
    const listElement = document.getElementById('places-list');
    if (listElement) listElement.scrollTop = 0;
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
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">附近優質店家探測器 V5.5</h1>
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

          {/* Search Actions & Winner Box - ALWAYS VISIBLE */}
          {viewMode === 'search' && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col gap-3 shrink-0 shadow-sm z-10">
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
                  title="智慧抽選：優先營業中、距離近、評價高的店"
                >
                  <Dices className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-3 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center transition-colors shadow-sm border ${
                    showFilters
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  title={showFilters ? '隱藏篩選' : '展開篩選'}
                >
                  <Filter className="w-5 h-5" />
                </button>
              </div>

              {hasSearched && viewMode === 'search' && (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <div className="flex items-center justify-between">
                    <span>{isSearching ? '正在擴大掃描附近店家...' : `已掃描 ${searchStats.requests} 次，整理出 ${searchStats.results} 間`}</span>
                    <span className="text-gray-400 dark:text-gray-500">深度搜尋</span>
                  </div>
                  {!isSearching && searchStats.round > 0 && (
                    <div>已追加搜尋 {searchStats.round}/{MAX_LOAD_MORE_ROUNDS} 輪</div>
                  )}
                  {!isSearching && searchStats.added > 0 && (
                    <div className="text-green-600 dark:text-green-400">本輪新增 {searchStats.added} 間店家</div>
                  )}
                  {!isSearching && searchStats.message && (
                    <div className="text-amber-600 dark:text-amber-400">{searchStats.message}</div>
                  )}
                </div>
              )}

              {winner && (
                <div className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-center">
                  <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">🎉 智慧抽選</div>
                  <div className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
                    {winner.displayName}
                  </div>
                  <div className="mt-3 flex gap-2 justify-center">
                    <button 
                      onClick={() => {
                        focusPlace(winner, { scrollList: true, zoom: 17 });
                      }}
                      className="px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shadow-sm"
                    >
                      📍 地圖
                    </button>
                    <button 
                      onClick={() => {
                         const loc = getLatLng(winner.location);
                         window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`, '_blank');
                      }}
                      className="px-3 py-1.5 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
                    >
                      🧭 導航前往
                    </button>
                  </div>
                </div>
              )}
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
            <div className={`flex-col shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-all duration-300 overflow-y-auto max-h-[60vh] md:max-h-[46vh] ${showFilters ? 'flex' : 'hidden'}`}>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">搜尋中心</label>
                  <div className="relative">
                    <input 
                      ref={searchInputRef}
                      type="text" 
                      placeholder="輸入目前位置、地址或商圈"
                      className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow dark:text-gray-100"
                    />
                    <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                  <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    目前以 <span className="font-semibold text-blue-600 dark:text-blue-400">{searchCenterLabel}</span> 為中心
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">一鍵情境</label>
                  <div className="flex flex-wrap gap-2">
                    {SCENARIOS.map(scenario => (
                      <button
                        key={scenario.id}
                        type="button"
                        onClick={() => applyScenario(scenario.id)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          activeScenario === scenario.id
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300'
                        }`}
                      >
                        {scenario.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">想找什麼</label>
                    <input 
                      type="text" 
                      value={searchParams.keyword}
                      onChange={e => updateSearchParams({ keyword: e.target.value })}
                      placeholder="例如：拉麵、甜點、咖啡"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">類型</label>
                    <select 
                      value={searchParams.type}
                      onChange={e => updateSearchParams({ type: e.target.value })}
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
                      onChange={e => updateSearchParams({ radius: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-100"
                    >
                      <option value="1000">1 km 內</option>
                      <option value="3000">3 km 內</option>
                      <option value="5000">5 km 內</option>
                      <option value="10000">10 km 內</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">價位</label>
                    <select 
                      value={searchParams.price}
                      onChange={e => updateSearchParams({ price: e.target.value })}
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
                        onChange={e => updateSearchParams({ openNow: e.target.checked })}
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
                        onChange={e => updateSearchParams({ ratingFilter: e.target.checked })}
                        className="peer appearance-none w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 checked:bg-blue-500 checked:border-blue-500 transition-colors cursor-pointer"
                      />
                      <Check className="w-3.5 h-3.5 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">只顯示 4.0★ 以上店家</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <input 
                        type="checkbox" 
                        checked={searchParams.hiddenGem}
                        onChange={e => updateSearchParams({ hiddenGem: e.target.checked })}
                        className="peer appearance-none w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 checked:bg-blue-500 checked:border-blue-500 transition-colors cursor-pointer"
                      />
                      <Check className="w-3.5 h-3.5 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">發掘隱藏小店 (&lt;1000評論)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div id="places-list" className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/50">
            {(viewMode === 'search' ? places : favorites).length === 0 && !isSearching ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400 dark:text-gray-600">
                {viewMode === 'search' ? <MapPinOff className="w-12 h-12 mb-3 opacity-50" /> : <Heart className="w-12 h-12 mb-3 opacity-50" />}
                <p className="text-sm font-medium">{viewMode === 'search' ? (hasSearched ? '沒有找到符合條件的店家' : '開始探索附近的店家吧！') : '還沒有收藏任何店家喔'}</p>
                <p className="text-xs mt-1 opacity-70">{viewMode === 'search' ? (hasSearched ? '可以放寬距離、價位或關閉篩選再試一次' : '設定地點和關鍵字後開始搜尋') : '在搜尋結果中點擊愛心來收藏'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {(viewMode === 'search' ? places : favorites).map(place => {
                  const status = getOpeningStatus(place);
                  const isFav = favorites.some(f => f.id === place.id);
                  const resultTags = getResultTags(place, distances[place.id]);
                  
                  return (
                    <div 
                      key={place.id}
                      ref={el => { placeRefs.current[place.id] = el; }}
                      onClick={() => {
                        focusPlace(place, { scrollList: false, zoom: 17 });
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

                      {resultTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {resultTags.map(tag => (
                            <span key={tag.text} className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${tag.className}`}>
                              {tag.text}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {place.rating && (
                          <div className="flex items-center text-amber-500 font-semibold">
                            <Star className="w-3.5 h-3.5 fill-current mr-1" />
                            {place.rating.toFixed(1)}
                            {place.userRatingCount && <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">({place.userRatingCount})</span>}
                          </div>
                        )}
                        {place.priceLevel != null && parsePriceLevel(place.priceLevel) > 0 && (
                          <div className="flex items-center text-gray-500 dark:text-gray-400">
                            {'$'.repeat(parsePriceLevel(place.priceLevel))}
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
                      {isLoadingMore ? '載入中...' : `再找一輪 ${Math.min(loadMoreRound + 1, MAX_LOAD_MORE_ROUNDS)}/${MAX_LOAD_MORE_ROUNDS}`}
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
