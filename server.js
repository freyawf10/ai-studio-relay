const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let browserSocket = null; // 浏览器端的连接

// 1. 浏览器端连接上来
wss.on('connection', (ws) => {
    console.log('浏览器端已连接！');
    browserSocket = ws;
    
    ws.on('close', () => {
        console.log('浏览器端断开连接。');
        browserSocket = null;
    });
});

// 2. 接收酒馆的请求
app.post('/v1/chat/completions', async (req, res) => {
    if (!browserSocket || browserSocket.readyState !== WebSocket.OPEN) {
        return res.status(503).json({ error: "没有连接到浏览器端 (No Browser Connected)" });
    }

    // 生成一个唯一 ID
    const requestId = Date.now().toString();
    
    // 把请求转发给浏览器
    const payload = {
        request_id: requestId,
        method: 'POST',
        path: '/v1beta/models/gemini-1.5-pro:generateContent', // 默认模型，脚本里会改
        headers: req.headers,
        body: JSON.stringify(req.body)
    };
    
    browserSocket.send(JSON.stringify(payload));

    // 监听浏览器的回传
    // 这里为了简化，我们暂时不支持流式，只支持等待完整响应
    // (要支持流式需要更复杂的逻辑，MCXBX 之所以强就在这)
    
    const messageHandler = (data) => {
        const msg = JSON.parse(data);
        if (msg.request_id === requestId) {
             if (msg.event_type === 'response_headers') {
                 // 忽略 headers
             } else if (msg.event_type === 'chunk') {
                 res.write(msg.data); // 转发流式数据
             } else if (msg.event_type === 'stream_close') {
                 res.end();
                 browserSocket.off('message', messageHandler);
             } else if (msg.event_type === 'error') {
                 res.status(500).json(msg);
                 browserSocket.off('message', messageHandler);
             }
        }
    };

    browserSocket.on('message', messageHandler);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`中转服务器运行在端口 ${PORT}`));
