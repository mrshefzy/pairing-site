const phoneForm = document.getElementById('phone-form');
const phoneNumberInput = document.getElementById('phone-number');
const statusMessage = document.getElementById('status-message');

const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');

const pairingCodeDisplay = document.getElementById('pairing-code');

phoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phoneNumber = phoneNumberInput.value.trim();
    if (!phoneNumber) return;

    showStatus('Requesting code, please wait...', 'normal');
    phoneForm.querySelector('button').disabled = true;

    try {
        const response = await fetch('/request-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber })
        });
        
        const data = await response.json();

        if (data.success) {
            pairingCodeDisplay.textContent = data.pairingCode;
            step1.style.display = 'none';
            step2.style.display = 'block';
            showStatus('', 'normal'); // Clear status on success
        } else {
            throw new Error(data.error || 'Failed to get pairing code.');
        }
    } catch (error) {
        showStatus(error.message, 'error');
    } finally {
        phoneForm.querySelector('button').disabled = false;
    }
});

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
}