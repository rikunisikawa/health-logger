class CreateHealthRecords < ActiveRecord::Migration[8.1]
  def change
    create_table :health_records do |t|
      t.integer :fatigue_score
      t.integer :mood_score
      t.integer :motivation_score
      t.integer :flags
      t.text :note
      t.jsonb :extra_metrics
      t.datetime :recorded_at
      t.string :timezone
      t.string :device_id
      t.string :app_version
      t.references :user, null: false, foreign_key: true

      t.timestamps
    end

    add_index :health_records, [ :user_id, :recorded_at ]
    add_index :health_records, :recorded_at
  end
end
