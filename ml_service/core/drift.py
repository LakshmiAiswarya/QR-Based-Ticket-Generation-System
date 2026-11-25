import numpy as np
from datetime import datetime, timedelta
from ..config import DRIFT_THRESHOLD
from ..db.session import SessionLocal
from ..db import models

def psi(expected, actual, buckets=10):
    """Compute population stability index between two distributions."""
    expected = np.array(expected).flatten()
    actual = np.array(actual).flatten()
    
    # Remove NaN values
    expected = expected[~np.isnan(expected)]
    actual = actual[~np.isnan(actual)]
    
    if len(expected) == 0 or len(actual) == 0:
        return 0.0
    
    # Compute percentiles
    breakpoints = np.arange(0, buckets + 1) / buckets
    expected_bins = np.percentile(expected, breakpoints * 100)
    actual_bins = np.percentile(actual, breakpoints * 100)
    
    # Binning
    expected_counts = np.histogram(expected, bins=expected_bins)[0] + 1e-10
    actual_counts = np.histogram(actual, bins=expected_bins)[0] + 1e-10
    
    expected_percents = expected_counts / np.sum(expected_counts)
    actual_percents = actual_counts / np.sum(actual_counts)
    
    # PSI calculation
    psi_val = np.sum((actual_percents - expected_percents) * np.log(actual_percents / expected_percents))
    return float(psi_val)

def compute_feature_drift(feature_name: str, historical_threshold_days: int = 30) -> float:
    """Compute PSI for a specific feature comparing recent vs historical data."""
    session = SessionLocal()
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=historical_threshold_days)
        
        # Get recent logs
        recent_logs = session.query(models.VerificationLog).filter(
            models.VerificationLog.timestamp >= cutoff_date
        ).all()
        
        if len(recent_logs) < 10:
            return 0.0
        
        # Get historical logs (before cutoff)
        historical_logs = session.query(models.VerificationLog).filter(
            models.VerificationLog.timestamp < cutoff_date
        ).all()
        
        if len(historical_logs) < 10:
            return 0.0
        
        # Extract feature values
        recent_values = [getattr(log, feature_name) for log in recent_logs if getattr(log, feature_name) is not None]
        historical_values = [getattr(log, feature_name) for log in historical_logs if getattr(log, feature_name) is not None]
        
        if not recent_values or not historical_values:
            return 0.0
        
        return psi(historical_values, recent_values)
    finally:
        session.close()

def check_all_features_drift() -> dict:
    """Check drift across all features and return PSI values."""
    features = ['face_similarity_score', 'biometric_confidence', 'liveness_score', 'ocr_confidence', 
                'retry_count', 'time_between_attempts', 'device_fingerprint_entropy', 
                'ip_risk_score', 'event_risk_level']
    drift_values = {}
    max_drift = 0.0
    
    for feature in features:
        try:
            psi_val = compute_feature_drift(feature)
            drift_values[feature] = psi_val
            max_drift = max(max_drift, psi_val)
        except Exception as e:
            print(f"Error computing drift for {feature}: {e}")
            drift_values[feature] = 0.0
    
    return drift_values, max_drift
