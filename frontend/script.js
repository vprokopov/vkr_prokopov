let currentTrajectory = [];
let selectedIndex = 0;
let toastTimer = null;
let currentRequestController = null;
let lastAnalysisResult = null;
let speedChartInstance = null;
let angleChartInstance = null;

async function analyzeVideo() {
    const input = document.getElementById("videoInput");
    const loader = document.getElementById("loader");
    const analyzeBtn = document.getElementById("analyzeBtn");

    if (!input.files || input.files.length === 0) {
        showToast("Для анализа дрифт-заезда необходимо загрузить видео");
        return;
    }

    resetUI();

    try {
        setStatus("loading", "В процессе");
        loader.classList.remove("hidden");
        analyzeBtn.disabled = true;

        const formData = new FormData();
        formData.append("file", input.files[0]);

        currentRequestController = new AbortController();
        document.getElementById("cancelBtn").classList.remove("hidden");
        
        const response = await fetch("http://127.0.0.1:8000/analyze-video", {
            method: "POST",
            body: formData,
            cache: "no-store",
            signal: currentRequestController.signal
        });

        if (!response.ok) {
            throw new Error("Ошибка backend: " + response.status);
        }

        const data = await response.json();
        lastAnalysisResult = data;
        document.getElementById("downloadResultBtn").classList.remove("hidden");

        selectedIndex = 0;

        renderScores(data.scores);
        renderDetailedScores(data.scores);
        renderVideoInfo(data.video_info);
        drawTrajectory(data.trajectory_points);
        renderCharts(data.trajectory_points);
        renderScreenshots(data.screenshots);
        renderProcessedVideo(data.processed_video_path);

        document.getElementById("results").classList.remove("hidden");
        document.getElementById("trajectory").classList.remove("hidden");
        document.getElementById("detectionBlock").classList.remove("hidden");
        document.getElementById("processedVideoBlock").classList.remove("hidden");
        document.getElementById("formulaBlock").classList.remove("hidden");
        document.getElementById("limitations").classList.remove("hidden");

        loader.classList.add("hidden");
        setStatus("success", "Видео обработано");
        updateActiveNavLink();

    } catch (error) {
        console.error(error);
        loader.classList.add("hidden");
        setStatus("error", "Ошибка анализа");

        if (error.name === "AbortError") {
            setStatus("idle", "Анализ отменён");
        } else {
            console.error(error);
            setStatus("error", "Ошибка анализа");
        }
    } finally {
        analyzeBtn.disabled = false;
        loader.classList.add("hidden");
        document.getElementById("cancelBtn").classList.add("hidden");
        currentRequestController = null;
        analyzeBtn.disabled = false;
    }
}

function setStatus(type, text) {
    const statusText = document.getElementById("statusText");

    statusText.classList.remove(
        "hidden",
        "status-idle",
        "status-loading",
        "status-success",
        "status-error"
    );

    statusText.classList.add(`status-${type}`);
    statusText.textContent = text;
}

function renderScores(scores) {
    const table = document.getElementById("scoresTable");

    const totalClass =
        scores.total_score > 80
            ? "score-excellent"
            : scores.total_score > 60
            ? "score-good"
            : "score-bad";

    const totalText =
        scores.total_score > 80
            ? "Отличный"
            : scores.total_score > 60
            ? "Хороший"
            : "Слабый";

    table.innerHTML = `
        <tr><td>Траектория</td><td>${scores.trajectory_score} / 100</td></tr>
        <tr><td>Угол заноса</td><td>${scores.angle_score} / 100</td></tr>
        <tr><td>Стабильность</td><td>${scores.stability_score} / 100</td></tr>
        <tr><td>Скорость</td><td>${scores.speed_score} / 100</td></tr>
        <tr>
            <td><b>Итоговая оценка</b></td>
            <td>
                <b class="${totalClass}">${scores.total_score} / 100</b>
                <span class="score-badge ${totalClass}">${totalText}</span>
            </td>
        </tr>
    `;
}

function drawTrajectory(points) {
    const canvas = document.getElementById("trajectoryCanvas");
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!points || points.length < 2) {
        ctx.font = "16px Arial";
        ctx.fillText("Недостаточно точек для построения траектории", 20, 40);
        return;
    }

    const cleanedPoints = [];

    points.forEach((point, index) => {
        if (index === 0) {
            cleanedPoints.push(point);
            return;
        }

        const prev = cleanedPoints[cleanedPoints.length - 1];
        const dx = point.x - prev.x;
        const dy = point.y - prev.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 250) {
            cleanedPoints.push(point);
        }
    });

    currentTrajectory = cleanedPoints;

    if (selectedIndex >= currentTrajectory.length) {
        selectedIndex = currentTrajectory.length - 1;
    }

    const padding = 70;

    const xs = currentTrajectory.map(p => p.x);
    const ys = currentTrajectory.map(p => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const normalizedPoints = currentTrajectory.map(point => ({
        x: padding + ((point.x - minX) / rangeX) * (canvas.width - padding * 2),
        y: padding + ((point.y - minY) / rangeY) * (canvas.height - padding * 2),
        original: point
    }));

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#cbd5e1";
    ctx.strokeRect(
        padding,
        padding,
        canvas.width - padding * 2,
        canvas.height - padding * 2
    );

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#111827";

    normalizedPoints.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
    });

    ctx.stroke();

    normalizedPoints.forEach((point, index) => {
        ctx.beginPath();

        if (index === selectedIndex) {
            ctx.fillStyle = "#ef4444";
            ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        } else {
            ctx.fillStyle = "#111827";
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        }

        ctx.fill();
    });

    ctx.fillStyle = "#111827";
    ctx.font = "15px Arial";

    const start = normalizedPoints[0];
    const finish = normalizedPoints[normalizedPoints.length - 1];

    ctx.fillText("Начало", start.x + 10, start.y - 10);
    ctx.fillText("Конец", finish.x + 10, finish.y - 10);

    setupSlider(currentTrajectory.length);
    updateSelectedPointInfo(currentTrajectory[selectedIndex]);
}

function renderScreenshots(screenshots) {
    const container = document.getElementById("screenshots");
    container.innerHTML = "";

    if (!screenshots || !screenshots.length) {
        container.innerHTML = "<p>Кадры с детекцией не сформированы.</p>";
        return;
    }

    screenshots.forEach(item => {
        const img = document.createElement("img");
        img.src = "http://127.0.0.1:8000/" + item.path + "?t=" + Date.now();
        img.style.cursor = "zoom-in";
        img.onclick = () => openImageModal(img.src);
        img.alt = "Кадр с детекцией автомобиля";

        const caption = document.createElement("p");
        caption.textContent =
            item.type === "first_detection"
                ? `Первое обнаружение: кадр №${item.frame}`
                : `Кадр №${item.frame}`;

        const block = document.createElement("div");
        block.className = "screenshot-card";
        block.appendChild(img);
        block.appendChild(caption);

        container.appendChild(block);
    });
}

function renderVideoInfo(info) {
    const table = document.getElementById("videoInfoTable");

    table.innerHTML = `
        <tr>
            <td>
                FPS
                <span class="tooltip">?
                    <span class="tooltip-text">
                        Frames Per Second — количество кадров в секунду исходного видео.
                        Определяется через свойства видеопотока.
                    </span>
                </span>
            </td>
            <td>${info.fps}</td>
        </tr>

        <tr>
            <td>
                Количество кадров
                <span class="tooltip">?
                    <span class="tooltip-text">
                        Общее число кадров в видео. Получается из метаданных видеофайла.
                    </span>
                </span>
            </td>
            <td>${info.frame_count}</td>
        </tr>

        <tr>
            <td>
                Длительность видео
                <span class="tooltip">?
                    <span class="tooltip-text">
                        Рассчитывается как: количество кадров / FPS.
                    </span>
                </span>
            </td>
            <td>${info.duration_sec} сек.</td>
        </tr>

        <tr>
            <td>
                Точек траектории
                <span class="tooltip">?
                    <span class="tooltip-text">
                        Количество кадров, на которых система обнаружила движущийся объект
                        и зафиксировала его координаты.
                    </span>
                </span>
            </td>
            <td>${info.points_count}</td>
        </tr>

        <tr>
            <td>
                Кадров с обнаружением автомобиля
                <span class="tooltip">?
                    <span class="tooltip-text">
                        Число кадров, где алгоритм детекции движения выделил объект
                        и построил bounding box.
                    </span>
                </span>
            </td>
            <td>${info.detected_frames_count}</td>
        </tr>
    `;
}

function renderDetailedScores(scores) {
    const table = document.getElementById("detailedScoresTable");

    const rows = [
        ["Траектория", scores.trajectory_score, 0.4],
        ["Угол заноса", scores.angle_score, 0.3],
        ["Стабильность", scores.stability_score, 0.2],
        ["Скорость", scores.speed_score, 0.1]
    ];

    let total = 0;

    table.innerHTML = rows.map(row => {
        const contribution = row[1] * row[2];
        total += contribution;

        return `
            <tr>
                <td>${row[0]}</td>
                <td>${row[1]}</td>
                <td>${row[2]}</td>
                <td>${contribution.toFixed(1)}</td>
            </tr>
        `;
    }).join("");

    table.innerHTML += `
        <tr>
            <td><b>Итого</b></td>
            <td></td>
            <td></td>
            <td><b>${total.toFixed(1)}</b></td>
        </tr>
    `;
}

function setupSlider(length) {
    const slider = document.getElementById("trajectorySlider");

    slider.max = length - 1;
    slider.value = selectedIndex;

    slider.oninput = function () {
        selectedIndex = parseInt(this.value);
        drawTrajectory(currentTrajectory);
    };
}

function updateSelectedPointInfo(point) {
    const info = document.getElementById("selectedPointInfo");
    const img = document.getElementById("selectedFrameImage");

    if (!point) {
        info.textContent = "";
        img.style.display = "none";
        return;
    }

    info.textContent = `Кадр: ${point.frame}, X: ${point.x}, Y: ${point.y}`;

    if (point.frame_image_path) {
        img.src = "http://127.0.0.1:8000/" + point.frame_image_path + "?t=" + Date.now();
        img.style.display = "block";
        img.style.cursor = "zoom-in";
        img.onclick = () => openImageModal(img.src);
    } else {
        img.style.display = "none";
    }
}

function renderProcessedVideo(path) {
    const video = document.getElementById("processedVideo");
    const button = document.querySelector(".video-play-button");
    const state = document.getElementById("videoState");
    const shell = document.querySelector(".video-shell");
    const caption = document.querySelector(".video-caption");
    const downloadBtn = document.getElementById("downloadVideoBtn");

    if (!path) {
        video.style.display = "none";

        if (downloadBtn) {
            downloadBtn.classList.add("hidden");
            downloadBtn.removeAttribute("href");
        }

        return;
    }

    const videoUrl = "http://127.0.0.1:8000/" + path + "?t=" + Date.now();

    video.src = videoUrl;
    video.load();
    video.style.display = "block";

    if (downloadBtn) {
        downloadBtn.href = videoUrl;
        downloadBtn.classList.remove("hidden");
    }

    button.textContent = "";
    button.classList.remove("pause", "pause-state", "is-hidden");
    button.classList.add("play");

    caption.classList.remove("is-hidden");
    state.textContent = "Готово к просмотру";

    video.onended = () => {
        button.textContent = "";
        button.classList.remove("pause", "pause-state", "is-hidden");
        button.classList.add("play");

        caption.classList.remove("is-hidden");
        state.textContent = "Просмотр завершён";
    };

    shell.onmouseenter = () => {
        button.classList.remove("is-hidden");
        caption.classList.remove("is-hidden");
    };

    shell.onmouseleave = () => {
        if (!video.paused) {
            button.classList.add("is-hidden");
            caption.classList.add("is-hidden");
        }
    };
}

function showSelectedFile() {
    const input = document.getElementById("videoInput");
    const fileName = document.getElementById("fileName");
    const fileSize = document.getElementById("fileSize");
    const analyzeBtn = document.getElementById("analyzeBtn");

    resetUI();

    if (!input.files.length) {
        fileName.textContent = "Файл не выбран";
        fileSize.textContent = "Загрузите видео в формате MP4 / MOV";
        analyzeBtn.disabled = true;
        setStatus("idle", "Не загружен");
        return;
    }

    const file = input.files[0];
    const sizeInMb = file.size / (1024 * 1024);

    fileName.textContent = file.name;
    fileSize.textContent = `${sizeInMb.toFixed(2)} MB`;
    analyzeBtn.disabled = false;
    setStatus("idle", "Видео загружено, не обработано");
}

const navLinks = document.querySelectorAll(".app-header nav a");

const sections = [
    document.getElementById("upload"),
    document.getElementById("results"),
    document.getElementById("trajectory"),
    document.getElementById("limitations")
];

function updateActiveNavLink() {
    let currentSectionId = "upload";

    const visibleSections = sections.filter(
        section => section && !section.classList.contains("hidden")
    );

    if (visibleSections.length === 0) {
        return;
    }

    const isBottom =
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 20;

    if (isBottom) {
        currentSectionId = visibleSections[visibleSections.length - 1].id;
    } else {
        visibleSections.forEach(section => {
            const sectionTop = section.offsetTop - 140;

            if (window.scrollY >= sectionTop) {
                currentSectionId = section.id;
            }
        });
    }

    navLinks.forEach(link => {
        link.classList.remove("active");

        if (link.getAttribute("href") === `#${currentSectionId}`) {
            link.classList.add("active");
        }
    });
}

function openImageModal(src) {
    const modal = document.getElementById("imageModal");
    const img = document.getElementById("modalImage");

    img.src = src;
    modal.classList.remove("hidden");
}

function closeImageModal() {
    document.getElementById("imageModal").classList.add("hidden");
}

function toggleProcessedVideo() {
    const video = document.getElementById("processedVideo");
    const button = document.querySelector(".video-play-button");
    const state = document.getElementById("videoState");

    if (video.paused) {
        video.play();
        button.classList.remove("play");
        button.classList.add("pause");
        state.textContent = "Воспроизведение";
    } else {
        video.pause();
        button.classList.remove("pause");
        button.classList.add("play");
        state.textContent = "Пауза";
    }
}

function resetUI() {
    document.getElementById("scoresTable").innerHTML = "";
    document.getElementById("detailedScoresTable").innerHTML = "";
    document.getElementById("videoInfoTable").innerHTML = "";

    const canvas = document.getElementById("trajectoryCanvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    document.getElementById("screenshots").innerHTML = "";

    const selectedImg = document.getElementById("selectedFrameImage");
    selectedImg.style.display = "none";
    selectedImg.src = "";

    const video = document.getElementById("processedVideo");
    video.pause();
    video.src = "";
    video.load();

    const button = document.querySelector(".video-play-button");
    const caption = document.querySelector(".video-caption");
    const state = document.getElementById("videoState");

    if (button) {
        button.textContent = "";
        button.classList.remove("pause", "pause-state", "is-hidden");
        button.classList.add("play");
    }

    if (caption) {
        caption.classList.remove("is-hidden");
    }

    if (state) {
        state.textContent = "Готово к просмотру";
    }

    document.getElementById("selectedPointInfo").textContent = "";

    document.getElementById("results").classList.add("hidden");
    document.getElementById("trajectory").classList.add("hidden");
    document.getElementById("detectionBlock").classList.add("hidden");
    document.getElementById("processedVideoBlock").classList.add("hidden");
    document.getElementById("formulaBlock").classList.add("hidden");
    document.getElementById("limitations").classList.add("hidden");

    currentTrajectory = [];
    selectedIndex = 0;
}

function showToast(message = "Для анализа дрифт-заезда необходимо загрузить видео") {
    const toast = document.getElementById("toast");
    const toastText = document.getElementById("toastText");

    if (!toast || !toastText) {
        return;
    }

    toastText.textContent = message;
    toast.classList.add("show");

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
        hideToast();
    }, 5000);
}

function hideToast() {
    const toast = document.getElementById("toast");

    if (!toast) {
        return;
    }

    toast.classList.remove("show");

    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }
}

window.addEventListener("scroll", updateActiveNavLink);

window.addEventListener("load", () => {
    const analyzeBtn = document.getElementById("analyzeBtn");

    if (analyzeBtn) {
        analyzeBtn.disabled = true;
    }

    setStatus("idle", "Видео не загружено");
    updateActiveNavLink();
});

const dropZone = document.getElementById("dropZone");
const videoInput = document.getElementById("videoInput");

dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");

    const files = event.dataTransfer.files;

    if (!files.length) {
        return;
    }

    const file = files[0];

    if (!file.type.startsWith("video/")) {
        showToast("Загрузите видеофайл в формате MP4 или MOV");
        return;
    }

    videoInput.files = files;
    showSelectedFile();
});

function cancelAnalysis() {
    if (currentRequestController) {
        currentRequestController.abort();
    }
}

function downloadAnalysisResult() {
    if (!lastAnalysisResult) {
        showToast("Нет данных для скачивания");
        return;
    }

    const blob = new Blob(
        [JSON.stringify(lastAnalysisResult, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "drift-analysis-result.json";
    link.click();

    URL.revokeObjectURL(url);
}

function renderCharts(points) {
    if (!points || points.length < 2) {
        return;
    }

    const frames = [];
    const speeds = [];
    const angles = [];

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;

        const fps = 30; // или data.video_info.fps, если хочешь точнее
        const speed = Math.sqrt(dx * dx + dy * dy) * fps;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        frames.push(curr.frame);
        speeds.push(Number(speed.toFixed(2)));
        angles.push(Number(angle.toFixed(2)));
    }

    if (speedChartInstance) {
        speedChartInstance.destroy();
    }

    if (angleChartInstance) {
        angleChartInstance.destroy();
    }

    const speedCtx = document.getElementById("speedChart");
    const angleCtx = document.getElementById("angleChart");

    speedChartInstance = new Chart(speedCtx, {
        type: "line",
        data: {
            labels: frames,
            datasets: [{
                label: "Скорость (px/сек)",
                data: speeds,
                tension: 0.35
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + " пикс/сек";
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Кадры видео"
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: "Скорость (px/сек)"
                    }
                }
            }
        }
    });

    angleChartInstance = new Chart(angleCtx, {
        type: "line",
        data: {
            labels: frames,
            datasets: [{
                label: "Угол направления",
                data: angles,
                tension: 0.35
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + "°";
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Кадры видео"
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: "Угол (градусы)"
                    }
                }
            }
        }
    });
}

async function runDemoAnalysis() {
    const loader = document.getElementById("loader");

    try {
        resetUI();

        setStatus("loading", "Запущен демо-анализ...");
        loader.classList.remove("hidden");

        const response = await fetch("http://127.0.0.1:8000/demo-analysis", {
            method: "POST",
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Ошибка demo backend: " + response.status);
        }

        const data = await response.json();

        if (data.status === "error") {
            throw new Error(data.message);
        }

        lastAnalysisResult = data;
        selectedIndex = 0;

        renderScores(data.scores);
        renderDetailedScores(data.scores);
        renderVideoInfo(data.video_info);
        drawTrajectory(data.trajectory_points);
        renderCharts(data.trajectory_points);
        renderScreenshots(data.screenshots);
        renderProcessedVideo(data.processed_video_path);

        document.getElementById("results").classList.remove("hidden");
        document.getElementById("trajectory").classList.remove("hidden");
        document.getElementById("detectionBlock").classList.remove("hidden");
        document.getElementById("processedVideoBlock").classList.remove("hidden");
        document.getElementById("formulaBlock").classList.remove("hidden");
        document.getElementById("limitations").classList.remove("hidden");
        document.getElementById("downloadResultBtn").classList.remove("hidden");

        setStatus("success", "Демо-анализ выполнен");
        updateActiveNavLink();

    } catch (error) {
        console.error(error);
        setStatus("error", "Ошибка демо-анализа");
        showToast("Не удалось запустить демо-анализ");
    } finally {
        loader.classList.add("hidden");
    }
}