class RecordsController < ApplicationController
  before_action :authenticate_user!

  def new
    @record = current_user.health_records.build
  end

  def create
    @record = current_user.health_records.build(record_params)
    @record.recorded_at = Time.current

    respond_to do |format|
      if @record.save
        format.html { redirect_to new_record_path, notice: "記録を保存しました！" }
        format.json { render json: @record, status: :created }
      else
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: { errors: @record.errors }, status: :unprocessable_entity }
      end
    end
  end

  def latest
    @record = current_user.health_records.recent.first
    respond_to do |format|
      format.json do
        if @record
          render json: @record
        else
          render json: { message: "No records found" }, status: :not_found
        end
      end
    end
  end

  private

  def record_params
    params.require(:health_record).permit(
      :fatigue_score,
      :mood_score,
      :motivation_score,
      :flags,
      :note,
      :extra_metrics,
      :recorded_at,
      :timezone,
      :device_id,
      :app_version
    )
  end
end
