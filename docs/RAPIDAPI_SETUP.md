# 🚀 Configuração da RapidAPI YouTube Transcripts

## Visão Geral

A integração com **RapidAPI YouTube Transcripts** oferece uma alternativa rápida e confiável para obter transcrições de vídeos do YouTube. Esta API é usada como fallback automático quando o método padrão (`youtube-transcript`) falha.

## 📋 Pré-requisitos

1. **Conta na RapidAPI**
   - Acesse: https://rapidapi.com
   - Crie uma conta gratuita ou paga

2. **Assinar a API YouTube Transcripts**
   - Busque por "YouTube Transcripts" na RapidAPI
   - Ou acesse diretamente: https://rapidapi.com/ytjar/api/youtube-transcripts
   - Clique em "Subscribe to Test" (plano gratuito disponível)

3. **Obter sua Chave de API**
   - Após assinar, vá em "Apps" > "default-application"
   - Copie sua `X-RapidAPI-Key`

## 🔧 Como Configurar

### 1. Adicionar Chave no Sistema

1. Acesse as **Configurações** da ferramenta
2. Procure por **"RapidAPI"** ou **"API Keys"**
3. Cole sua chave `X-RapidAPI-Key`
4. Salve as configurações

### 2. Verificar Configuração

A chave será armazenada de forma criptografada no banco de dados, associada ao seu usuário.

## 🎯 Como Funciona

### Fluxo de Transcrição (Ordem de Tentativas)

```
1. Banco de Dados (cache)
   ↓ (se não encontrar)
2. youtube-transcript (método padrão)
   ↓ (se falhar)
3. RapidAPI YouTube Transcripts ⭐ (NOVO!)
   ↓ (se falhar)
4. Whisper (OpenAI API ou Local)
```

### Quando a RapidAPI é Usada

A RapidAPI é automaticamente tentada quando:
- O método `youtube-transcript` falha
- O vídeo não possui legendas disponíveis no YouTube
- Há problemas de conexão com o YouTube

## 📡 Endpoint da API

**URL Base:**
```
https://youtube-transcripts.p.rapidapi.com/youtube/transcript
```

**Parâmetros:**
- `url`: URL completa do vídeo do YouTube
- `videoId`: ID do vídeo
- `chunkSize`: Tamanho dos chunks (padrão: 500)
- `text`: Retornar como texto simples (true/false)
- `lang`: Idioma (pt, en, es, etc.)

**Headers:**
- `x-rapidapi-host`: `youtube-transcripts.p.rapidapi.com`
- `x-rapidapi-key`: Sua chave de API

## 💰 Planos e Limites

### Plano Gratuito (Test)
- **Limite**: Geralmente 100-500 requisições/mês
- **Rate Limit**: Varia conforme o provedor
- **Ideal para**: Testes e uso pessoal

### Planos Pagos
- **Basic**: Mais requisições por mês
- **Pro**: Requisições ilimitadas ou muito altas
- **Enterprise**: Suporte dedicado

**Verifique os limites no dashboard da RapidAPI.**

## ✅ Vantagens da RapidAPI

✅ **Rápida** - Resposta em segundos  
✅ **Confiável** - Alta taxa de sucesso  
✅ **Fácil** - Apenas precisa da chave de API  
✅ **Automática** - Fallback transparente  
✅ **Suporta múltiplos idiomas**  

## ⚠️ Limitações

- **Custo**: Requer assinatura (pode ter plano gratuito limitado)
- **Rate Limits**: Pode ter limites de requisições
- **Dependência Externa**: Requer conexão com RapidAPI

## 🐛 Troubleshooting

### Erro: "Chave de API da RapidAPI não configurada"

**Solução:**
1. Verifique se adicionou a chave nas configurações
2. Certifique-se de que a chave está correta
3. Verifique se assinou a API na RapidAPI

### Erro: "Chave de API da RapidAPI inválida ou expirada"

**Solução:**
1. Verifique se a chave está correta
2. Verifique se sua assinatura da API está ativa
3. Gere uma nova chave na RapidAPI se necessário

### Erro: "Limite de requisições da RapidAPI atingido"

**Solução:**
1. Aguarde alguns minutos
2. Verifique seu plano na RapidAPI
3. Considere fazer upgrade do plano

### Erro: "Transcrição não encontrada para este vídeo"

**Solução:**
- O vídeo pode não ter legendas disponíveis
- O sistema tentará automaticamente o Whisper como fallback

## 📊 Comparação de Métodos

| Método | Velocidade | Custo | Confiabilidade | Requisitos |
|--------|-----------|-------|----------------|------------|
| **youtube-transcript** | ⚡⚡⚡ Muito Rápido | 🆓 Grátis | ⭐⭐⭐ Boa | Nenhum |
| **RapidAPI** | ⚡⚡ Rápido | 💰 Pago | ⭐⭐⭐⭐ Muito Boa | Chave API |
| **Whisper (OpenAI)** | ⚡ Lento | 💰 Pago | ⭐⭐⭐⭐⭐ Excelente | Chave API |
| **Whisper (Local)** | 🐌 Muito Lento | 🆓 Grátis | ⭐⭐⭐⭐⭐ Excelente | Python + Whisper |

## 🔐 Segurança

- A chave da API é armazenada **criptografada** no banco de dados
- Cada usuário tem sua própria chave
- A chave nunca é exposta no frontend

## 📝 Notas Importantes

1. **Cache**: Transcrições bem-sucedidas são salvas no banco de dados para evitar requisições repetidas
2. **Fallback Automático**: Se a RapidAPI falhar, o sistema tenta Whisper automaticamente
3. **Idioma**: Por padrão, busca transcrições em português (`lang=pt`)
4. **Rate Limits**: Respeite os limites do seu plano para evitar bloqueios

## 🚀 Próximos Passos

1. ✅ Crie conta na RapidAPI
2. ✅ Assine a API YouTube Transcripts
3. ✅ Copie sua chave de API
4. ✅ Configure nas Configurações da ferramenta
5. ✅ Teste com um vídeo do YouTube

---

**Desenvolvido para La Casa Dark Core** 🏠

