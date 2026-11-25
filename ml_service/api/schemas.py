from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class PredictRequest(BaseModel):
    face_similarity_score: float
    biometric_confidence: float = 0.0
    liveness_score: float
    ocr_confidence: float
    qr_validation_flag: bool
    retry_count: int
    time_between_attempts: float
    device_fingerprint_entropy: float
    ip_risk_score: float
    geo_location_shift_flag: bool
    event_risk_level: int
    gate_id: str

class PredictResponse(BaseModel):
    trust_score: float

class LogEventRequest(PredictRequest):
    final_decision: Optional[str]
    timestamp: datetime

class RetrainRequest(BaseModel):
    force: bool = False

class MetricsResponse(BaseModel):
    version: str
    metrics: dict

class ImportanceResponse(BaseModel):
    version: str
    importance: dict
