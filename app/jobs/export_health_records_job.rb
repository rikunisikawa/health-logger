require "aws-sdk-s3"
require "json"

# Exports HealthRecord rows to S3 as JSON Lines, partitioned by date.
#
# S3 path pattern:
#   s3://<bucket>/health_logs/dt=YYYY-MM-DD/records.jsonl
#
# Scheduled via EventBridge rule (1-hour cadence) → ECS RunTask or
# directly via Solid Queue with a recurring job definition.
#
# Usage:
#   ExportHealthRecordsJob.perform_later                    # export today
#   ExportHealthRecordsJob.perform_later(date: "2026-01-15") # specific date
class ExportHealthRecordsJob < ApplicationJob
  queue_as :exports

  # Retry on transient S3/network failures, back off exponentially
  retry_on Aws::S3::Errors::ServiceError, wait: :polynomially_longer, attempts: 3
  retry_on StandardError, wait: 5.seconds, attempts: 2

  def perform(date: Date.current.to_s)
    target_date = Date.parse(date.to_s)
    bucket      = ENV.fetch("S3_EXPORT_BUCKET")
    s3_key      = "health_logs/dt=#{target_date}/records.jsonl"

    Rails.logger.info "[ExportHealthRecordsJob] Exporting date=#{target_date} → s3://#{bucket}/#{s3_key}"

    jsonl = build_jsonl(target_date)

    if jsonl.empty?
      Rails.logger.info "[ExportHealthRecordsJob] No records for #{target_date}, skipping."
      return
    end

    upload_to_s3(bucket: bucket, key: s3_key, body: jsonl)

    Rails.logger.info "[ExportHealthRecordsJob] Done. Rows exported: #{jsonl.lines.count}"
  end

  private

  def build_jsonl(date)
    start_time = date.beginning_of_day.utc
    end_time   = date.end_of_day.utc

    HealthRecord
      .where(recorded_at: start_time..end_time)
      .includes(:user)
      .find_each
      .map { |record| serialize_record(record) }
      .join("\n")
  end

  def serialize_record(record)
    {
      id:               record.id,
      user_id:          record.user_id,
      fatigue_score:    record.fatigue_score,
      mood_score:       record.mood_score,
      motivation_score: record.motivation_score,
      flags:            record.flags,
      flags_list:       record.flags_list,
      note:             record.note,
      extra_metrics:    record.extra_metrics,
      recorded_at:      record.recorded_at.iso8601,
      timezone:         record.timezone,
      device_id:        record.device_id,
      app_version:      record.app_version,
      exported_at:      Time.current.iso8601
    }.to_json
  end

  def upload_to_s3(bucket:, key:, body:)
    s3 = Aws::S3::Client.new(region: ENV.fetch("AWS_REGION", "ap-northeast-1"))
    s3.put_object(
      bucket:       bucket,
      key:          key,
      body:         body,
      content_type: "application/x-ndjson",
      server_side_encryption: "AES256"
    )
    Rails.logger.info "[ExportHealthRecordsJob] Uploaded #{body.bytesize} bytes to s3://#{bucket}/#{key}"
  end
end
