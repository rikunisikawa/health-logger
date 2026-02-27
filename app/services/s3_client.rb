module S3Client
  def self.client
    @client ||= Aws::S3::Client.new(
      region:           ENV.fetch("AWS_REGION", "ap-northeast-1"),
      endpoint:         ENV["S3_ENDPOINT"],      # MinIO用 (開発環境)
      force_path_style: ENV["S3_ENDPOINT"].present?  # MinIOはpath styleが必要
    )
  end

  def self.bucket
    ENV.fetch("S3_EXPORT_BUCKET")
  end

  def self.put_json_line(key, data)
    client.put_object(
      bucket:       bucket,
      key:          key,
      body:         data.to_json,
      content_type: "application/x-ndjson"
    )
    Rails.logger.info "[S3Client] Written: s3://#{bucket}/#{key}"
  end

  # 最新レコードをAthena経由で取得 (またはS3 ListObjectsで代替)
  def self.latest_for(user_id)
    resp = client.list_objects_v2(
      bucket:  bucket,
      prefix:  "health_logs/",
      max_keys: 1000
    )

    # 最新キーを取得してオブジェクトを読む
    latest_key = resp.contents
      .sort_by(&:last_modified)
      .reverse
      .find { |obj| obj.key.end_with?(".jsonl") }

    return nil unless latest_key

    obj = client.get_object(bucket: bucket, key: latest_key.key)
    data = JSON.parse(obj.body.read, symbolize_names: true)
    data[:user_id].to_s == user_id.to_s ? data : nil
  rescue Aws::S3::Errors::NoSuchKey, Aws::S3::Errors::ServiceError
    nil
  end
end
