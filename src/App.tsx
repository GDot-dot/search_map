import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, Dices, Copy, Star, DollarSign, MapPinOff, MapPin, Check, Compass } from 'lucide-react';

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

export default function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [map, setMap] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [places, setPlaces] = useState<any[]>([]);
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

  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);

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
          zoomControl: true
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
    
    try {
      const { Place } = await window.google.maps.importLibrary("places");
      const baseFields = ['displayName', 'location', 'rating', 'priceLevel', 'formattedAddress', 'id', 'regularOpeningHours', 'businessStatus', 'userRatingCount'];
      
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
        if (searchParams.openNow) request.isOpenNow = true;
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

      const existingIds = isLoadMore ? new Set(places.map(p => p.id)) : new Set();
      const uniqueNew = results.filter((p: any) => !existingIds.has(p.id));

      const filtered = uniqueNew.filter((p: any) => {
        if (searchParams.ratingFilter && p.rating && p.rating < 4.0) return false;
        if (searchParams.price !== 'any') {
          if (p.priceLevel == null || p.priceLevel > parseInt(searchParams.price)) return false;
        }
        if (searchParams.openNow && p.regularOpeningHours && p.regularOpeningHours.openNow === false) return false;
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
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <header className="bg-white px-4 h-14 flex items-center border-b border-gray-200 shrink-0 z-10 shadow-sm">
        <Compass className="w-6 h-6 text-blue-600 mr-2" />
        <h1 className="text-lg font-bold text-gray-800">附近優質店家探測器 V5.0</h1>
      </header>

      <main className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
        <aside className="w-full md:w-[400px] bg-white flex flex-col border-r border-gray-200 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] md:shadow-none flex-1 md:h-full order-2 md:order-1 overflow-hidden">
          
          <div className="md:hidden flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200 shrink-0">
            <span className="font-semibold text-sm text-gray-600">
              {places.length > 0 ? `找到 ${places.length} 間店家` : '設定搜尋條件'}
            </span>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center text-sm text-blue-600 font-medium bg-blue-50 px-3 py-1 rounded-full"
            >
              <Filter className="w-4 h-4 mr-1" />
              {showFilters ? '隱藏篩選' : '展開篩選'}
            </button>
          </div>

          <div className={`flex-col shrink-0 border-b border-gray-200 bg-white transition-all duration-300 overflow-y-auto max-h-[50vh] md:max-h-none ${showFilters ? 'flex' : 'hidden md:flex'}`}>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">搜尋地點</label>
                <div className="relative">
                  <input 
                    ref={searchInputRef}
                    type="text" 
                    placeholder="輸入地址、地標或區域" 
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                  />
                  <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">關鍵字</label>
                  <input 
                    type="text" 
                    value={searchParams.keyword}
                    onChange={e => setSearchParams({...searchParams, keyword: e.target.value})}
                    placeholder="例如: 拉麵" 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">類型</label>
                  <select 
                    value={searchParams.type}
                    onChange={e => setSearchParams({...searchParams, type: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">距離</label>
                  <select 
                    value={searchParams.radius}
                    onChange={e => setSearchParams({...searchParams, radius: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="any">不限</option>
                    <option value="1000">1 km 內</option>
                    <option value="3000">3 km 內</option>
                    <option value="5000">5 km 內</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">價位</label>
                  <select 
                    value={searchParams.price}
                    onChange={e => setSearchParams({...searchParams, price: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                      className="peer appearance-none w-5 h-5 border-2 border-gray-300 rounded bg-white checked:bg-blue-500 checked:border-blue-500 transition-colors cursor-pointer"
                    />
                    <Check className="w-3.5 h-3.5 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">只顯示現在營業中</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <input 
                      type="checkbox" 
                      checked={searchParams.ratingFilter}
                      onChange={e => setSearchParams({...searchParams, ratingFilter: e.target.checked})}
                      className="peer appearance-none w-5 h-5 border-2 border-gray-300 rounded bg-white checked:bg-blue-500 checked:border-blue-500 transition-colors cursor-pointer"
                    />
                    <Check className="w-3.5 h-3.5 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">只顯示 4.0★ 以上店家</span>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
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

              {winner && (
                <div className="mt-4 p-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl text-center">
                  <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">🎉 天選之店</div>
                  <div className="text-lg font-bold text-gray-900">{winner.displayName}</div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-50/50">
            {places.length === 0 && !isSearching ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
                <MapPinOff className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">開始探索附近的店家吧！</p>
                <p className="text-xs mt-1 opacity-70">輸入地點或調整篩選條件</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {places.map(place => (
                  <div 
                    key={place.id}
                    onClick={() => {
                      setActivePlaceId(place.id);
                      map.panTo(place.location);
                      map.setZoom(17);
                    }}
                    className={`p-4 cursor-pointer transition-colors hover:bg-blue-50/50 ${activePlaceId === place.id ? 'bg-blue-50 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-gray-900 text-base leading-tight pr-8">{place.displayName}</h3>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); handleCopy(place); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-full transition-colors">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 mb-2">
                      {place.rating && (
                        <div className="flex items-center text-amber-500 font-semibold">
                          <Star className="w-3.5 h-3.5 fill-current mr-1" />
                          {place.rating.toFixed(1)}
                          {place.userRatingCount && <span className="text-gray-400 font-normal ml-1">({place.userRatingCount})</span>}
                        </div>
                      )}
                      {place.priceLevel != null && (
                        <div className="flex items-center text-gray-500">
                          <DollarSign className="w-3.5 h-3.5 mr-0.5" />
                          {'$'.repeat(place.priceLevel)}
                        </div>
                      )}
                      {place.regularOpeningHours && typeof place.regularOpeningHours.openNow !== 'undefined' && (
                        <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${place.regularOpeningHours.openNow ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {place.regularOpeningHours.openNow ? '營業中' : '已打烊'}
                        </div>
                      )}
                    </div>
                    
                    <p className="text-xs text-gray-500 line-clamp-2">{place.formattedAddress}</p>
                  </div>
                ))}
                
                {hasNextPage && (
                  <div className="p-4 flex justify-center">
                    <button
                      onClick={() => performSearch(true)}
                      disabled={isLoadingMore}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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
          <div ref={mapRef} className="w-full h-full bg-gray-200" />
        </div>

      </main>
    </div>
  );
}
