from pydantic import BaseModel, Field


class HealthRecordInput(BaseModel):
    fatigue_score:    int = Field(..., ge=0, le=100)
    mood_score:       int = Field(..., ge=0, le=100)
    motivation_score: int = Field(..., ge=0, le=100)
    flags:            int = Field(0,   ge=0, le=63)
    note:             str = Field("",  max_length=280)
    recorded_at:      str = Field(...)
    timezone:         str = Field("UTC")
    device_id:        str = Field("")
    app_version:      str = Field("1.0.0")
