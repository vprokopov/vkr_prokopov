import os # Работа с файловой системой и путями 
import shutil # Высокоуровневые операции с файлами

from fastapi import FastAPI, UploadFile, File 
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.video_processor import analyze_video # Импорт функции анализа видео из backend-модуля


UPLOAD_DIR = "uploads"
RESULTS_DIR = "results"

os.makedirs(UPLOAD_DIR, exist_ok=True) # Создаём папку для загрузок, если она ещё не существует
os.makedirs(RESULTS_DIR, exist_ok=True) # Создаём папку для результатов, если она ещё не существует

app = FastAPI(title="Drift Vision Assistant") # Инициализация FastAPI-приложения с указанным названием

app.add_middleware( # Подключение CORS-мидлвари, чтобы фронтенд мог обращаться к API из других источников (доменов/портов)
    CORSMiddleware, # Класс мидлвари CORS
    allow_origins=["*"], # Разрешаем запросы с любых доменов
    allow_credentials=True, # Разрешаем передачу cookie/авторизационных данных
    allow_methods=["*"], # Разрешаем любые HTTP-методы
    allow_headers=["*"], # Разрешаем любые заголовки
)

app.mount("/results", StaticFiles(directory=RESULTS_DIR), name="results") # Файлы из папки results доступны по адресу /results/имя_файла

#Эндпоинт проверки работоспособности backend
@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "message": "Drift Vision Assistant backend is running"
    }


# Эндпоинт для простого сохранения загруженного видеофайла (без анализа)
@app.post("/upload-video")
async def upload_video(file: UploadFile = File(...)): # Прием файла из multipart/form-data под именем file
    file_path = os.path.join(UPLOAD_DIR, file.filename) # Путь, куда сохранить загруженный файл

    # Записываем видео в бинарном режиме, потому что таким образом можно сохранить видео
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Возврашение информации об успешной загрузке и место, где сохранён файл
    return {
        "status": "success",
        "filename": file.filename,
        "path": file_path
    }


# Эндпоинт, который сразу загружает видео и запускает его анализ
@app.post("/analyze-video")
async def analyze_uploaded_video(file: UploadFile = File(...)): # Принимаем видеофайл от клиента
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    # Сохраняем загруженный файл в папку uploads
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return analyze_video(file_path) # передача видео в функцию


# Эндпоинт для запуска анализа заранее подготовленного демо-видео
@app.post("/demo-analysis")
async def demo_analysis():
    demo_video_path = os.path.join(UPLOAD_DIR, "demo.mp4")

    if not os.path.exists(demo_video_path):
        return {
            "status": "error",
            "message": "Демо-видео не найдено. Добавьте файл uploads/demo.mp4"
        }

    return analyze_video(demo_video_path)

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")