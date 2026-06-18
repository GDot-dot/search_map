import type { OpeningStatus, ResultTag } from './types';
import { getLatLng, parsePriceLevel } from './placeUtils';

export const getResultTags = (place: any, distanceText?: string) => {
  const tags: ResultTag[] = [];
  const rating = typeof place.rating === 'number' ? place.rating : 0;
  const reviews = typeof place.userRatingCount === 'number' ? place.userRatingCount : 0;
  const minutes = Number(distanceText?.match(/\d+/)?.[0] || 0);

  if (minutes > 0 && minutes <= 10) {
    tags.push({ text: '近', className: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300' });
  }
  if (rating >= 4.3) {
    tags.push({ text: '高評價', className: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300' });
  }
  if (reviews >= 500) {
    tags.push({ text: '很多人評', className: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300' });
  } else if (reviews > 0 && reviews < 100) {
    tags.push({ text: '新發現', className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300' });
  }

  return tags.slice(0, 3);
};

const escapeHtml = (value: any) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const getMapsSearchUrl = (place: any) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName)}&query_place_id=${place.id}`;

export const getMapsDirectionsUrl = (place: any) => {
  const loc = getLatLng(place.location);
  return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
};

const tagClassToInlineStyle = (className: string) => {
  if (className.includes('amber')) return 'color:#b45309;background:#fffbeb;';
  if (className.includes('purple')) return 'color:#7c3aed;background:#f5f3ff;';
  if (className.includes('emerald')) return 'color:#047857;background:#ecfdf5;';
  return 'color:#2563eb;background:#eff6ff;';
};

const statusClassToInlineStyle = (className: string) => {
  if (className.includes('green')) return 'color:#16a34a;background:#f0fdf4;';
  if (className.includes('red')) return 'color:#dc2626;background:#fef2f2;';
  if (className.includes('orange')) return 'color:#ea580c;background:#fff7ed;';
  return 'color:#4b5563;background:#f9fafb;';
};

export const getMapInfoContent = (place: any, options: { distanceText?: string; status?: OpeningStatus; tags?: ResultTag[] } = {}) => {
  const { distanceText, status, tags = [] } = options;
  const rating = typeof place.rating === 'number' ? `${place.rating.toFixed(1)} ★` : '尚無評分';
  const reviews = place.userRatingCount ? ` (${place.userRatingCount})` : '';
  const price = place.priceLevel != null && parsePriceLevel(place.priceLevel) > 0
    ? '$'.repeat(parsePriceLevel(place.priceLevel))
    : '';
  const tagHtml = tags.map(tag => `
    <span style="display:inline-block;${tagClassToInlineStyle(tag.className)}border-radius:999px;padding:2px 7px;font-size:11px;font-weight:700;margin:0 4px 5px 0;">${escapeHtml(tag.text)}</span>
  `).join('');
  const statusHtml = status
    ? `<span style="display:inline-flex;align-items:center;${statusClassToInlineStyle(status.color)}border-radius:999px;padding:2px 7px;font-size:11px;font-weight:700;margin-left:6px;">${escapeHtml(status.text)}</span>`
    : '';

  return `
    <div style="min-width:240px;max-width:310px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
      <div style="font-weight:800;font-size:15px;line-height:1.35;margin-bottom:7px;">${escapeHtml(place.displayName)}</div>
      ${tagHtml ? `<div style="margin-bottom:5px;">${tagHtml}</div>` : ''}
      <div style="font-size:12px;color:#4b5563;margin-bottom:6px;">
        <span style="color:#f59e0b;font-weight:800;">${escapeHtml(rating)}</span>${escapeHtml(reviews)}${price ? ` · ${escapeHtml(price)}` : ''}${distanceText ? ` · 步行 ${escapeHtml(distanceText)}` : ''}${statusHtml}
      </div>
      <div style="font-size:12px;color:#6b7280;line-height:1.45;margin-bottom:11px;">${escapeHtml(place.formattedAddress || '')}</div>
      <div style="display:flex;gap:8px;">
        <a href="${getMapsDirectionsUrl(place)}" target="_blank" rel="noopener noreferrer" style="flex:1;text-align:center;background:#2563eb;color:white;text-decoration:none;padding:7px 8px;border-radius:8px;font-size:12px;font-weight:700;">導航</a>
        <a href="${getMapsSearchUrl(place)}" target="_blank" rel="noopener noreferrer" style="flex:1;text-align:center;border:1px solid #d1d5db;color:#374151;text-decoration:none;padding:7px 8px;border-radius:8px;font-size:12px;font-weight:700;">詳情</a>
      </div>
    </div>
  `;
};

