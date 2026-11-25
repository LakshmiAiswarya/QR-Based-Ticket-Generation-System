import os, datetime
import threading
import joblib
import pandas as pd
from sklearn.model_selection import train_test_split
from ..config import MODEL_DIR, DRIFT_THRESHOLD
from ..db.session import SessionLocal
from ..db import models

# simplified training pipeline
BACKEND_TRAINING_SHEET = os.getenv(
    "BACKEND_TRAINING_SHEET",
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "exports", "ticket_records_training.csv")
    ),
)

FEATURES = [
    'face_similarity_score',
    'biometric_confidence',
    'liveness_score',
    'ocr_confidence',
    'retry_count',
    'time_between_attempts',
    'device_fingerprint_entropy',
    'ip_risk_score',
    'geo_flag',
    'event_risk_level'
]


def _to_numeric(series, default=0.0):
    if series is None:
        return pd.Series(dtype=float)
    return pd.to_numeric(series, errors='coerce').fillna(default)

def _series_or_default(df: pd.DataFrame, column_name: str, default_value):
    if column_name in df.columns:
        return df[column_name]
    return pd.Series(default_value, index=df.index)


def _load_backend_training_sheet() -> pd.DataFrame:
    """Load backend-exported training sheet (Excel-compatible CSV)."""
    if not os.path.exists(BACKEND_TRAINING_SHEET):
        return pd.DataFrame()

    try:
        df = pd.read_csv(BACKEND_TRAINING_SHEET)
    except Exception as exc:
        print(f"failed to load backend training sheet: {exc}")
        return pd.DataFrame()

    if df.empty:
        return df

    status = _series_or_default(df, 'status', '').astype(str).str.upper()
    final_decision = df.get('final_decision')
    if final_decision is None:
        final_decision = status.map({'SUCCESS': 'approved'}).fillna('rejected')
    else:
        final_decision = final_decision.astype(str).str.lower()
        final_decision = final_decision.where(
            final_decision.isin(['approved', 'rejected']),
            status.map({'SUCCESS': 'approved'}).fillna('rejected')
        )

    timestamp_raw = _to_numeric(_series_or_default(df, 'timestamp', 0), default=0)
    timestamp_dt = pd.to_datetime(timestamp_raw, unit='ms', errors='coerce')
    timestamp_dt = timestamp_dt.fillna(pd.Timestamp.utcnow())

    is_qr = _series_or_default(df, 'verification_method', '').astype(str).str.upper().eq('QR')
    inferred_confidence = status.eq('SUCCESS').map({True: 0.85, False: 0.35})

    merged = pd.DataFrame({
        'face_similarity_score': _to_numeric(_series_or_default(df, 'face_similarity_score', inferred_confidence), default=0.0),
        'biometric_confidence': _to_numeric(_series_or_default(df, 'biometric_confidence', inferred_confidence), default=0.0),
        'liveness_score': _to_numeric(_series_or_default(df, 'liveness_score', status.eq('SUCCESS').map({True: 0.9, False: 0.45})), default=0.0),
        'ocr_confidence': _to_numeric(_series_or_default(df, 'ocr_confidence', is_qr.map({True: 0.95, False: 0.75})), default=0.0),
        'retry_count': _to_numeric(_series_or_default(df, 'retry_count', 0), default=0).astype(int),
        'time_between_attempts': _to_numeric(_series_or_default(df, 'time_between_attempts', 0), default=0.0),
        'device_fingerprint_entropy': _to_numeric(_series_or_default(df, 'device_fingerprint_entropy', 0), default=0.0),
        'ip_risk_score': _to_numeric(_series_or_default(df, 'ip_risk_score', 0), default=0.0),
        'geo_location_shift_flag': _to_numeric(_series_or_default(df, 'geo_location_shift_flag', 0), default=0).astype(int),
        'event_risk_level': _to_numeric(
            _series_or_default(df, 'event_risk_level', status.map({'DENIED': 2, 'FAILED': 1}).fillna(0)),
            default=0
        ).astype(int),
        'final_decision': final_decision,
        'timestamp': timestamp_dt
    })

    return merged

_retrain_lock = threading.Lock()
_retrain_in_progress = False


def _schedule_training_background(reason: str) -> bool:
    global _retrain_in_progress

    with _retrain_lock:
        if _retrain_in_progress:
            return False
        _retrain_in_progress = True

    def _run():
        try:
            print(f"[ML] Retraining started (reason={reason})")
            train_model()
            print(f"[ML] Retraining finished (reason={reason})")
        finally:
            global _retrain_in_progress
            with _retrain_lock:
                _retrain_in_progress = False

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return True


def trigger_retrain(force: bool = False, reason: str = "manual"):
    """
    Always schedule retraining in a background thread to avoid blocking API calls.
    `force` is currently reserved for future overrides.
    """
    _schedule_training_background(reason=reason)


def maybe_auto_retrain():
    """
    Auto self-learning trigger:
      - cooldown since latest model
      - require enough new labeled events since latest model
      - require label balance (min approved & rejected)
    """
    from ..config import (
        AUTO_RETRAIN_ON_LOG,
        AUTO_RETRAIN_COOLDOWN_HOURS,
        AUTO_RETRAIN_MIN_NEW_SAMPLES,
        AUTO_RETRAIN_MIN_APPROVED_SAMPLES,
        AUTO_RETRAIN_MIN_REJECTED_SAMPLES,
    )

    if not AUTO_RETRAIN_ON_LOG:
        return {"scheduled": False, "reason": "auto_retrain_disabled"}

    session = SessionLocal()
    try:
        latest = session.query(models.ModelMetadata).order_by(models.ModelMetadata.created_at.desc()).first()
        if not latest or not latest.created_at:
            return {"scheduled": False, "reason": "no_model_yet"}

        latest_created_at = latest.created_at
        cooldown_seconds = AUTO_RETRAIN_COOLDOWN_HOURS * 3600
        elapsed_seconds = (datetime.datetime.utcnow() - latest_created_at).total_seconds()
        if elapsed_seconds < cooldown_seconds:
            return {
                "scheduled": False,
                "reason": "cooldown_active",
                "hours_since_latest": elapsed_seconds / 3600,
            }

        base_q = session.query(models.VerificationLog).filter(
            models.VerificationLog.final_decision != None,  # noqa: E711
            models.VerificationLog.timestamp != None,  # noqa: E711
            models.VerificationLog.timestamp > latest_created_at,
        )

        approved_count = base_q.filter(models.VerificationLog.final_decision == "approved").count()
        rejected_count = base_q.filter(models.VerificationLog.final_decision == "rejected").count()
        total = approved_count + rejected_count

        if total < AUTO_RETRAIN_MIN_NEW_SAMPLES:
            return {
                "scheduled": False,
                "reason": "insufficient_new_samples",
                "new_approved": approved_count,
                "new_rejected": rejected_count,
                "new_total": total,
            }

        if approved_count < AUTO_RETRAIN_MIN_APPROVED_SAMPLES or rejected_count < AUTO_RETRAIN_MIN_REJECTED_SAMPLES:
            return {
                "scheduled": False,
                "reason": "label_imbalance",
                "new_approved": approved_count,
                "new_rejected": rejected_count,
                "new_total": total,
            }

        scheduled = _schedule_training_background(reason="auto_new_live_logs")
        return {
            "scheduled": scheduled,
            "reason": "criteria_met",
            "new_approved": approved_count,
            "new_rejected": rejected_count,
            "new_total": total,
        }
    except Exception as e:
        return {"scheduled": False, "reason": "auto_retrain_error", "error": str(e)}
    finally:
        session.close()


def train_model():
    # Prefer XGBoost when available, but fall back to a sklearn model when
    # native XGBoost dependencies (such as libomp on macOS) are unavailable.
    xgb = None
    try:
        import xgboost as xgb
    except Exception as exc:
        print(f"xgboost unavailable; falling back to sklearn model: {exc}")
        xgb = None

    try:
        # pull data with confirmed outcomes
        session = SessionLocal()
        logs = session.query(models.VerificationLog).filter(models.VerificationLog.final_decision != None).all()
        ml_df = pd.DataFrame([l.__dict__ for l in logs])
        session.close()

        sheet_df = _load_backend_training_sheet()

        frames = [frame for frame in (ml_df, sheet_df) if not frame.empty]
        if not frames:
            return

        df = pd.concat(frames, ignore_index=True, sort=False)
        # feature engineering (placeholder)
        df['face_similarity_score'] = _to_numeric(_series_or_default(df, 'face_similarity_score', 0.0), default=0.0)
        df['biometric_confidence'] = _to_numeric(_series_or_default(df, 'biometric_confidence', 0.0), default=0.0)
        df['liveness_score'] = _to_numeric(_series_or_default(df, 'liveness_score', 0.0), default=0.0)
        df['ocr_confidence'] = _to_numeric(_series_or_default(df, 'ocr_confidence', 0.0), default=0.0)
        df['retry_count'] = _to_numeric(_series_or_default(df, 'retry_count', 0), default=0).astype(int)
        df['time_between_attempts'] = _to_numeric(_series_or_default(df, 'time_between_attempts', 0.0), default=0.0)
        df['device_fingerprint_entropy'] = _to_numeric(_series_or_default(df, 'device_fingerprint_entropy', 0.0), default=0.0)
        df['ip_risk_score'] = _to_numeric(_series_or_default(df, 'ip_risk_score', 0.0), default=0.0)
        df['event_risk_level'] = _to_numeric(_series_or_default(df, 'event_risk_level', 0), default=0).astype(int)
        df['geo_flag'] = _to_numeric(_series_or_default(df, 'geo_location_shift_flag', 0), default=0).astype(int)
        # fill missing confidence with face similarity if available
        df['biometric_confidence'] = df['biometric_confidence'].fillna(df['face_similarity_score'])
        X = df[FEATURES]
        y = (df['final_decision'].astype(str).str.lower() == 'approved').astype(int)

        if len(y.unique()) < 2:
            print("training skipped: need both approved and rejected labels")
            return
        if len(df) < 10:
            print("training skipped: insufficient rows (need at least 10)")
            return

        version = datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')
        verpath = os.path.join(MODEL_DIR, version)
        os.makedirs(verpath, exist_ok=True)
        performance_json = {}

        class_counts = y.value_counts()
        min_class_count = int(class_counts.min()) if not class_counts.empty else 0
        use_validation_split = min_class_count >= 2 and len(df) >= 10

        if use_validation_split:
            X_train, X_val, y_train, y_val = train_test_split(
                X,
                y,
                test_size=0.2,
                random_state=42,
                stratify=y
            )
        else:
            print("training using full dataset because class counts are too small for a stable validation split")
            X_train, X_val, y_train, y_val = X, X, y, y

        if xgb is not None:
            try:
                dtrain = xgb.DMatrix(X_train, label=y_train)
                dval = xgb.DMatrix(X_val, label=y_val)
                params = {
                    'objective': 'binary:logistic',
                    'scale_pos_weight': (len(y_train) - y_train.sum()) / max(y_train.sum(), 1)
                }
                evals = [(dval, 'val')] if use_validation_split else [(dtrain, 'train')]
                bst = xgb.train(params, dtrain, num_boost_round=100, evals=evals)
                bst.save_model(os.path.join(verpath, 'model.bst'))

                # Basic metrics so the system can verify improvements across retrains.
                from sklearn.metrics import accuracy_score, roc_auc_score

                proba = bst.predict(dval) if use_validation_split else bst.predict(dtrain)
                y_true = y_val if use_validation_split else y_train
                y_pred = (proba >= 0.5).astype(int)

                perf = {
                    'model_type': 'xgboost',
                    'validation_mode': 'split' if use_validation_split else 'train_only',
                    'accuracy': float(accuracy_score(y_true, y_pred)),
                }
                perf['roc_auc'] = float(roc_auc_score(y_true, proba)) if len(set(y_true)) > 1 else None
                performance_json = perf
            except Exception as xgb_exc:
                print(f"xgboost training failed; falling back to sklearn model: {xgb_exc}")
                xgb = None

        if xgb is None:
            from sklearn.ensemble import RandomForestClassifier
            from sklearn.metrics import accuracy_score, roc_auc_score

            model = RandomForestClassifier(
                n_estimators=200,
                max_depth=8,
                min_samples_leaf=2,
                random_state=42,
                class_weight='balanced'
            )
            model.fit(X_train, y_train)
            joblib.dump(model, os.path.join(verpath, 'model.joblib'))

            y_pred = model.predict(X_val)
            y_proba = model.predict_proba(X_val)[:, 1]
            performance_json = {
                'model_type': 'sklearn_random_forest',
                'validation_mode': 'split' if use_validation_split else 'train_only',
                'accuracy': float(accuracy_score(y_val, y_pred)),
                'roc_auc': float(roc_auc_score(y_val, y_proba)) if len(set(y_val)) > 1 else None
            }

        # log metadata
    except Exception as e:
        print(f"training aborted due to model training error: {e}")
        return
    meta = models.ModelMetadata(
        version=version,
        created_at=datetime.datetime.utcnow(),
        training_data_range=f"{df.timestamp.min()}/{df.timestamp.max()}",
        psi_metric=0.0,
        performance_json=performance_json,
        artifact_path=verpath
    )
    session = SessionLocal()
    session.add(meta)
    session.commit()
    session.close()



def get_metrics():
    """Retrieve metrics for the latest trained model."""
    session = SessionLocal()
    try:
        latest = session.query(models.ModelMetadata).order_by(models.ModelMetadata.created_at.desc()).first()
        if not latest:
            return {"version": "none", "metrics": {}, "created_at": None, "training_data_range": None}
        return {
            "version": latest.version,
            "metrics": latest.performance_json or {},
            "created_at": latest.created_at.isoformat() if latest.created_at else None,
            "training_data_range": latest.training_data_range,
            "psi_metric": latest.psi_metric
        }
    except Exception as e:
        print(f"Error getting metrics: {e}")
        return {"version": "error", "metrics": {}, "error": str(e)}
    finally:
        session.close()


def get_feature_importance():
    """Read and return feature importance from latest trained model."""
    session = SessionLocal()
    try:
        latest = session.query(models.ModelMetadata).order_by(models.ModelMetadata.created_at.desc()).first()
        if not latest:
            return {"version": "none", "importance": {}, "message": "No trained model found"}
        
        xgb_model_path = os.path.join(latest.artifact_path, 'model.bst')
        sklearn_model_path = os.path.join(latest.artifact_path, 'model.joblib')
        sorted_importance = {}

        if os.path.exists(xgb_model_path):
            try:
                import xgboost as xgb
                bst = xgb.Booster()
                bst.load_model(xgb_model_path)
                importance = bst.get_score(importance_type='gain')
                sorted_importance = dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))
            except Exception as exc:
                return {"version": latest.version, "importance": {}, "error": f"Could not load XGBoost model: {exc}"}
        elif os.path.exists(sklearn_model_path):
            model = joblib.load(sklearn_model_path)
            if hasattr(model, 'feature_importances_'):
                sorted_importance = dict(
                    sorted(
                        zip(FEATURES, model.feature_importances_),
                        key=lambda x: x[1],
                        reverse=True
                    )
                )
            else:
                return {"version": latest.version, "importance": {}, "message": "Model does not expose feature importances"}
        else:
            return {"version": latest.version, "importance": {}, "error": "Model file not found"}
        
        return {
            "version": latest.version,
            "importance": sorted_importance,
            "created_at": latest.created_at.isoformat() if latest.created_at else None
        }
    except Exception as e:
        print(f"Error getting feature importance: {e}")
        return {"version": "error", "importance": {}, "error": str(e)}
    finally:
        session.close()


def log_verification_event(event: dict):
    session = SessionLocal()
    log = models.VerificationLog(**event)
    session.add(log)
    session.commit()
    session.close()
