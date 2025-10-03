const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs'); // Use the built-in 'fs' module
const path = require('path');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/request-code', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
        return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    const sessionId = Date.now().toString();
    const sessionPath = path.join(os.tmpdir(), sessionId);

    try {
        // useMultiFileAuthState from v6.6.0 will create the directory for us.
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const sock = makeWASocket({
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            auth: state,
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    await new Promise(resolve => setTimeout(resolve, 4000));
                    const credsPath = path.join(sessionPath, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const credsData = fs.readFileSync(credsPath, 'utf-8');
                        const base64Creds = Buffer.from(credsData).toString('base64');
                        const message = `*✅ MICHIKO-MD Session ID Generated!*\n\nCopy the code below:\n\n\`\`\`${base64Creds}\`\`\``;
                        await sock.sendMessage(sock.user.id, { text: message });
                        await sock.logout();
                    }
                } catch (e) { console.error("Error sending session:", e); } 
                finally { fs.rmSync(sessionPath, { recursive: true, force: true }); }
            }
            if (connection === 'close') {
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        });

        sock.ev.on('creds.update', saveCreds);

        const code = await sock.requestPairingCode(phoneNumber);
        res.json({ success: true, pairingCode: code });

    } catch (e) {
        console.error("Pairing request error:", e);
        fs.rmSync(sessionPath, { recursive: true, force: true });
        res.status(500).json({ error: 'Failed to request pairing code. The number may be invalid.' });
    }
});

app.listen(port, () => {
    console.log(`Pairing server running on port ${port}`);
    // Clean up old sessions, if any.
    const tempDir = os.tmpdir();
    fs.readdirSync(tempDir).forEach(file => {
        if (!isNaN(parseInt(file))) { // Check if the folder name is a number (our sessionId)
            fs.rmSync(path.join(tempDir, file), { recursive: true, force: true });
        }
    });
});
