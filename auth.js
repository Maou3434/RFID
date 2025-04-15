// Replace the current storeToken function with:
function handleCredentialResponse(response) {
    if (response.credential) {
        localStorage.setItem('google_access_token', response.credential);
        document.getElementById('signout-btn').style.display = 'inline-block';
        document.querySelector('.g_id_signin').style.display = 'none';
        document.querySelectorAll('.auth-required').forEach(el => {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
        });
        window.location.reload();
    }
}

// Initialize Google Auth
function initGoogleAuth() {
    google.accounts.id.initialize({
        client_id: '96464170703-r84vkai7qhrvhhf52podclrg4r0i2s6k.apps.googleusercontent.com',
        callback: handleCredentialResponse
    });
    
    // Render the button
    google.accounts.id.renderButton(
        document.querySelector('.g_id_signin'),
        { theme: 'filled_blue', size: 'medium', width: 200 }
    );
    
    // Check auth status
    if (localStorage.getItem('google_access_token')) {
        document.getElementById('signout-btn').style.display = 'inline-block';
        document.querySelector('.g_id_signin').style.display = 'none';
        document.querySelectorAll('.auth-required').forEach(el => {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
        });
    }
}