locals { name = "${var.project}-${var.env}" }

resource "aws_iam_role" "glue" {
  name = "${local.name}-glue-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "glue.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "glue_service" {
  role       = aws_iam_role.glue.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"
}

resource "aws_iam_role_policy" "glue_s3tables" {
  role = aws_iam_role.glue.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3tables:GetObject",
        "s3tables:PutObject",
        "s3tables:DeleteObject",
        "s3tables:AbortMultipartUpload",
        "s3tables:GetBucketLocation",
        "s3tables:ListBucket",
        "s3tables:GetTableBucket",
        "s3tables:ListTableBuckets",
        "s3tables:GetNamespace",
        "s3tables:ListNamespaces",
        "s3tables:GetTable",
        "s3tables:ListTables",
      ]
      Resource = [var.table_bucket_arn, "${var.table_bucket_arn}/*"]
    }]
  })
}

resource "aws_glue_catalog_database" "main" {
  name = replace("${local.name}_health_logs", "-", "_")
}

resource "aws_glue_catalog_table" "health_records" {
  name          = "health_records"
  database_name = aws_glue_catalog_database.main.name

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = "2"
    }
  }

  storage_descriptor {
    location = "${var.table_bucket_s3_uri}/health/health_records"

    columns {
      name = "id"
      type = "string"
    }
    columns {
      name = "user_id"
      type = "string"
    }
    columns {
      name = "fatigue_score"
      type = "int"
    }
    columns {
      name = "mood_score"
      type = "int"
    }
    columns {
      name = "motivation_score"
      type = "int"
    }
    columns {
      name = "flags"
      type = "int"
    }
    columns {
      name = "note"
      type = "string"
    }
    columns {
      name = "recorded_at"
      type = "timestamp"
    }
    columns {
      name = "timezone"
      type = "string"
    }
    columns {
      name = "device_id"
      type = "string"
    }
    columns {
      name = "app_version"
      type = "string"
    }
    columns {
      name = "written_at"
      type = "timestamp"
    }
  }

  partition_keys {
    name = "dt"
    type = "date"
  }
}
