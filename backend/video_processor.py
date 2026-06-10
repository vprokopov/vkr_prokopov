import cv2 # Библиотека OpenCV для работы с видео, кадрами и изображениями
import os  # Модуль os для работы с файлами, папками и путями
import numpy as np # Библиотека NumPy для численных операций с массивами
from ultralytics import YOLO  # Импорт модели YOLO из библиотеки Ultralytics
from backend.scoring import calculate_scores # Импорт функции расчёта итоговых оценок по траектории


RESULTS_DIR = "results" # Папка, в которую будут сохраняться результаты обработки
os.makedirs(RESULTS_DIR, exist_ok=True)  # Создаём папку results, если её ещё нет

model = YOLO("yolov8n.pt") # Загружаем предобученную модель YOLOv8n из файла весов

VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle"} # Разрешённые классы объектов, которые считаются транспортом


def analyze_video(video_path: str): # Основная функция анализа видео, принимает путь к видеофайлу
    for filename in os.listdir(RESULTS_DIR): # Перебираю все файлы в папке результатов
        file_path = os.path.join(RESULTS_DIR, filename) # Формирую полный путь к каждому файлу
        if os.path.isfile(file_path): # Проверяю, что это именно файл, а не папка
            os.remove(file_path) # Удаляю старые результаты перед новым анализом

    cap = cv2.VideoCapture(video_path) # Открываю видеофайл для покадрового чтения

    if not cap.isOpened(): # Если видео открыть не удалось
        return { # Возвращаю статус ошибки
            "status": "error",
            "message": "Не удалось открыть видео"
        }

    fps = cap.get(cv2.CAP_PROP_FPS)  # Получаю частоту кадров видео
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) # Получаю общее число кадров
    duration = frame_count / fps if fps > 0 else 0 # Вычисляю длительность видео в секундах

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) # Получаю ширину кадра
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) # Получаю высоту кадра

    processed_video_name = "processed_video.mp4"
    processed_video_path = os.path.join(RESULTS_DIR, processed_video_name)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v") # Кодек для записи видео в формате mp4
    video_writer = cv2.VideoWriter( # Создаю объект записи выходного видео
        processed_video_path, # Путь, куда будет сохраняться файл
        fourcc,  # Кодек
        fps if fps > 0 else 25, # Частота кадров выходного видео
        (width, height) # Размер кадров выходного видео
    )

    background_subtractor = cv2.createBackgroundSubtractorMOG2( # Создаём алгоритм фоновой субстракции
        history=100, # Длина истории кадров для моделирования фона
        varThreshold=40, # Порог различия пикселей для выделения движения
        detectShadows=True # Разрешаю учитывать тени при построении маски
    )

    points = [] # Список точек траектории автомобиля
    screenshots = []  # Список сохранённых скриншотов с детекцией

    frame_number = 0 # Счётчик текущего номера кадра
    saved_screenshots = 0 # Сколько скриншотов уже сохранено
    first_detection_saved = False # Флаг, что первый кадр с детекцией уже сохранён

    last_center = None # Последний центр найденного автомобиля, нужен для проверки непрерывности
    max_jump_distance = 300 # Максимально допустимый скачок между соседними положениями объекта

    while True: # Бесконечный цикл чтения кадров до конца видео
        ret, frame = cap.read() # Считывание очередного кадра из видео

        if not ret: # Если кадр не считан, значит видео закончилось
            break # Выход из цикла

        frame_for_video = frame.copy() # Делаю копию кадра для последующей записи в выходное видео

        # Маска движения нужна на каждом кадре
        motion_mask = background_subtractor.apply(frame) # Применяю фоновую субстракцию и получаем маску движения
        _, motion_mask = cv2.threshold(motion_mask, 200, 255, cv2.THRESH_BINARY) # Превращаю маску в бинарную

        if frame_number % 5 == 0: # Запускаю детекцию не на каждом кадре, а на каждом пятом
            results = model(frame, verbose=False) # Передача кадра в модель YOLO для поиска объектов

            best_detection = None # Лучшая найденная детекция на текущем кадре
            best_motion_score = 0 # Лучшее значение комбинированного score по движению

            for result in results: # Перебор результатов, возвращённые моделью
                for box in result.boxes: # Перебор всех найденных bounding box
                    class_id = int(box.cls[0]) # Получение числового идентификатора класса
                    class_name = model.names[class_id] # Преобразование id класса в строковое имя
                    confidence = float(box.conf[0]) # Получаем confidence - уверенность модели

                    if class_name not in VEHICLE_CLASSES: # Если объект не относится к транспорту 
                        continue # Пропускаем его

                    if confidence < 0.25: # Если уверенность модели слишком низкая
                        continue # Игнорируем такую детекцию

                    x1, y1, x2, y2 = box.xyxy[0] # Получаем координаты рамки: левый верхний и правый нижний угол

                    x = max(0, int(x1))  # Координата X верхнего левого угла, не меньше 0
                    y = max(0, int(y1)) # Координата Y верхнего левого угла, не меньше 0
                    w = int(x2 - x1) # Ширина bounding box
                    h = int(y2 - y1)  # Высота bounding box

                    if w <= 0 or h <= 0: # Если размеры рамки некорректны
                        continue #  Пропускаем такую детекцию

                    center_x = x + w // 2  # Вычисляем координату X центра объекта
                    center_y = y + h // 2 # Вычисляем координату Y центра объекта

                    roi = motion_mask[y:y + h, x:x + w] # Вырезаем область маски движения внутри bounding box

                    if roi.size == 0: # Если область оказалась пустой
                        continue # Пропускаем такую детекцию

                    # Сколько движения внутри рамки YOLO
                    motion_pixels = cv2.countNonZero(roi) # Считаем количество ненулевых пикселей в области движения
                    box_area = w * h # Вычисляем площадь bounding box
                    motion_ratio = motion_pixels / box_area # Доля движущихся пикселей внутри рамки

                    # Отсекаем статичные машины
                    if motion_ratio < 0.03: # Если движения слишком мало
                        continue # Считаем объект статичным и пропускаем его

                    if last_center is not None: # Если ранее уже была обнаружена позиция автомобиля
                        dx = center_x - last_center[0] # Смещение по оси X относительно прошлого положения
                        dy = center_y - last_center[1] # Смещение по оси Y относительно прошлого положения
                        distance = (dx ** 2 + dy ** 2) ** 0.5 # Евклидово расстояние между старым и новым центром

                        if distance > max_jump_distance: # Если объект слишком резко "перепрыгнул" в другое место
                            continue # Считаем это ошибкой распознавания и отбрасываем

                    # Выбираем машину с максимальным движением внутри рамки
                    motion_score = motion_ratio * confidence # Итоговый score: активность движения * уверенность модели

                    if motion_score > best_motion_score: # Если текущая детекция лучше предыдущей лучшей
                        best_motion_score = motion_score # Обновляем лучшее значение score
                        best_detection = { # Сохраняем данные лучшей детекции
                            "x": x,
                            "y": y,
                            "w": w,
                            "h": h,
                            "center_x": center_x,
                            "center_y": center_y,
                            "confidence": confidence,
                            "class_name": class_name,
                            "motion_ratio": motion_ratio
                        }

            if best_detection is not None: # Если на кадре всё-таки найдена подходящая детекция
                x = best_detection["x"] # Координата X рамки
                y = best_detection["y"] # Координата Y рамки
                w = best_detection["w"] # Ширина рамки
                h = best_detection["h"] # Высота рамки
                center_x = best_detection["center_x"] # Центр объекта по X
                center_y = best_detection["center_y"] # Центр объекта по Y
                confidence = best_detection["confidence"] # Confidence лучшей детекции
                class_name = best_detection["class_name"] # Название класса объекта
                motion_ratio = best_detection["motion_ratio"] # Доля движения в рамке

                last_center = (center_x, center_y) # Запоминаем текущий центр как последний найденный

                label = f"{class_name} {confidence:.2f} | motion {motion_ratio:.2f} | frame {frame_number}" # Формируем текстовую подпись

                cv2.rectangle( # Рисуем зелёную рамку вокруг найденного объекта
                    frame_for_video,
                    (x, y),
                    (x + w, y + h),
                    (0, 255, 0),
                    3
                )

                cv2.putText( # Наносим подпись на кадр обработанного видео
                    frame_for_video,
                    label,
                    (x, max(y - 10, 25)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 0),
                    2
                )

                frame_with_box_for_point = frame.copy() # Создаём отдельную копию кадра для сохранения точки траектории

                cv2.rectangle( # Рисуем рамку на отдельной копии кадра
                    frame_with_box_for_point,
                    (x, y),
                    (x + w, y + h),
                    (0, 255, 0),
                    3
                )

                cv2.putText( # Наносим подпись на изображение точки
                    frame_with_box_for_point,
                    label,
                    (x, max(y - 10, 25)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 0),
                    2
                )

                point_frame_name = f"point_frame_{frame_number}.jpg" # Формируем имя файла для кадра точки траектории
                point_frame_path = os.path.join(RESULTS_DIR, point_frame_name) # Формируем путь к нему

                cv2.imwrite(point_frame_path, frame_with_box_for_point) # Сохраняем изображение кадра на диск

                points.append({ # Добавляем новую точку в список траектории
                    "frame": frame_number,
                    "x": center_x,
                    "y": center_y,
                    "confidence": round(confidence, 3),
                    "motion_ratio": round(motion_ratio, 3), # Доля движения, округлённая до 3 знаков
                    "detected_class": class_name,
                    "frame_image_path": point_frame_path,
                    "box": {
                        "x": x,
                        "y": y,
                        "width": w,
                        "height": h
                    }
                })

                should_save_screenshot = False # По умолчанию текущий кадр не сохраняем как скриншот

                if not first_detection_saved: # Если это первая успешная детекция
                    should_save_screenshot = True # Обязательно сохраняем её
                    first_detection_saved = True # Помечаем, что первый скриншот уже был сохранён
                elif saved_screenshots < 3 and frame_number % 10 == 0: # Если сохранено меньше 3 доп.скриншотов и кадр кратен 10
                    should_save_screenshot = True # Сохраняем ещё один скриншот

                if should_save_screenshot: # Если кадр нужно сохранить как наглядный результат
                    frame_with_box = frame.copy() # Создаём копию кадра

                    cv2.rectangle( # Рисуем рамку на скриншоте
                        frame_with_box,
                        (x, y),
                        (x + w, y + h),
                        (0, 255, 0),
                        3
                    )

                    cv2.putText( # Добавляем подпись на скриншот
                        frame_with_box, # Кадр, на который наносится текст
                        label, # Строка подписи с классом, confidence, motion и номером кадра
                        (x, max(y - 10, 20)), # Координаты вывода текста над рамкой
                        cv2.FONT_HERSHEY_SIMPLEX, # Шрифт OpenCV
                        0.8, # Размер шрифта
                        (0, 255, 0), # Цвет текста - зелёный
                        2 # Толщина линий текста
                    )

                    screenshot_name = f"screenshot_{len(screenshots) + 1}.jpg" # Формируем имя нового скриншота
                    screenshot_path = os.path.join(RESULTS_DIR, screenshot_name) # Формируем полный путь к файлу скриншота

                    cv2.imwrite(screenshot_path, frame_with_box) # Сохраняем скриншот кадра на диск

                    screenshots.append({ # Добавляем информацию о скриншоте в список результатов
                        "frame": frame_number, # Номер кадра, на котором сделан скриншот
                        "path": screenshot_path, # Путь к сохранённому изображению
                        "type": "first_detection" if len(screenshots) == 0 else "detection"
                    })  # Тип скриншота: первый успешный кадр или обычное обнаружение

                    saved_screenshots += 1 # Увеличиваем счётчик сохранённых скриншотов

        video_writer.write(frame_for_video) # Записываем текущий обработанный кадр в итоговое видео
        frame_number += 1 # Переходим к следующему номеру кадра

    cap.release() # Освобождаем объект чтения видео и закрываем входной файл
    video_writer.release()  # Завершаем запись и закрываем выходной видеофайл

    scores = calculate_scores(points) # Вычисляем итоговые оценки на основе собранной траектории

    return { # Возвращаем итоговый JSON-ответ с результатами анализа
        "status": "success",
        "frames_processed": frame_number,
        "video_info": {
            "fps": round(fps, 2),
            "frame_count": frame_count,
            "duration_sec": round(duration, 2),
            "points_count": len(points),
            "detected_frames_count": len(points),
            "detection_model": "YOLOv8n + motion filtering",
            "detected_classes": list(VEHICLE_CLASSES)
        },
        "trajectory_points": points,
        "screenshots": screenshots,
        "processed_video_path": processed_video_path,
        "scores": scores
    }