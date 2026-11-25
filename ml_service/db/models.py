from sqlalchemy import (Column, Integer, Float, String, Boolean, DateTime, JSON, ForeignKey)
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class VerificationLog(Base):
    __tablename__ = 'verification_log'
    id = Column(Integer, primary_key=True)
    face_similarity_score = Column(Float)
    biometric_confidence = Column(Float)    # new field logged from frontend
    liveness_score = Column(Float)
    ocr_confidence = Column(Float)
    qr_validation_flag = Column(Boolean)
    retry_count = Column(Integer)
    time_between_attempts = Column(Float)
    device_fingerprint_entropy = Column(Float)
    ip_risk_score = Column(Float)
    geo_location_shift_flag = Column(Boolean)
    event_risk_level = Column(Integer)
    final_decision = Column(String)
    timestamp = Column(DateTime)
    gate_id = Column(String)

class FeatureStore(Base):
    __tablename__ = 'feature_store'
    id = Column(Integer, primary_key=True)
    log_id = Column(Integer, ForeignKey('verification_log.id'))
    feature_name = Column(String)
    feature_value = Column(Float)
    computed_at = Column(DateTime)

class ModelMetadata(Base):
    __tablename__ = 'model_metadata'
    version = Column(String, primary_key=True)
    created_at = Column(DateTime)
    training_data_range = Column(String)  # e.g. '2026-01-01/2026-02-01'
    psi_metric = Column(Float)
    performance_json = Column(JSON)
    artifact_path = Column(String)

class DriftMetrics(Base):
    __tablename__ = 'drift_metrics'
    id = Column(Integer, primary_key=True)
    version = Column(String, ForeignKey('model_metadata.version'))
    computed_at = Column(DateTime)
    psi_value = Column(Float)
    explanation = Column(JSON)
