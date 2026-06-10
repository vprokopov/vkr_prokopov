import math # Импорт модуля math — он нужен для корня и функций работы с углами


def calculate_scores(trajectory_points): # Функция, которая считает оценки по траектории
    if not trajectory_points or len(trajectory_points) < 2: # Если точек нет или их меньше двух
        return { # Сразу возвращаю нулевые оценки
            "trajectory_score": 0,
            "angle_score": 0,
            "stability_score": 0,
            "speed_score": 0,
            "total_score": 0
        }

    distances = []  # Список для расстояний между соседними точками траектории
    angles = []  # Список для углов направления движения между точками

    for i in range(1, len(trajectory_points)): # Прохожу по всем точкам, начиная со второй
        prev = trajectory_points[i - 1] # Предыдущая точка траектории
        curr = trajectory_points[i]  # Текущая точка траектории

        dx = curr["x"] - prev["x"] # Изменение координаты X между точками
        dy = curr["y"] - prev["y"] # Изменение координаты Y между точками

        distance = math.sqrt(dx ** 2 + dy ** 2) # Евклидово расстояние между точками
        angle = math.degrees(math.atan2(dy, dx)) # Угол направления движения (в градусах)

        distances.append(distance) # Сохранение расстояния в общий список
        angles.append(angle) # Сохранение угла в общий список

    total_distance = sum(distances) # Общая длина траектории как сумма всех смещений
    avg_speed = total_distance / len(distances) # Среднее смещение между кадрами - условная "скорость"

    # Скорость - чем больше среднее смещение между кадрами, тем выше оценка
    speed_score = min(100, round(avg_speed * 2)) # Линейно масштабирую среднюю скорость и ограничиваю 100 баллами

    # Стабильность — чем меньше разброс расстояний между точками, тем выше оценка
    if len(distances) > 1: # Считаю стабильность только если расстояний больше одного
        avg_distance = sum(distances) / len(distances) # Среднее расстояние между точками
        variance = sum((d - avg_distance) ** 2 for d in distances) / len(distances) # Дисперсия расстояний

        # Более мягкая нормализация, чтобы оценка не падала сразу в 0
        stability_score = max(20, 100 - round(variance / 80)) # Чем больше дисперсия, тем ниже балл, но не ниже 20
    else:
        stability_score = 70 # Если расстояние всего одно, даём условный средний балл по стабильности

    # Угол заноса — оцениваю изменение направления движения
    if len(angles) > 1: # Анализ углов имеет смысл только при нескольких значениях
        angle_changes = [] # Список изменений угла между соседними участками траектории

        for i in range(1, len(angles)):   # Проходим по всем углам, начиная со второго
            diff = abs(angles[i] - angles[i - 1]) # Разница между текущим и предыдущим углом
            diff = min(diff, 360 - diff)  # Беру наименьшее изменение, учитывая круговую природу угла
            angle_changes.append(diff) # Сохраняю изменение угла

        avg_angle_change = sum(angle_changes) / len(angle_changes) # Средняя величина изменения угла
        angle_score = min(100, round(avg_angle_change * 4)) # Масштабирую её в диапазон до 100 баллов
    else:
        angle_score = 60 # Если данных мало, ставлю условный базовый балл по углу

    # Траектория - чем больше точек и чем плавнее линия, тем выше оценка
    points_factor = min(100, len(trajectory_points) * 5)  # Количество точек переводим в максимум 100 баллов
    trajectory_score = round((points_factor * 0.5) + (stability_score * 0.5))  # Итог по траектории = полусумма И вклада по количеству точек и стабильности

    total_score = round( # Общий итоговый балл
        trajectory_score * 0.4 + # 40% - вклад оценки траектории
        angle_score * 0.3 + # 30% - вклад оценки по углу
        stability_score * 0.2 + # 20% - вклад стабильности
        speed_score * 0.1, # 10% - вклад скорости
        2 # Общий балл до двух знаков после запятой
    )

    return { # Возвращаю все частные оценки и общий балл
        "trajectory_score": trajectory_score,
        "angle_score": angle_score,
        "stability_score": stability_score,
        "speed_score": speed_score,
        "total_score": total_score
    }