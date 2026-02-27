class HealthRecord
  include ActiveModel::Model
  include ActiveModel::Validations
  include ActiveModel::Serialization

  ATTRS = %i[
    fatigue_score mood_score motivation_score
    flags note extra_metrics
    recorded_at timezone device_id app_version user_id
  ].freeze

  FLAGS = {
    poor_sleep:   0b00000001,
    headache:     0b00000010,
    stomachache:  0b00000100,
    exercise:     0b00001000,
    alcohol:      0b00010000,
    caffeine:     0b00100000
  }.freeze

  attr_accessor(*ATTRS)

  validates :fatigue_score,    numericality: { in: 0..100, allow_nil: true }
  validates :mood_score,       numericality: { in: 0..100, allow_nil: true }
  validates :motivation_score, numericality: { in: 0..100, allow_nil: true }
  validates :note,             length: { maximum: 280 }
  validates :recorded_at,      presence: true

  def initialize(attrs = {})
    super
    self.recorded_at ||= Time.current
    self.flags       = flags.to_i
    self.extra_metrics ||= {}
  end

  # S3へJSON Lines形式で書き込む
  def save_to_s3
    return false unless valid?

    key = s3_key
    S3Client.put_json_line(key, to_h)
    true
  rescue Aws::S3::Errors::ServiceError => e
    Rails.logger.error "[HealthRecord] S3 write failed: #{e.message}"
    errors.add(:base, "保存に失敗しました。しばらくしてから再試行してください。")
    false
  end

  def flag_set?(flag_name)
    (flags.to_i & FLAGS[flag_name.to_sym].to_i) != 0
  end

  def flags_list
    FLAGS.filter_map { |name, bit| name if (flags.to_i & bit) != 0 }
  end

  def to_h
    {
      id:               SecureRandom.uuid,
      user_id:          user_id,
      fatigue_score:    fatigue_score&.to_i,
      mood_score:       mood_score&.to_i,
      motivation_score: motivation_score&.to_i,
      flags:            flags.to_i,
      flags_list:       flags_list,
      note:             note,
      extra_metrics:    extra_metrics || {},
      recorded_at:      recorded_at.iso8601,
      timezone:         timezone,
      device_id:        device_id,
      app_version:      app_version,
      written_at:       Time.current.iso8601
    }
  end

  private

  def s3_key
    date = (recorded_at || Time.current).strftime("%Y-%m-%d")
    uuid = SecureRandom.uuid
    "health_logs/dt=#{date}/#{uuid}.jsonl"
  end
end
