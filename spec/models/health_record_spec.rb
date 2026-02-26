require "rails_helper"

RSpec.describe HealthRecord, type: :model do
  subject(:record) { build(:health_record) }

  describe "associations" do
    it { is_expected.to belong_to(:user) }
  end

  describe "validations" do
    it { is_expected.to be_valid }

    context "score range 0-100" do
      %i[fatigue_score mood_score motivation_score].each do |attr|
        it "rejects #{attr} below 0" do
          record.send(:"#{attr}=", -1)
          expect(record).not_to be_valid
          expect(record.errors[attr]).to be_present
        end

        it "rejects #{attr} above 100" do
          record.send(:"#{attr}=", 101)
          expect(record).not_to be_valid
        end

        it "allows #{attr} of nil" do
          record.send(:"#{attr}=", nil)
          expect(record).to be_valid
        end

        it "allows #{attr} at boundary 0 and 100" do
          record.send(:"#{attr}=", 0)
          expect(record).to be_valid
          record.send(:"#{attr}=", 100)
          expect(record).to be_valid
        end
      end
    end

    context "note length" do
      it "allows up to 280 characters" do
        record.note = "a" * 280
        expect(record).to be_valid
      end

      it "rejects notes longer than 280 characters" do
        record.note = "a" * 281
        expect(record).not_to be_valid
        expect(record.errors[:note]).to be_present
      end
    end

    context "recorded_at" do
      it "requires recorded_at" do
        record.recorded_at = nil
        expect(record).not_to be_valid
        expect(record.errors[:recorded_at]).to be_present
      end

      it "auto-sets recorded_at before validation if blank" do
        new_record = build(:health_record, recorded_at: nil)
        new_record.valid?
        expect(new_record.recorded_at).to be_within(5.seconds).of(Time.current)
      end
    end
  end

  describe "#flag_set?" do
    it "returns true when a flag bit is set" do
      record.flags = HealthRecord::FLAGS[:poor_sleep]
      expect(record.flag_set?(:poor_sleep)).to be true
    end

    it "returns false when the bit is not set" do
      record.flags = 0
      expect(record.flag_set?(:headache)).to be false
    end
  end

  describe "#set_flag" do
    it "sets a flag bit" do
      record.flags = 0
      record.set_flag(:exercise, true)
      expect(record.flag_set?(:exercise)).to be true
    end

    it "clears a flag bit" do
      record.flags = HealthRecord::FLAGS[:alcohol]
      record.set_flag(:alcohol, false)
      expect(record.flag_set?(:alcohol)).to be false
    end
  end

  describe "#flags_list" do
    it "returns list of set flag names" do
      record.flags = HealthRecord::FLAGS[:poor_sleep] | HealthRecord::FLAGS[:headache]
      expect(record.flags_list).to contain_exactly(:poor_sleep, :headache)
    end

    it "returns empty array when no flags" do
      record.flags = 0
      expect(record.flags_list).to be_empty
    end
  end

  describe "scopes" do
    let!(:older) { create(:health_record, recorded_at: 2.hours.ago) }
    let!(:newer) { create(:health_record, recorded_at: 1.hour.ago) }

    it ".recent orders by recorded_at desc" do
      expect(HealthRecord.recent.first).to eq(newer)
    end
  end
end
