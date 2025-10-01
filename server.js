const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(express.static('public')); // Serves your HTML, CSS, and JS files
app.use(express.json());           // This MUST be enabled to parse data from the browser

// --- ROUTES ---
// This route ensures index.html is served correctly.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// The API endpoint for requesting a pairing code.
app.post('/request-code', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
        return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    const sessionId = Date.now().toString();
    const sessionPath = path.join(__dirname, 'temp_sessions', sessionId);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const sock = makeWASocket({
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            auth: state,
        });

        // This listener runs in the background, waiting for the connection to open.
        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for creds.json to be written
                    const credsPath = path.join(sessionPath, 'creds.json');
                    const credsData = fs.readFileSync(credsPath, 'utf-8');
                    const base64Creds = Buffer.from(credsData).toString('base64');
                    const message = `*✅ MICHIKO-MD Session ID Generated!*\n\nCopy the code below:\n\n\`\`\`${base64Creds}\`\`\``;
                    
                    // Send the session ID to the user's WhatsApp
                    await sock.sendMessage(sock.user.id, { text: message });
                    
                    await sock.logout(); // Gracefully disconnect
                } catch (e) {
                    console.error("Error sending session:", e);
                } finally {
                    fs.removeSync(sessionPath); // Clean up
                }
            }
            if (connection === 'close') {
                fs.removeSync(sessionPath); // Clean up if connection closes for any reason
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // --- THE CRITICAL FIX IS HERE ---
        // 1. Actually request the pairing code.
        const code = await sock.requestPairingCode(phoneNumber);

        // 2. Immediately send the code back to the browser to complete the request.
        res.json({ success: true, pairingCode: code });

    } catch (e) {
        console.error("Pairing request error:", e);
        fs.removeSync(sessionPath);
        res.status(500).json({ error: 'Failed to request pairing code. The number may be invalid.' });
    }
});

app.listen(port, () => {
    console.log(`Pairing server running on port ${port}`);
    fs.removeSync(path.join(__dirname, 'temp_sessions'));
});