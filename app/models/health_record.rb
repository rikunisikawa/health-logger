class HealthRecord < ApplicationRecord
  belongs_to :user

  FLAGS = {
    poor_sleep:   0b00000001,
    headache:     0b00000010,
    stomachache:  0b00000100,
    exercise:     0b00001000,
    alcohol:      0b00010000,
    caffeine:     0b00100000
  }.freeze

  validates :fatigue_score,    numericality: { in: 0..100, allow_nil: true }
  validates :mood_score,       numericality: { in: 0..100, allow_nil: true }
  validates :motivation_score, numericality: { in: 0..100, allow_nil: true }
  validates :note, length: { maximum: 280 }
  validates :recorded_at, presence: true

  before_validation :set_recorded_at_default

  scope :recent, -> { order(recorded_at: :desc) }
  scope :today, -> { where(recorded_at: Time.current.beginning_of_day..Time.current.end_of_day) }

  def flag_set?(flag_name)
    flag_bit = FLAGS[flag_name.to_sym]
    return false unless flag_bit

    (flags.to_i & flag_bit) != 0
  end

  def set_flag(flag_name, value)
    flag_bit = FLAGS[flag_name.to_sym]
    return unless flag_bit

    if value
      self.flags = (flags.to_i | flag_bit)
    else
      self.flags = (flags.to_i & ~flag_bit)
    end
  end

  def flags_list
    FLAGS.filter_map { |name, bit| name if (flags.to_i & bit) != 0 }
  end

  private

  def set_recorded_at_default
    self.recorded_at ||= Time.current
  end
end
