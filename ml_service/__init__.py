# package init is intentionally light-weight.
# scheduler is started explicitly by the application (see main.py) or tests.
# Avoid importing scheduler here so that simple operations such as
# `from ml_service.core.predict import predict_trust` can succeed without
# requiring all dependencies (xgboost, apscheduler, etc.) to be installed.

pass
