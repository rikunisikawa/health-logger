export type ItemType = "slider" | "checkbox" | "number" | "text";
export type ItemMode = "form" | "event" | "status";

export interface ItemConfig {
  item_id: string;
  label: string;
  type: ItemType;
  mode: ItemMode;
  order: number;
  icon?: string;
  min?: number;
  max?: number;
  unit?: string;
}

export interface CustomFieldValue {
  item_id: string;
  label: string;
  type: ItemType;
  value: number | boolean | string;
}

export interface HealthRecordInput {
  record_type: "daily" | "event" | "status";
  fatigue_score?: number;
  mood_score?: number;
  motivation_score?: number;
  concentration_score?: number;
  flags: number;
  note: string;
  recorded_at: string;
  timezone: string;
  device_id: string;
  app_version: string;
  custom_fields: CustomFieldValue[];
}

export interface EnvDataRecord {
  date: string;
  pressure_hpa: number | null;
  pm25: number | null;
}

export interface SummaryDay {
  date: string;
  avg_fatigue: string | null;
  max_fatigue: string | null;
  min_fatigue: string | null;
  avg_mood: string | null;
  max_mood: string | null;
  min_mood: string | null;
  avg_motivation: string | null;
  max_motivation: string | null;
  min_motivation: string | null;
  record_count: string | null;
}

export interface WeeklySummaryResponse {
  summaries: SummaryDay[];
}

export interface LatestRecord {
  id: string;
  record_type: string;
  fatigue_score: string;
  mood_score: string;
  motivation_score: string;
  concentration_score: string;
  flags: string;
  note: string;
  recorded_at: string;
  timezone: string;
  device_id: string;
  app_version: string;
  custom_fields: string;
  written_at: string;
}

export type CorrelationItem =
  | "fatigue"
  | "mood"
  | "motivation"
  | "poor_sleep"
  | "headache"
  | "stomachache"
  | "exercise"
  | "alcohol"
  | "caffeine";

export interface CorrelationResponse {
  items: CorrelationItem[];
  matrix: Record<string, Record<string, number | null>>;
  sample_counts: Record<string, number>;
}

export type NextDayEventType = "exercise" | "alcohol" | "caffeine";

export interface NextDayGroup {
  avg_fatigue: number;
  avg_mood: number;
  avg_motivation: number;
  n: number;
}

export interface NextDayInsight {
  event: NextDayEventType;
  with_event: NextDayGroup;
  without_event: NextDayGroup;
}

export interface NextDayEffectsResponse {
  insights: NextDayInsight[];
}
