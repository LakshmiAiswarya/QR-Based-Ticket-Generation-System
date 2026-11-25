import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from datetime import datetime
from ..db.session import SessionLocal
from ..db import models

def fit_anomaly_detector(X, contamination=0.01):
    """Fit an Isolation Forest anomaly detector.
    
    Args:
        X: Feature matrix (features x samples)
        contamination: Expected proportion of anomalies (default 0.01 = 1%)
    
    Returns:
        Fitted Isolation Forest model
    """
    iso = IsolationForest(contamination=contamination, random_state=42, n_estimators=100)
    iso.fit(X)
    return iso

def score_anomaly(detector, X):
    """Score samples for anomalies.
    
    Args:
        detector: Fitted Isolation Forest model
        X: Feature matrix to score
    
    Returns:
        Anomaly scores (negative = anomalous, positive = normal)
    """
    return detector.decision_function(X)

def predict_anomaly(detector, X, threshold=-0.5):
    """Predict anomalies with a threshold.
    
    Args:
        detector: Fitted Isolation Forest model
        X: Feature matrix to predict
        threshold: Decision function threshold (below = anomaly)
    
    Returns:
        Boolean array indicating anomalies
    """
    scores = score_anomaly(detector, X)
    return scores < threshold

def build_anomaly_detector_from_logs(contamination=0.01):
    """Build and train an anomaly detector from historical verification logs.
    
    Args:
        contamination: Expected proportion of anomalies
    
    Returns:
        Tuple of (detector, scaler, feature_names, training_info)
    """
    session = SessionLocal()
    try:
        # Get verification logs
        logs = session.query(models.VerificationLog).all()
        if not logs or len(logs) < 10:
            return None, None, None, {"error": "Insufficient training data"}
        
        # Extract features
        feature_names = ['face_similarity_score', 'biometric_confidence', 'liveness_score', 'ocr_confidence',
                        'retry_count', 'time_between_attempts', 'device_fingerprint_entropy',
                        'ip_risk_score', 'event_risk_level']
        
        X = []
        for log in logs:
            row = [getattr(log, fname, 0.0) for fname in feature_names]
            # Handle None values
            row = [x if x is not None else 0.0 for x in row]
            X.append(row)
        
        X = np.array(X)
        
        # Standardize features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Train detector
        detector = fit_anomaly_detector(X_scaled, contamination=contamination)
        
        return detector, scaler, feature_names, {
            "n_samples": len(logs),
            "n_features": len(feature_names),
            "contamination": contamination,
            "trained_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        print(f"Error building anomaly detector: {e}")
        return None, None, None, {"error": str(e)}
    finally:
        session.close()

def detect_anomalies_in_verification(face_similarity_score, liveness_score, ocr_confidence,
                                     retry_count, time_between_attempts, device_fingerprint_entropy,
                                     ip_risk_score, event_risk_level, detector=None, scaler=None):
    """Detect if a verification event is anomalous.
    
    Args:
        Individual feature values
        detector: Pre-trained Isolation Forest model (if None, builds new one)
        scaler: Pre-fitted StandardScaler (if None, builds new one)
    
    Returns:
        Dict with anomaly_score and is_anomaly flag
    """
    try:
        if detector is None or scaler is None:
            detector, scaler, _, info = build_anomaly_detector_from_logs()
            if detector is None:
                return {"error": info.get("error", "Could not build detector"), "is_anomaly": False}
        
        features = np.array([[    
            face_similarity_score or 0.0,
            biometric_confidence or face_similarity_score or 0.0,
            liveness_score or 0.0,
            ocr_confidence or 0.0,
            retry_count or 0,
            time_between_attempts or 0.0,
            device_fingerprint_entropy or 0.0,
            ip_risk_score or 0.0,
            event_risk_level or 0
        ]])
        
        # Scale features
        features_scaled = scaler.transform(features)
        
        # Score
        score = detector.decision_function(features_scaled)[0]
        is_anomaly = score < -0.5
        
        return {
            "anomaly_score": float(score),
            "is_anomaly": bool(is_anomaly),
            "threshold": -0.5,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        print(f"Error detecting anomaly: {e}")
        return {"error": str(e), "is_anomaly": False}
