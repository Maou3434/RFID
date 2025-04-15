let accessToken = null;

// Handle storage of tokens
function storeToken(token) {
    accessToken = token;
    localStorage.setItem('google_access_token', token);
    document.querySelectorAll('.auth-required').forEach(el => {
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
    });
    document.getElementById('signout-btn').style.display = 'block';
    document.querySelector('.g_id_signin').style.display = 'none';
}

// Check for existing token on load
window.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('google_access_token');
    if (savedToken) {
        storeToken(savedToken);
    }

    // Listen for auth messages (for popup flow)
    window.addEventListener('message', (event) => {
        if (event.origin !== 'https://maou3434.github.io') return;
        if (event.data.type === 'oauth-success') {
            storeToken(event.data.token);
        }
    });

    // Sign out handler
    document.getElementById('signout-btn').addEventListener('click', () => {
        localStorage.removeItem('google_access_token');
        accessToken = null;
        document.getElementById('signout-btn').style.display = 'none';
        document.querySelector('.g_id_signin').style.display = 'block';
        document.querySelectorAll('.auth-required').forEach(el => {
            el.style.opacity = '0.5';
            el.style.pointerEvents = 'none';
        });
    });
});

// Function to get token (used by script.js)
function getAccessToken() {
    return accessToken || localStorage.getItem('google_access_token');
}