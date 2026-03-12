export type ItemType = 'slider' | 'checkbox' | 'number' | 'text'
export type ItemMode = 'form' | 'event'

export interface ItemConfig {
  item_id: string
  label:   string
  type:    ItemType
  mode:    ItemMode
  order:   number
  icon?:   string
  min?:    number
  max?:    number
  unit?:   string
}

export interface CustomFieldValue {
  item_id: string
  label:   string
  type:    ItemType
  value:   number | boolean | string
}

export interface HealthRecordInput {
  record_type:      'daily' | 'event'
  fatigue_score?:   number
  mood_score?:      number
  motivation_score?: number
  flags:            number
  note:             string
  recorded_at:      string
  timezone:         string
  device_id:        string
  app_version:      string
  custom_fields:    CustomFieldValue[]
}

export interface EnvDataRecord {
  date:         string
  pressure_hpa: number | null
  pm25:         number | null
}

export interface LatestRecord {
  id:               string
  record_type:      string
  fatigue_score:    string
  mood_score:       string
  motivation_score: string
  flags:            string
  note:             string
  recorded_at:      string
  timezone:         string
  device_id:        string
  app_version:      string
  custom_fields:    string
  written_at:       string
}
