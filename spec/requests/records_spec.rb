require "rails_helper"

RSpec.describe "Records", type: :request do
  let(:user) { create(:user) }

  describe "GET /records/new" do
    context "when not authenticated" do
      it "redirects to sign in" do
        get new_record_path
        expect(response).to redirect_to(new_user_session_path)
      end
    end

    context "when authenticated" do
      before { sign_in user }

      it "returns http success" do
        get new_record_path
        expect(response).to have_http_status(:success)
      end
    end
  end

  describe "POST /records" do
    let(:valid_params) do
      {
        health_record: {
          fatigue_score: 60,
          mood_score: 70,
          motivation_score: 80,
          flags: 9,
          note: "Feeling decent today",
          timezone: "Asia/Tokyo",
          device_id: "dev_test123",
          app_version: "1.0.0"
        }
      }
    end

    context "when not authenticated" do
      it "redirects to sign in" do
        post records_path, params: valid_params
        expect(response).to redirect_to(new_user_session_path)
      end
    end

    context "when authenticated" do
      before { sign_in user }

      it "creates a health record and redirects" do
        expect {
          post records_path, params: valid_params
        }.to change(HealthRecord, :count).by(1)
        expect(response).to redirect_to(new_record_path)
      end

      it "associates the record with current user" do
        post records_path, params: valid_params
        expect(HealthRecord.last.user).to eq(user)
      end

      it "returns 201 for JSON request" do
        post records_path, params: valid_params, as: :json
        expect(response).to have_http_status(:created)
        expect(response.parsed_body["fatigue_score"]).to eq(60)
      end

      context "with invalid params" do
        let(:invalid_params) do
          { health_record: { fatigue_score: 999, note: "a" * 281 } }
        end

        it "returns unprocessable entity for JSON" do
          post records_path, params: invalid_params, as: :json
          expect(response).to have_http_status(:unprocessable_entity)
          expect(response.parsed_body["errors"]).to be_present
        end
      end
    end
  end

  describe "GET /records/latest" do
    context "when authenticated" do
      before { sign_in user }

      it "returns the most recent record as JSON" do
        record = create(:health_record, user: user, recorded_at: 1.hour.ago)
        get latest_records_path, as: :json
        expect(response).to have_http_status(:success)
        expect(response.parsed_body["id"]).to eq(record.id)
      end

      it "returns 404 when no records exist" do
        get latest_records_path, as: :json
        expect(response).to have_http_status(:not_found)
      end
    end
  end
end
