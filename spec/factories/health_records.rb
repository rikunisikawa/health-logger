FactoryBot.define do
  factory :health_record do
    association :user
    fatigue_score { 50 }
    mood_score { 60 }
    motivation_score { 70 }
    flags { 0 }
    note { "Today felt okay." }
    extra_metrics { {} }
    recorded_at { Time.current }
    timezone { "Asia/Tokyo" }
    device_id { "dev_abc123" }
    app_version { "1.0.0" }
  end
end
