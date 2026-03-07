terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.75"
    }
  }
  backend "s3" {
    bucket         = "health-logger-tfstate-prod"
    key            = "prod/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "health-logger-tflock-prod"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.env
      ManagedBy   = "terraform"
    }
  }
}
