-- Migration: 001_add_concentration_score
-- 集中力スコアカラムを health_records テーブルに追加
ALTER TABLE health_records ADD COLUMNS (concentration_score int)
