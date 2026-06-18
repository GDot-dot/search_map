export interface SearchParams {
  keyword: string;
  type: string;
  radius: string;
  price: string;
  openNow: boolean;
  ratingFilter: boolean;
  hiddenGem: boolean;
}

export type ScenarioId =
  | 'open_now'
  | 'walkable'
  | 'high_rating'
  | 'budget'
  | 'hidden_gem'
  | 'coffee_dessert';

export type ResultTag = {
  text: string;
  className: string;
};

export type OpeningStatus = {
  isOpen: boolean;
  text: string;
  color: string;
} | null;
