export interface HealthRecordInput {
  fatigue_score:    number
  mood_score:       number
  motivation_score: number
  flags:            number
  note:             string
  recorded_at:      string
  timezone:         string
  device_id:        string
  app_version:      string
}

export interface LatestRecord {
  id:               string
  fatigue_score:    string
  mood_score:       string
  motivation_score: string
  flags:            string
  note:             string
  recorded_at:      string
  timezone:         string
  device_id:        string
  app_version:      string
  written_at:       string
  dt:               string
}
