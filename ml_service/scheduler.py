from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
from .core.train import train_model
from .core.drift import check_all_features_drift
from .config import DRIFT_THRESHOLD
from .db.session import SessionLocal
from .db import models

sched = BackgroundScheduler()

# weekly retrain
sched.add_job(train_model, 'interval', hours=168)

def check_drift():
    """Check for data drift and trigger retraining if threshold exceeded."""
    try:
        drift_values, max_drift = check_all_features_drift()
        print(f"[{datetime.utcnow()}] Drift check: max_psi={max_drift:.4f}, threshold={DRIFT_THRESHOLD}")
        
        # Log drift metrics
        session = SessionLocal()
        latest_meta = session.query(models.ModelMetadata).order_by(models.ModelMetadata.created_at.desc()).first()
        
        if latest_meta:
            drift_metric = models.DriftMetrics(
                version=latest_meta.version,
                computed_at=datetime.utcnow(),
                psi_value=max_drift,
                explanation=drift_values
            )
            session.add(drift_metric)
            session.commit()
        
        # Trigger retrain if drift exceeds threshold
        if max_drift > DRIFT_THRESHOLD:
            print(f"Drift threshold exceeded ({max_drift:.4f} > {DRIFT_THRESHOLD}). Triggering retrain...")
            session.close()
            train_model()
        else:
            session.close()
    except Exception as e:
        print(f"Drift check error: {e}")

# daily drift check
sched.add_job(check_drift, 'interval', hours=24)

if not sched.running:
    sched.start()