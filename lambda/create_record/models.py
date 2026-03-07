from typing import Literal, Optional, Union

from pydantic import BaseModel, Field


class CustomFieldValue(BaseModel):
    item_id: str
    label:   str
    type:    Literal["slider", "checkbox", "number", "text"]
    value:   Union[int, float, bool, str]


class HealthRecordInput(BaseModel):
    record_type:      Literal["daily", "event"] = Field("daily")
    fatigue_score:    Optional[int] = Field(None, ge=0, le=100)
    mood_score:       Optional[int] = Field(None, ge=0, le=100)
    motivation_score: Optional[int] = Field(None, ge=0, le=100)
    flags:            int  = Field(0,  ge=0, le=63)
    note:             str  = Field("", max_length=280)
    recorded_at:      str  = Field(...)
    timezone:         str  = Field("UTC")
    device_id:        str  = Field("")
    app_version:      str  = Field("1.0.0")
    custom_fields:    list[CustomFieldValue] = Field(default_factory=list)
