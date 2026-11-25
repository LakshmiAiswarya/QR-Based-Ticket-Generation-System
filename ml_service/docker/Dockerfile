FROM python:3.11-slim
WORKDIR /app
COPY ../requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY .. /app
CMD ["uvicorn", "ml_service.api.endpoints:app", "--host", "0.0.0.0", "--port", "8000"]
