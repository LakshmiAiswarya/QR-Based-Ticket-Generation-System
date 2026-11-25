from fastapi import FastAPI
from .api.endpoints import router
from . import db

app = FastAPI()
app.include_router(router)

# create tables on startup
@app.on_event("startup")
def startup():
    db_models = db.models
    db_engine = db.session.engine
    db_models.Base.metadata.create_all(bind=db_engine)

@app.get("/health")
def health():
    return {"status":"ok"}

@app.on_event("startup")
def start_scheduler():
    # import and start scheduler when the FastAPI app boots
    from . import scheduler
    if not scheduler.sched.running:
        scheduler.sched.start()
