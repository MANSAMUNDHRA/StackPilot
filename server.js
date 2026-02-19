const express = require('express');
const cors = require('cors');
const { HfInference } = require('@huggingface/inference');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
const express = require('express');
const path = require('path');

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

console.log("HF KEY EXISTS:", !!process.env.HUGGINGFACE_API_KEY);

/* ---------- SYSTEM PROMPT ---------- */
const SYSTEM_PROMPT = `


You are a coding assistant for students.
Generate SIMPLE, short, beginner-friendly code.
Prefer clarity over optimization.
Do NOT add unnecessary abstractions, docstrings, or advanced patterns.
Only output code.


`;

/* ---------- CHAT (STREAMING) ---------- */
app.post('/chat', async (req, res) => {
    try {
        const { message, language = "python" } = req.body;

        if (!message) {
            return res.status(400).json({ error: "No message provided" });
        }

        // SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const userPrompt = `
Write clean ${language} code for the following task:

${message}

Only output code.
`;

        // ⚠️ stable model (works with HF inference)
        const stream = hf.chatCompletionStream({
            model: "mistralai/Mistral-7B-Instruct-v0.2",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 1024
        });

        for await (const chunk of stream) {
            const content = chunk?.choices?.[0]?.delta?.content;
            if (!content) continue;

            res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }

        res.write("data: [DONE]\n\n");
        res.end();

    } catch (error) {
        console.error("CHAT ERROR:", error);

        // if streaming already started
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.write("data: [DONE]\n\n");
            res.end();
        }
    }
});

/* ---------- RUN CODE (Python only) ---------- */
app.post('/run', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "No code provided" });
    }

    try {
        const tmpDir = path.join(__dirname, "tmp");
        await fs.mkdir(tmpDir, { recursive: true });

        const tmpFile = path.join(tmpDir, `code_${Date.now()}.py`);
        await fs.writeFile(tmpFile, code);

        const output = await new Promise((resolve, reject) => {
            let stdout = "";
            let stderr = "";

            const MAX_OUTPUT = 10000; // limit output
            const TIMEOUT_MS = 5000;  // 5 seconds

            const proc = spawn("python", [tmpFile], {
                cwd: tmpDir
            });

            let timeout = setTimeout(() => {
                proc.kill("SIGKILL");
            }, TIMEOUT_MS);

            proc.stdout.on('data', d => {
                stdout += d.toString();

                if (stdout.length > MAX_OUTPUT) {
                    proc.kill("SIGKILL");
                }
            });

            proc.stderr.on('data', d => {
                stderr += d.toString();
            });

            proc.on('close', code => {
                clearTimeout(timeout);

                fs.unlink(tmpFile).catch(() => {});

                if (code !== 0) {
                    reject(new Error(stderr || "Execution failed"));
                } else {
                    resolve(stdout);
                }
            });

        });

        res.json({ output });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* ---------- SHARE CODE ---------- */
app.post('/share', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "No code provided" });
    }

    try {
        const filename = crypto.randomBytes(8).toString("hex") + ".txt";
        const sharePath = "./share";

        await fs.mkdir(sharePath, { recursive: true });
        await fs.writeFile(path.join(sharePath, filename), code);

        res.json({ url: `/share/${filename}` });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* ---------- START SERVER ---------- */
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
