from fastapi import APIRouter, Depends, HTTPException
from .schemas import (PredictRequest, PredictResponse, LogEventRequest,
                      RetrainRequest, MetricsResponse, ImportanceResponse)
from ..core.predict import predict_trust
from ..core.train import (
    trigger_retrain,
    get_metrics,
    get_feature_importance,
    log_verification_event,
    maybe_auto_retrain,
)

router = APIRouter()

@router.post("/predict-trust", response_model=PredictResponse)
def predict_trust_endpoint(req: PredictRequest):
    score = predict_trust(req.dict())
    return {"trust_score": score}

@router.post("/log-verification-event")
def log_event(req: LogEventRequest):
    log_verification_event(req.dict())
    auto = maybe_auto_retrain()
    return {"status": "logged", "auto_retrain": auto}

@router.post("/retrain-model")
def retrain(req: RetrainRequest):
    trigger_retrain(req.force)
    return {"status": "retrain scheduled"}

@router.get("/model-metrics", response_model=MetricsResponse)
def model_metrics():
    return get_metrics()

@router.get("/feature-importance", response_model=ImportanceResponse)
def feature_importance():
    return get_feature_importance()

@router.post("/detect-anomaly")
def detect_anomaly(face_similarity_score: float, liveness_score: float, ocr_confidence: float,
                   retry_count: int, time_between_attempts: float, device_fingerprint_entropy: float,
                   ip_risk_score: float, event_risk_level: int):
    """Detect if the given verification event is anomalous."""
    from ..core.anomalies import detect_anomalies_in_verification
    result = detect_anomalies_in_verification(
        face_similarity_score, liveness_score, ocr_confidence,
        retry_count, time_between_attempts, device_fingerprint_entropy,
        ip_risk_score, event_risk_level
    )
    return result
