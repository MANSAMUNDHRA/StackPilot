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

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
console.log("HF KEY EXISTS:", !!process.env.HUGGINGFACE_API_KEY);

const SYSTEM_PROMPT = `You are PythOwO, a code generator that ONLY writes code in PythOwO language.
PythOwO syntax rules:
- Variables: pwease x = 10
- Print: pwint("hello")
- If: IF condition THWEN expression
- Elif: EWIF condition THWEN expression
- Else: EWSE expression
- For loop: FOR i = 0 TO 5 THWEN ... END
- Functions: FWUNCTION name(params) -> expression
- Return: WETURN value

Example:
pwease a = 10
pwease b = 20
pwease sum = a + b
pwint(sum)

RULES:
- Output ONLY raw PythOwO code. No markdown, no backticks, no explanations.
- Every variable must use pwease
- Every print must use pwint
- Never write regular Python`;

app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "No message provided" });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = hf.chatCompletionStream({
            model: "Qwen/Qwen2.5-72B-Instruct",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Write PythOwO code for: ${message}` }
            ],
            temperature: 0.3,
            max_tokens: 2048,
            top_p: 0.9
        });

        for await (const chunk of stream) {
            if (!chunk?.choices?.length) continue;
            const content = chunk.choices[0].delta?.content;
            if (!content) continue;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error("Chat error:", error);
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

app.post('/run', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "No code provided" });

    try {
        const tmpDir = path.join(__dirname, 'tmp');
        await fs.mkdir(tmpDir, { recursive: true });
        const tmpFile = path.join(tmpDir, `code_${Date.now()}.pyowo`);
        await fs.writeFile(tmpFile, code);

        const output = await new Promise((resolve, reject) => {
            let stdout = '', stderr = '';
            const proc = spawn('python', ['pythowo.py', tmpFile]);
            proc.stdout.on('data', d => stdout += d.toString());
            proc.stderr.on('data', d => stderr += d.toString());
            proc.on('close', code => {
                fs.unlink(tmpFile).catch(() => {});
                if (code !== 0) reject(new Error(stderr || 'Execution failed'));
                else resolve(stdout);
            });
        });

        res.json({ output });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/share', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "No code provided" });

    try {
        const filename = crypto.randomBytes(8).toString('hex') + '.py';
        const sharePath = '/www/wwwroot/uwuforge/share';
        await fs.mkdir(sharePath, { recursive: true });
        await fs.writeFile(path.join(sharePath, filename), code, 'utf-8');
        res.json({ url: `https://uwuforge.teamitj.tech/share/${filename}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));