import os

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./ml_service.db')
MODEL_DIR = os.getenv('MODEL_DIR', './models')

# Legacy weekly retrain (scheduler.py)
RETRAIN_INTERVAL_HOURS = int(os.getenv('RETRAIN_INTERVAL_HOURS', '168'))  # weekly

# Drift threshold for scheduled retrains
DRIFT_THRESHOLD = float(os.getenv('DRIFT_THRESHOLD', '0.2'))

# --- Auto self-learning (retrain on newly logged live events) ---
AUTO_RETRAIN_ON_LOG = os.getenv('AUTO_RETRAIN_ON_LOG', 'true').lower() == 'true'
AUTO_RETRAIN_COOLDOWN_HOURS = int(os.getenv('AUTO_RETRAIN_COOLDOWN_HOURS', '24'))

# Require enough new labeled samples since the latest model before retraining
AUTO_RETRAIN_MIN_NEW_SAMPLES = int(os.getenv('AUTO_RETRAIN_MIN_NEW_SAMPLES', '25'))
AUTO_RETRAIN_MIN_APPROVED_SAMPLES = int(os.getenv('AUTO_RETRAIN_MIN_APPROVED_SAMPLES', '5'))
AUTO_RETRAIN_MIN_REJECTED_SAMPLES = int(os.getenv('AUTO_RETRAIN_MIN_REJECTED_SAMPLES', '5'))

# If true, model training will run even when XGBoost isn't available (falls back to sklearn)
AUTO_RETRAIN_FORCE = os.getenv('AUTO_RETRAIN_FORCE', 'false').lower() == 'true'
