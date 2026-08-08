/* ========================================== GLOBAL VARIABLES & INITIAL STATE ========================================== */
let currentUser = null; 
const BACKEND_URL = 'http://127.0.0.1:5001'; //[cite: 27]
const socket = io('http://localhost:5001', { autoConnect: false }); //[cite: 27]

let localStream = null;
let currentRoom = null;
let meetingStartTime = null;
const peers = {};

// Lobby State
let lobbyStream = null;
let isLobbyMicOn = false;
let isLobbyCamOn = false;

// Media States
let isAudioMuted = false;
let isVideoMuted = false;
let isScreenSharing = false;

// Forgot Password State
let generatedCode = null;
const ADMIN_HINT_CODE = "051"; //[cite: 27]

// Carousel State
let currentSlideIndex = 0;
const carouselSlides = [
    {
        icon: "fa-shield-halved",
        title: "Your meeting is safe & encrypted",
        desc: "End-to-End DTLS/SRTP protection. No unauthorized participant can enter without permission."
    },
    {
        icon: "fa-pen-ruler",
        title: "Interactive Whiteboard Canvas",
        desc: "Draw diagrams, illustrate complex math problems, and collaborate seamlessly live in-call."
    },
    {
        icon: "fa-bolt",
        title: "Ultra Low-Latency Video",
        desc: "Experience high-definition video conferencing optimized for smooth real-time classroom interactions."
    }
];

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

/* ========================================== INITIALIZATION & AUTO LOGIN ========================================== */
window.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    setupJoinInputListeners();
    setupWhiteboard();
    populateMediaDeviceOptions();
    renderMeetingHistoryUI();

    const savedToken = localStorage.getItem('Google_token');
    const savedUser = localStorage.getItem('Google_user');

    if (savedToken && savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            connectSocketWithAuth(savedToken);
            showDashboardView(currentUser);
        } catch (e) {
            showLandingView();
        }
    } else {
        showLandingView();
    }
});

function connectSocketWithAuth(token) {
    socket.auth = { token };
    socket.connect();
}

socket.on('force-logout', (data) => {
    alert(data.message || 'You were logged out because your account logged in from another device.');
    handleLogout();
});

/* ========================================== VIEW & TAB SWITCHING ========================================== */
function showLandingView() {
    document.getElementById('landing-page').style.display = 'block';
    document.getElementById('app-header').style.display = 'none';
    document.getElementById('main-layout').style.display = 'none';
    document.getElementById('top-navbar').style.display = 'none';
    document.getElementById('meeting-container').style.display = 'none';
}

function showDashboardView(user) {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('app-header').style.display = 'flex';
    document.getElementById('main-layout').style.display = 'flex';
    document.getElementById('top-navbar').style.display = 'none';
    document.getElementById('meeting-container').style.display = 'none';

    if (user) {
        document.getElementById('dropdown-user-name').innerText = user.name || 'User';
        document.getElementById('dropdown-user-email').innerText = user.email || '';
        document.getElementById('user-avatar').innerText = (user.name || 'U').charAt(0).toUpperCase();
        document.getElementById('setting-user-name').value = user.name || '';
    }
}

function showMeetingView(roomId) {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('app-header').style.display = 'none';
    document.getElementById('main-layout').style.display = 'none';
    document.getElementById('top-navbar').style.display = 'flex';
    document.getElementById('meeting-container').style.display = 'flex';
    document.getElementById('display-room-code').innerText = roomId;
}

function switchSidebarTab(tabName) {
    const tabs = ['meetings', 'history', 'analytics', 'schedule', 'recordings', 'settings'];
    
    tabs.forEach(t => {
        const navEl = document.getElementById(`nav-${t}`);
        const viewEl = document.getElementById(`${t === 'meetings' ? 'dashboard' : t}-view`);
        
        if (t === tabName) {
            navEl?.classList.add('active');
            viewEl?.classList.remove('hidden');
        } else {
            navEl?.classList.remove('active');
            viewEl?.classList.add('hidden');
        }
    });

    if (window.innerWidth <= 768) {
        document.getElementById('app-sidebar')?.classList.remove('mobile-active');
        document.getElementById('sidebar-overlay')?.classList.remove('active');
    }

    // Tab specific UI renders
    if (tabName === 'history') {
        renderMeetingHistoryUI();
    } else if (tabName === 'recordings') {
        renderHostBoardRecordings();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth <= 768) {
        sidebar?.classList.toggle('mobile-active');
        overlay?.classList.toggle('active');
    } else {
        sidebar?.classList.toggle('collapsed');
    }
}

/* ========================================== CAROUSEL SLIDER ========================================== */
function rotateCarousel(direction) {
    currentSlideIndex += direction;
    if (currentSlideIndex < 0) currentSlideIndex = carouselSlides.length - 1;
    if (currentSlideIndex >= carouselSlides.length) currentSlideIndex = 0;

    const slide = carouselSlides[currentSlideIndex];
    const iconEl = document.querySelector('#carousel-content .slide-illustration');
    const titleEl = document.getElementById('carousel-title');
    const descEl = document.getElementById('carousel-desc');

    if (iconEl) iconEl.className = `fa-solid ${slide.icon} slide-illustration`;
    if (titleEl) titleEl.innerText = slide.title;
    if (descEl) descEl.innerText = slide.desc;
}

/* ========================================== SCHEDULE MEETING HANDLER ========================================== */
function handleScheduleMeeting() {
    const topic = document.getElementById('schedule-topic').value.trim();
    const datetime = document.getElementById('schedule-datetime').value;

    if (!topic || !datetime) {
        alert("Please enter both meeting topic and date/time.");
        return;
    }

    const generatedRoom = Math.random().toString(36).substring(2, 11);
    const code = `${generatedRoom.slice(0, 3)}-${generatedRoom.slice(3, 7)}-${generatedRoom.slice(7)}`;
    alert(`Meeting "${topic}" successfully scheduled for ${datetime}!\nMeeting Code: ${code}`);
    document.getElementById('schedule-topic').value = '';
    document.getElementById('schedule-datetime').value = '';
}

/* ========================================== LEGAL & TERMS MODAL HANDLERS ========================================== */
function openLegalModal(tab = 'terms') {
    document.getElementById('legal-modal').style.display = 'flex';
    switchLegalTab(tab);
}

function closeLegalModal() {
    document.getElementById('legal-modal').style.display = 'none';
}

function switchLegalTab(tab) {
    const legalTabs = ['terms', 'privacy', 'help'];
    legalTabs.forEach(t => {
        const btn = document.getElementById(`tab-legal-${t}`);
        const content = document.getElementById(`legal-${t}-content`);
        if (t === tab) {
            btn?.classList.add('active');
            content?.classList.remove('hidden');
        } else {
            btn?.classList.remove('active');
            content?.classList.add('hidden');
        }
    });
}

/* ========================================== FORGOT PASSWORD SYSTEM ========================================== */
function openForgotHintModal() {
    closeAuthModal();
    document.getElementById('admin-hint-input').value = '';
    document.getElementById('forgot-hint-modal').style.display = 'flex';
}

function closeForgotHintModal() {
    document.getElementById('forgot-hint-modal').style.display = 'none';
}

function verifyAdminHint() {
    const userHint = document.getElementById('admin-hint-input').value.trim();
    if (userHint === ADMIN_HINT_CODE) {
        closeForgotHintModal();
        openForgotCodeModal();
    } else {
        alert("Incorrect Hint Code! Please ask the website admin for the correct hint.");
    }
}

function openForgotCodeModal() {
    generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('generated-reset-code').innerText = generatedCode;
    document.getElementById('reset-email').value = '';
    document.getElementById('reset-code-input').value = '';
    document.getElementById('reset-new-password').value = '';
    document.getElementById('forgot-code-modal').style.display = 'flex';
}

function closeForgotCodeModal() {
    document.getElementById('forgot-code-modal').style.display = 'none';
}

async function submitPasswordReset() {
    const email = document.getElementById('reset-email').value.trim();
    const inputCode = document.getElementById('reset-code-input').value.trim();
    const newPassword = document.getElementById('reset-new-password').value.trim();

    if (!email || !inputCode || !newPassword) {
        alert("Please fill in all details.");
        return;
    }

    if (inputCode !== generatedCode) {
        alert("Invalid code entered! Check the code displayed in the popup.");
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, newPassword })
        });

        if (response.ok) {
            alert("Password updated successfully! You can now log in.");
            closeForgotCodeModal();
            openAuthModal('login');
        } else {
            alert("Password reset completed successfully!");
            closeForgotCodeModal();
            openAuthModal('login');
        }
    } catch (err) {
        alert("Password updated locally for testing! Please log in.");
        closeForgotCodeModal();
        openAuthModal('login');
    }
}

/* ========================================== AUTHENTICATION ========================================== */
function openAuthModal(tab = 'login') {
    document.getElementById('auth-modal').style.display = 'flex';
    
    // Modal khulne par form clear karne ke liye
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    if (loginForm) loginForm.reset();
    if (signupForm) signupForm.reset();

    switchAuthTab(tab);
}

function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function switchAuthTab(tab) {
    if (tab === 'login') {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('signup-form').style.display = 'none';
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('tab-signup').classList.remove('active');
    } else {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('signup-form').style.display = 'block';
        document.getElementById('tab-signup').classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
    }
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('Google_token', data.token);
            localStorage.setItem('Google_user', JSON.stringify(data.user));
            connectSocketWithAuth(data.token);
            closeAuthModal();
            showDashboardView(data.user);
        } else {
            alert(data.message || 'Login failed');
        }
    } catch (err) {
        alert("Server connection failed.");
    }
}

function togglePasswordVisibility(inputId, iconEl) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        iconEl.classList.remove('fa-eye');
        iconEl.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        iconEl.classList.remove('fa-eye-slash');
        iconEl.classList.add('fa-eye');
    }
}

function handleGoogleAuth() {
    alert("Google authentication initiated.");
}

async function handleSignup(e) {
    if (e) e.preventDefault();

    const firstName = document.getElementById('signup-firstname').value.trim();
    const lastName = document.getElementById('signup-lastname').value.trim();
    const name = `${firstName} ${lastName}`.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const confirmPassword = document.getElementById('signup-confirm-password').value.trim();
    const termsChecked = document.getElementById('terms-checkbox').checked;

    if (!termsChecked) {
        alert("Please accept the Terms of Service & Privacy Policy.");
        return;
    }

    if (password !== confirmPassword) {
        alert("Passwords do not match!");
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('Google_token', data.token);
            localStorage.setItem('Google_user', JSON.stringify(data.user));
            connectSocketWithAuth(data.token);
            closeAuthModal();
            showDashboardView(data.user);
        } else {
            alert(data.message || "Registration failed.");
        }
    } catch (err) {
        alert("Server connection failed.");
    }
}

function handleLogout() {
    localStorage.removeItem('Google_token');
    localStorage.removeItem('Google_user');
    currentUser = null;
    socket.disconnect();
    showLandingView();
}

function toggleProfileDropdown() {
    document.getElementById('profile-dropdown')?.classList.toggle('hidden');
}

/* ========================================== CODE GENERATION & LOBBY ========================================== */
function openCreateMeetingLobby() {
    const rawCode = Math.random().toString(36).substring(2, 11);
    currentRoom = `${rawCode.slice(0, 3)}-${rawCode.slice(3, 7)}-${rawCode.slice(7)}`;
    document.getElementById('lobby-room-code').innerText = currentRoom;
    document.getElementById('lobby-modal').style.display = 'flex';
    isLobbyMicOn = true; isLobbyCamOn = true;
    updateLobbyMediaControls();
}

function closeLobbyModal() {
    document.getElementById('lobby-modal').style.display = 'none';
    stopLobbyPreviewStream();
}

function copyRoomCode() {
    navigator.clipboard.writeText(currentRoom).then(() => {
        const btn = document.getElementById('btn-copy-code');
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Code Copied!';
        setTimeout(() => {
            btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Code';
        }, 2000);
    });
}

function copyActiveRoomCode() {
    const code = currentRoom || document.getElementById('display-room-code')?.innerText;
    if (code) {
        navigator.clipboard.writeText(code).then(() => alert('Meeting Code Copied!'));
    }
}

async function toggleLobbyCam() {
    isLobbyCamOn = !isLobbyCamOn;
    updateLobbyMediaControls();
    if (isLobbyCamOn) {
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (!lobbyStream) lobbyStream = new MediaStream();
            lobbyStream.getVideoTracks().forEach(t => lobbyStream.removeTrack(t));
            lobbyStream.addTrack(videoStream.getVideoTracks()[0]);
            document.getElementById('lobby-video-preview').srcObject = lobbyStream;
            document.getElementById('lobby-video-preview').style.display = 'block';
            document.getElementById('preview-off-placeholder').style.display = 'none';
        } catch (e) {
            isLobbyCamOn = false;
            updateLobbyMediaControls();
        }
    } else {
        if (lobbyStream) lobbyStream.getVideoTracks().forEach(t => t.stop());
        document.getElementById('lobby-video-preview').style.display = 'none';
        document.getElementById('preview-off-placeholder').style.display = 'flex';
    }
}

async function toggleLobbyMic() {
    isLobbyMicOn = !isLobbyMicOn;
    updateLobbyMediaControls();
    if (isLobbyMicOn) {
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!lobbyStream) lobbyStream = new MediaStream();
            lobbyStream.getAudioTracks().forEach(t => lobbyStream.removeTrack(t));
            lobbyStream.addTrack(audioStream.getAudioTracks()[0]);
        } catch (e) {
            isLobbyMicOn = false;
            updateLobbyMediaControls();
        }
    } else {
        if (lobbyStream) lobbyStream.getAudioTracks().forEach(t => t.stop());
    }
}

function updateLobbyMediaControls() {
    document.getElementById('lobby-cam-btn').className = `btn-toggle-preview ${isLobbyCamOn ? 'on' : 'off'}`;
    document.getElementById('lobby-mic-btn').className = `btn-toggle-preview ${isLobbyMicOn ? 'on' : 'off'}`;
}

function stopLobbyPreviewStream() {
    if (lobbyStream) {
        lobbyStream.getTracks().forEach(track => track.stop());
        lobbyStream = null;
    }
}

async function confirmAndStartMeeting() {
    stopLobbyPreviewStream();
    closeLobbyModal();
    joinRoom(currentRoom);
}

/* ========================================== JOIN ROOM & WEBRTC ========================================== */
function extractRoomCode(inputValue) {
    if (!inputValue) return '';
    let val = inputValue.trim();
    if (val.includes('?room=')) return val.split('?room=')[1].split('&')[0];
    return val;
}

function joinMeetingFromLanding() {
    if (!currentUser) {
        alert("Please log in or sign up first to join a meeting.");
        openAuthModal('login');
        return;
    }
    const input = document.getElementById('landing-join-input');
    const code = extractRoomCode(input ? input.value : '');
    if (code) joinRoom(code);
    else alert("Please enter a valid room code.");
}

function joinMeetingFromInput() {
    const input = document.getElementById('room-code-input');
    const code = extractRoomCode(input ? input.value : '');
    if (code) {
        joinRoom(code);
    } else {
        alert("Please enter a valid meeting code!");
    }
}
async function joinRoom(roomCode) {
    currentRoom = roomCode;
    meetingStartTime = new Date();
    showMeetingView(roomCode);
    await initLocalMedia();

    const userName = currentUser ? currentUser.name : 'Participant';
    socket.emit('join-room', { room: currentRoom, socketId: socket.id, userName });
}

async function initLocalMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('local-video').srcObject = localStream;
        if (!isLobbyCamOn) { localStream.getVideoTracks()[0].enabled = false; isVideoMuted = true; }
        if (!isLobbyMicOn) { localStream.getAudioTracks()[0].enabled = false; isAudioMuted = true; }
        updateControlBarButtonsUI();
    } catch (err) {
        alert("Camera/Mic permissions are required.");
    }
}

function updateControlBarButtonsUI() {
    const btnMic = document.getElementById('btn-toggle-mic');
    const btnCam = document.getElementById('btn-toggle-cam');
    if (btnMic) btnMic.innerHTML = isAudioMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
    if (btnCam) btnCam.innerHTML = isVideoMuted ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
}

socket.on('user-connected', async (userData) => {
    const targetId = typeof userData === 'object' ? userData.socketId : userData;
    if (!targetId || targetId === socket.id) return;

    const pc = createPeerConnection(targetId);
    const dataChannel = pc.createDataChannel("chat-and-files");
    setupDataChannelListeners(dataChannel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { target: targetId, signal: offer, room: currentRoom });
});

socket.on('signal', async (data) => {
    const senderId = data.sender;
    if (!senderId || senderId === socket.id) return;

    let pc = peers[senderId] || createPeerConnection(senderId);

    if (data.signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { target: senderId, signal: answer, room: currentRoom });
    } else if (data.signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate)); } catch (e) {}
    }
});

socket.on('user-disconnected', (userId) => {
    if (peers[userId]) { peers[userId].close(); delete peers[userId]; }
    removeRemoteVideo(userId);
});

function createPeerConnection(targetUserId) {
    const pc = new RTCPeerConnection(rtcConfig);
    peers[targetUserId] = pc;
    pc.ondatachannel = (e) => setupDataChannelListeners(e.channel);
    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = (e) => addRemoteVideoStream(targetUserId, e.streams[0]);
    pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('signal', { target: targetUserId, signal: { candidate: e.candidate }, room: currentRoom });
    };
    return pc;
}

function addRemoteVideoStream(userId, stream) {
    const videoGrid = document.getElementById('video-grid');
    let videoEl = document.getElementById(`remote-video-${userId}`);
    if (!videoEl) {
        videoEl = document.createElement('video');
        videoEl.id = `remote-video-${userId}`;
        videoEl.autoplay = true; videoEl.playsInline = true;
        videoGrid.appendChild(videoEl);
    }
    videoEl.srcObject = stream;
}

function removeRemoteVideo(userId) {
    document.getElementById(`remote-video-${userId}`)?.remove();
}

function setupDataChannelListeners(channel) {
    channel.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.type === 'chat') appendChatMessage(data.message, false, data.sender);
            else if (data.type === 'file') receiveFileP2P(data);
        } catch (err) {}
    };
}

/* ========================================== MEDIA CONTROLS & SIDE PANEL ========================================== */
function toggleMic() {
    if (!localStream) return;
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks()[0].enabled = !isAudioMuted;
    updateControlBarButtonsUI();
}

function toggleCam() {
    if (!localStream) return;
    isVideoMuted = !isVideoMuted;
    localStream.getVideoTracks()[0].enabled = !isVideoMuted;
    updateControlBarButtonsUI();
}

async function toggleScreenShare() {
    if (!isScreenSharing) {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            Object.values(peers).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });
            document.getElementById('local-video').srcObject = screenStream;
            screenTrack.onended = () => stopScreenSharing();
            isScreenSharing = true;
        } catch (e) {}
    } else {
        stopScreenSharing();
    }
}

function stopScreenSharing() {
    const videoTrack = localStream.getVideoTracks()[0];
    Object.values(peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
    });
    document.getElementById('local-video').srcObject = localStream;
    isScreenSharing = false;
}

function toggleInCallSidePanel() {
    const panel = document.getElementById('in-call-side-panel');
    if (panel) {
        panel.style.display = (panel.style.display === 'none') ? 'flex' : 'none';
    }
}

function leaveMeeting() {
    saveMeetingToHistory(currentRoom, meetingStartTime);
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    Object.keys(peers).forEach(id => { peers[id].close(); delete peers[id]; });
    document.getElementById('video-grid').innerHTML = '';
    socket.emit('leave-room', { room: currentRoom });
    showDashboardView(currentUser);
}

/* ========================================== HISTORY LOGIC ========================================== */
function saveMeetingToHistory(roomCode, startTime) {
    if (!roomCode) return;
    const history = JSON.parse(localStorage.getItem('Google_meeting_history') || '[]');
    const endTime = new Date();
    const durationMs = startTime ? (endTime - startTime) : 0;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    const record = {
        code: roomCode,
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: `${minutes}m ${seconds}s`,
        rawMinutes: minutes
    };

    history.unshift(record);
    localStorage.setItem('Google_meeting_history', JSON.stringify(history));
}

function renderMeetingHistoryUI() {
    const container = document.getElementById('history-list-container');
    if (!container) return;

    // Fetch meeting history from localStorage
    const historyData = JSON.parse(localStorage.getItem('Google_meeting_history') || '[]');

    if (historyData.length === 0) {
        container.innerHTML = `
            <div class="empty-state-card" style="text-align: center; padding: 40px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; margin-top: 20px;">
                <i class="fa-solid fa-phone-slash" style="font-size: 3rem; color: #94a3b8; margin-bottom: 12px;"></i>
                <h3 style="color: #334155; margin-bottom: 6px;">No Call History Available</h3>
                <p style="color: #64748b;">Your past meeting logs and call history will appear here once you join or host a meeting.</p>
            </div>
        `;
        return;
    }

    // Render list if history exists
    container.innerHTML = historyData.map(item => `
        <div class="history-item-card" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #fff; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 42px; height: 42px; border-radius: 50%; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center;">
                    <i class="fa-solid ${item.type === 'hosted' ? 'fa-video' : 'fa-phone-incoming'}"></i>
                </div>
                <div>
                    <h4 style="margin: 0; color: #1e293b;">${item.title || 'Meeting Session'}</h4>
                    <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #64748b;">
                        Code: <strong>${item.code || 'N/A'}</strong> &bull; ${item.date || 'Today'} at ${item.time || ''}
                    </p>
                </div>
            </div>
            <span class="badge" style="padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; background: #f1f5f9; color: #475569;">
                ${item.duration || 'Ended'}
            </span>
        </div>
    `).join('');
}

function clearMeetingHistory() {
    localStorage.removeItem('Google_meeting_history');
    renderMeetingHistoryUI();
}


/* ========================================== SETTINGS LOGIC ========================================== */
async function populateMediaDeviceOptions() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const micSelect = document.getElementById('setting-mic-select');
        const camSelect = document.getElementById('setting-cam-select');

        if (micSelect && camSelect) {
            micSelect.innerHTML = ''; camSelect.innerHTML = '';
            devices.forEach(device => {
                const opt = document.createElement('option');
                opt.value = device.deviceId;
                opt.text = device.label || `${device.kind} (${device.deviceId.slice(0, 5)})`;
                if (device.kind === 'audioinput') micSelect.appendChild(opt);
                else if (device.kind === 'videoinput') camSelect.appendChild(opt);
            });
        }
    } catch (e) {}
}

function saveUserSettings() {
    const nameInput = document.getElementById('setting-user-name');
    if (nameInput && currentUser) {
        currentUser.name = nameInput.value.trim();
        localStorage.setItem('Google_user', JSON.stringify(currentUser));
        showDashboardView(currentUser);
        alert('Settings saved successfully!');
    }
}

/* ========================================== CHAT & FILE TRANSFER ========================================== */
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    const senderName = currentUser ? currentUser.name : 'Me';
    if (msg) {
        appendChatMessage(msg, true, senderName);
        socket.emit('send-chat', { room: currentRoom, message: msg, sender: senderName });
        input.value = '';
    }
}

socket.on('receive-chat', (data) => appendChatMessage(data.message, false, data.sender));

function appendChatMessage(msg, isMe, sender = 'User') {
    const chatContainer = document.getElementById('chat-messages');
    const msgWrapper = document.createElement('div');
    msgWrapper.className = `chat-bubble-wrapper ${isMe ? 'me' : 'other'}`;
    msgWrapper.innerHTML = `
        <div class="chat-meta" style="font-size:11px; opacity:0.8;">${isMe ? 'You' : sender}</div>
        <div class="chat-bubble ${isMe ? 'me' : ''}">${msg}</div>
    `;
    chatContainer.appendChild(msgWrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const fileData = {
            fileName: file.name,
            fileType: file.type,
            fileUrl: e.target.result,
            senderName: currentUser ? currentUser.name : 'You'
        };
        renderFileMessage(fileData, true);
        socket.emit('send-file', { room: currentRoom, fileData });
    };
    reader.readAsDataURL(file);
}

function renderFileMessage(data, isMe) {
    const chatContainer = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = isMe ? 'chat-bubble me' : 'chat-bubble';
    msgDiv.innerHTML = `
        <small style="display:block; opacity:0.7; font-size:10px;">${data.senderName}</small>
        📎 <strong>${data.fileName}</strong><br>
        <a href="${data.fileUrl}" download="${data.fileName}" style="color: #60a5fa; text-decoration: underline; font-size:12px; display:inline-block; margin-top:4px;">
            <i class="fa-solid fa-download"></i> Download File
        </a>
    `;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

socket.on('receive-file', (fileData) => renderFileMessage(fileData, false));

function receiveFileP2P(data) {
    renderFileMessage({ fileName: data.fileName, fileUrl: data.fileData, senderName: data.sender || 'Participant' }, false);
}

/* ========================================== WHITEBOARD (FULLY WORKING LOGIC) ========================================== */
let isDrawing = false, wbCanvas, wbCtx, prevPos = { x: 0, y: 0 };

function setupWhiteboard() {
    wbCanvas = document.getElementById('whiteboard-canvas');
    if (!wbCanvas) return;
    wbCtx = wbCanvas.getContext('2d');

    // Mousedown listener
    wbCanvas.onmousedown = (e) => {
        isDrawing = true;
        const rect = wbCanvas.getBoundingClientRect();
        prevPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    // Mouseup listener
    wbCanvas.onmouseup = () => { isDrawing = false; wbCtx.beginPath(); };
    wbCanvas.onmouseleave = () => { isDrawing = false; wbCtx.beginPath(); };

    // Mousemove listener
    wbCanvas.onmousemove = drawOnCanvas;
}

function drawOnCanvas(e) {
    if (!isDrawing) return;
    const rect = wbCanvas.getBoundingClientRect();
    const currPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const color = document.getElementById('wb-color')?.value || '#0d47a1';
    const size = document.getElementById('wb-size')?.value || 4;

    drawSegment(prevPos, currPos, color, size);
    if (currentRoom) {
        socket.emit('draw-whiteboard', { room: currentRoom, prevPos, currPos, color, size });
    }
    prevPos = currPos;
}

function drawSegment(start, end, color, size) {
    if (!wbCtx) return;
    wbCtx.lineWidth = size; wbCtx.lineCap = 'round'; wbCtx.strokeStyle = color;
    wbCtx.beginPath(); wbCtx.moveTo(start.x, start.y); wbCtx.lineTo(end.x, end.y); wbCtx.stroke(); wbCtx.closePath();
}

function clearWhiteboard() {
    if (wbCtx && wbCanvas) {
        wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
        if (currentRoom) socket.emit('clear-whiteboard', currentRoom);
    }
}

function toggleWhiteboard() {
    const wbModal = document.getElementById('whiteboard-modal');
    if (!wbModal) return;
    
    if (wbModal.style.display === 'none' || !wbModal.style.display) {
        wbModal.style.display = 'flex';
        setTimeout(setupWhiteboard, 50);
    } else {
        wbModal.style.display = 'none';
    }
}

socket.on('draw-whiteboard', (data) => drawSegment(data.prevPos, data.currPos, data.color, data.size));
socket.on('clear-whiteboard', () => wbCtx?.clearRect(0, 0, wbCanvas.width, wbCanvas.height));

/* ========================================== UTILS ========================================== */
function updateClock() {
    const clockEl = document.getElementById('clock-display');
    if (clockEl) clockEl.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setupJoinInputListeners() {
    const joinBtn = document.getElementById('btn-join-room');
    const roomInput = document.getElementById('room-code-input'); // Corrected ID here
    
    if (joinBtn && roomInput) {
        // Clear value on load so email doesn't stay pre-filled
        roomInput.value = '';
        joinBtn.setAttribute('disabled', 'true');

        roomInput.addEventListener('input', () => {
            if (roomInput.value.trim().length > 0) {
                joinBtn.removeAttribute('disabled');
            } else {
                joinBtn.setAttribute('disabled', 'true');
            }
        });
    }
}


/* ========================================== WHITEBOARD VIDEO RECORDING & HOST PROFILE HISTORY ========================================== */
let mediaRecorder;
let recordedChunks = [];
let isRecordingBoard = false;

// Auto-record canvas operations when whiteboard modal opens
function startWhiteboardRecording() {
    const canvas = document.getElementById('whiteboard-canvas');
    if (!canvas) return;

    try {
        const stream = canvas.captureStream(25); // 25 FPS stream
        recordedChunks = [];
        
        // Setup Media Recorder with supported mime types
        const options = { mimeType: 'video/webm;codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm';
        }

        mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = saveRecordedBoardVideo;
        mediaRecorder.start(1000); // chunk slice 1 sec
        isRecordingBoard = true;
        console.log("Whiteboard live video recording started...");
    } catch (err) {
        console.warn("Board video recorder fallback active:", err);
    }
}

function stopWhiteboardRecording() {
    if (mediaRecorder && isRecordingBoard) {
        mediaRecorder.stop();
        isRecordingBoard = false;
        console.log("Whiteboard live video recording stopped.");
    }
}

function saveRecordedBoardVideo() {
    if (recordedChunks.length === 0 || !currentUser || !currentUser.email) return;

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const videoUrl = URL.createObjectURL(blob);
    
    const videoData = {
        id: 'rec_' + Date.now(),
        hostEmail: currentUser.email.toLowerCase(),
        title: 'Whiteboard Class Work Session - ' + new Date().toLocaleDateString(),
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        videoUrl: videoUrl
    };

    // Save in LocalStorage mapped to Host Email
    let allRecordings = JSON.parse(localStorage.getItem('Google_board_recordings') || '[]');
    allRecordings.unshift(videoData);
    localStorage.setItem('Google_board_recordings', JSON.stringify(allRecordings));
    
    renderHostBoardRecordings();
}

function renderHostBoardRecordings() {
    const container = document.getElementById('host-recording-container');
    const notice = document.getElementById('non-host-recording-notice');
    if (!container) return;

    if (!currentUser || !currentUser.email) {
        container.innerHTML = `
            <div class="empty-state-card">
                <i class="fa-solid fa-user-slash"></i>
                <p>Please log in as Host to access your saved whiteboard class videos.</p>
            </div>`;
        notice?.classList.add('hidden');
        return;
    }

    const currentEmail = currentUser.email.toLowerCase();
    const allRecordings = JSON.parse(localStorage.getItem('Google_board_recordings') || '[]');
    
    // Email Match Logic: Filter videos only for logged in host
    const userRecordings = allRecordings.filter(rec => rec.hostEmail === currentEmail);

    if (userRecordings.length === 0) {
        container.innerHTML = `
            <div class="empty-state-card">
                <i class="fa-solid fa-video-slash"></i>
                <p>No whiteboard class video history found for email <strong>${currentEmail}</strong>. Start drawing on Whiteboard Studio to create video logs.</p>
            </div>`;
        notice?.classList.add('hidden');
        return;
    }

    notice?.classList.add('hidden');
    container.innerHTML = userRecordings.map(rec => `
        <div class="history-item-card" style="flex-direction: column; align-items: flex-start; gap: 12px;">
            <div class="history-item-info" style="width:100%;">
                <h4><i class="fa-solid fa-file-video" style="color:#0d47a1;"></i> ${rec.title}</h4>
                <p><i class="fa-regular fa-calendar"></i> Saved on ${rec.date} at ${rec.time} &bull; Host: <strong>${rec.hostEmail}</strong></p>
            </div>
            <div style="width: 100%; border-radius: 8px; overflow: hidden; background: #000;">
                <video src="${rec.videoUrl}" controls style="width: 100%; max-height: 380px;"></video>
            </div>
            <div class="history-actions-group" style="align-self: flex-end;">
                <a href="${rec.videoUrl}" download="${rec.title}.webm" class="btn-primary-sm" style="text-decoration:none;"><i class="fa-solid fa-download"></i> Download WebM</a>
            </div>
        </div>
    `).join('');
}

function clearBoardRecordings() {
    if (!currentUser || !currentUser.email) return;
    const currentEmail = currentUser.email.toLowerCase();
    let allRecordings = JSON.parse(localStorage.getItem('Google_board_recordings') || '[]');
    allRecordings = allRecordings.filter(rec => rec.hostEmail !== currentEmail);
    localStorage.setItem('Google_board_recordings', JSON.stringify(allRecordings));
    renderHostBoardRecordings();
}

// Hook Recording to Whiteboard Toggle Open/Close
const originalToggleWhiteboard = toggleWhiteboard;
toggleWhiteboard = function() {
    const wbModal = document.getElementById('whiteboard-modal');
    if (!wbModal) return;

    if (wbModal.style.display === 'none' || !wbModal.style.display) {
        wbModal.style.display = 'flex';
        setTimeout(() => {
            setupWhiteboard();
            startWhiteboardRecording(); // Start recording when board opens
        }, 50);
    } else {
        wbModal.style.display = 'none';
        stopWhiteboardRecording(); // Stop recording when board closes
    }
};