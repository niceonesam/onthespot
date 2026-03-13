export type SpotVisibility = "public" | "friends" | "private" | "group";

export type Spot = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  tags?: string[] | null;
  photo_url: string | null;
  photo_path: string | null;
  what3words: string | null;
  date_start: string | null;
  source_url: string | null;
  created_at: string;
  visibility: SpotVisibility;
  group_id: string | null;
  distance_m: number;
  lat_out: number;
  lng_out: number;
  is_imported: boolean;
  time_scale_out?: "human" | "ancient" | "geological" | string | null;
  years_ago_start_out?: number | null;
  years_ago_end_out?: number | null;
  period_label_out?: string | null;
};

export type SpotCategory = {
  id: string;
  label: string;
};