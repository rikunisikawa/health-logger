class RecordsController < ApplicationController
  before_action :http_authenticate!

  def new
    @record = HealthRecord.new
  end

  def create
    @record = HealthRecord.new(record_params.merge(
      recorded_at: Time.current,
      user_id:     session[:user_id]
    ))

    respond_to do |format|
      if @record.save_to_s3
        format.html { redirect_to new_record_path, notice: "記録を保存しました！" }
        format.json { render json: @record.to_h, status: :created }
      else
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: { errors: @record.errors }, status: :unprocessable_entity }
      end
    end
  end

  def latest
    record = S3Client.latest_for(session[:user_id])
    respond_to do |format|
      format.json do
        if record
          render json: record
        else
          render json: { message: "No records found" }, status: :not_found
        end
      end
    end
  end

  private

  def record_params
    params.require(:health_record).permit(
      :fatigue_score, :mood_score, :motivation_score,
      :flags, :note, :timezone, :device_id, :app_version
    )
  end
end
