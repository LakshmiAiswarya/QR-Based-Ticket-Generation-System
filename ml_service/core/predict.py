import os
import numpy as np
import joblib
from ..config import MODEL_DIR


def load_model():
    if not os.path.exists(MODEL_DIR):
        return None, None

    versions = sorted(os.listdir(MODEL_DIR))
    if not versions:
        return None, None

    version_path = os.path.join(MODEL_DIR, versions[-1])
    xgb_model_path = os.path.join(version_path, "model.bst")
    sklearn_model_path = os.path.join(version_path, "model.joblib")

    if os.path.exists(xgb_model_path):
        try:
            import xgboost as xgb
            model = xgb.Booster()
            model.load_model(xgb_model_path)
            return "xgboost", model
        except Exception:
            pass

    if os.path.exists(sklearn_model_path):
        try:
            return "sklearn", joblib.load(sklearn_model_path)
        except Exception:
            return None, None

    return None, None

def predict_trust(features: dict) -> float:
    model_type, model = load_model()
    if model is None or model_type is None:
        raise RuntimeError("No model available")

    x = np.array([[
        features['face_similarity_score'],
        features.get('biometric_confidence', features['face_similarity_score']),
        features['liveness_score'],
        features['ocr_confidence'],
        features['retry_count'],
        features['time_between_attempts'],
        features['device_fingerprint_entropy'],
        features['ip_risk_score'],
        int(features['geo_location_shift_flag']),
        features['event_risk_level'],
    ]])

    try:
        if model_type == "xgboost":
            import xgboost as xgb
            dmat = xgb.DMatrix(x)
            score = model.predict(dmat)[0]
            return float(score)

        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(x)
            classes = list(getattr(model, "classes_", []))

            if len(classes) == 1:
                return 1.0 if int(classes[0]) == 1 else 0.0

            if 1 in classes:
                positive_index = classes.index(1)
                score = probabilities[0][positive_index]
            else:
                score = probabilities[0][-1]
            return float(score)

        score = model.predict(x)[0]
        return float(score)
    except Exception as e:
        raise RuntimeError(f"prediction failed due to model error: {e}")
