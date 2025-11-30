// Script de verificação de saúde da API
// Execute: node health-check.js

const fetch = require('undici').fetch;

const API_BASE = 'http://localhost:5001';

async function checkHealth() {
    console.log('🔍 Verificando saúde da API...\n');
    
    const checks = [
        { name: 'Servidor rodando', url: `${API_BASE}/api/auth/me`, method: 'GET', needsAuth: false },
        { name: 'Login', url: `${API_BASE}/api/auth/login`, method: 'POST', needsAuth: false },
        { name: 'Registro', url: `${API_BASE}/api/auth/register`, method: 'POST', needsAuth: false },
    ];
    
    for (const check of checks) {
        try {
            const options = {
                method: check.method,
                headers: { 'Content-Type': 'application/json' }
            };
            
            if (check.method === 'POST') {
                options.body = JSON.stringify({ email: 'test@test.com', password: 'test' });
            }
            
            const response = await fetch(check.url, options);
            const text = await response.text();
            
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                data = { raw: text.substring(0, 100) };
            }
            
            if (response.ok || response.status === 400 || response.status === 401) {
                console.log(`✅ ${check.name}: OK (${response.status})`);
            } else {
                console.log(`❌ ${check.name}: ERRO (${response.status})`);
                console.log(`   Resposta:`, data);
            }
        } catch (err) {
            console.log(`❌ ${check.name}: FALHA`);
            console.log(`   Erro:`, err.message);
        }
    }
}

checkHealth();

