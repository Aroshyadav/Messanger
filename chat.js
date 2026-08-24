const socket = io();
const params = new URLSearchParams(window.location.search);
const username = params.get("username");
const room = params.get("room");

if (!username || !room) {
    alert("Invalid access. Please login again.");
    window.location.href = "/";
}

let form, input, messagesContainer, backBtn, mediaInput, mediaBtn;

// Join room as soon as the socket connects
socket.on("connect", () => {
    console.log("Connected to server. Joining room:", room);
    socket.emit("join room", room);
});

document.addEventListener("DOMContentLoaded", () => {
    form = document.getElementById("chat-form");
    input = document.getElementById("msg");
    messagesContainer = document.getElementById("messages");
    backBtn = document.getElementById("back-to-dashboard");
    mediaInput = document.getElementById("media-input");
    mediaBtn = document.getElementById("media-btn");

    if (backBtn && username) {
        backBtn.href = `/dashboard?username=${username}`;
    }

    // Trigger file selection
    if (mediaBtn) {
        mediaBtn.onclick = () => mediaInput.click();
    }

    // Handle File Selection and Upload
    if (mediaInput) {
        mediaInput.onchange = async () => {
            const file = mediaInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('media', file);

            try {
                const response = await fetch('/upload', { method: 'POST', body: formData });
                const data = await response.json();

                if (data.filePath) {
                    socket.emit("chat message", {
                        username: username,
                        room: room,
                        message: "",
                        fileUrl: data.filePath,
                        messageType: 'image',
                        time: new Date()
                    });
                }
                mediaInput.value = "";
            } catch (err) {
                console.error("Upload failed:", err);
                alert("Could not upload image.");
            }
        };
    }

    // Handle Text Message Submission
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        const val = input.value.trim();

        if (val) {
            socket.emit("chat message", {
                username: username,
                room: room,
                message: val,
                messageType: 'text',
                time: new Date()
            });
            input.value = "";
            input.focus();
        }
    });
});

// Listener for history/initial messages
socket.on("load messages", (msgs) => {
    if (messagesContainer) {
        messagesContainer.innerHTML = "";
        msgs.forEach(displayMessage);
    }
});

// Listener for real-time messages
socket.on("chat message", (data) => {
    console.log("Message received from server:", data);
    displayMessage(data);
});

/**
 * Renders the message bubble to the UI
 */

/**
 * Renders the message bubble to the UI
 */
function displayMessage(data) {
    if (!messagesContainer) return;

    const div = document.createElement("div");
    div.classList.add("message");

    if (data.username === username) {
        div.classList.add("me");
    }

    const timeString = new Date(data.time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    // --- FIXED CONTENT LOGIC (No double declaration) ---
    let content = "";
    if (data.fileUrl) {
        content += `<img src="${data.fileUrl}" class="chat-media" onclick="window.open('${data.fileUrl}')">`;
    }
    if (data.message) {
        content += `<p>${data.message}</p>`;
    }

    div.innerHTML = `
        <strong>${data.username}</strong>
        <div class="bubble-content">${content}</div>
        <span class="time">${timeString}</span>
    `;

    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ================= TYPING INDICATOR LOGIC =================

let typingTimeout;

// 1. Tell server when user is typing
input.addEventListener("input", () => {
    socket.emit("typing", { username, room });

    // Clear existing timeout
    clearTimeout(typingTimeout);

    // After 2 seconds of no typing, tell server to stop
    typingTimeout = setTimeout(() => {
        socket.emit("stop typing", room);
    }, 2000);
});

// 2. Listen for other users typing
const statusSpan = document.querySelector(".header-info span");

socket.on("typing", (data) => {
    statusSpan.innerText = `${data.username} is typing...`;
    statusSpan.style.color = "#25D366"; // WhatsApp Green
});

socket.on("stop typing", () => {
    statusSpan.innerText = "Online";
    statusSpan.style.color = "white";
});
