# 🎬 Como Usar os Agentes de Roteiro

## ⚠️ IMPORTANTE: Passos para Ver as Novas Funcionalidades

### 1. **Reiniciar o Servidor** (OBRIGATÓRIO)
O servidor precisa ser reiniciado para aplicar as mudanças no banco de dados:

1. Pare o servidor atual (Ctrl+C no terminal)
2. Vá para a pasta Backend:
   ```bash
   cd Backend
   ```
3. Inicie o servidor novamente:
   ```bash
   node server.js
   ```

### 2. **Limpar Cache do Navegador**
Para garantir que o navegador carregue a versão mais recente:

- **Chrome/Edge**: Pressione `Ctrl + Shift + Delete` → Selecione "Imagens e arquivos em cache" → Limpar dados
- **Ou**: Pressione `Ctrl + F5` para recarregar forçando o cache

### 3. **Fazer uma Nova Análise**
As novas funcionalidades aparecem **APENAS após fazer uma análise de vídeo**:

1. Vá para **Analisador de Vídeos**
2. Cole a URL de um vídeo do YouTube
3. Selecione o modelo de IA
4. Clique em **"Analisar e Gerar Títulos"**
5. Aguarde a análise completar

### 4. **Ver a Seção de Transcrição**
Após a análise, você verá uma nova seção chamada **"📝 Transcrição Completa do Vídeo"** que aparece logo após a "Análise do Título Original".

## 🎯 Funcionalidades Disponíveis

### ✅ **Transcrição Completa**
- Clique em **"Carregar Transcrição"** para ver o roteiro completo do vídeo
- Clique em **"Copiar Transcrição"** para copiar o texto completo

### ✅ **Criar Agente de Roteiro**
1. Primeiro, carregue a transcrição (botão "Carregar Transcrição")
2. Clique em **"Criar Agente de Roteiro"**
3. Preencha:
   - **Nome do Agente** (obrigatório)
   - **Nicho** (opcional, já preenchido automaticamente)
   - **Subnicho** (opcional, já preenchido automaticamente)
4. Clique em **"Criar Agente"**

O sistema irá:
- Analisar o roteiro do vídeo de sucesso
- Criar um "agente" que captura a estrutura e estilo do roteiro
- Salvar o agente para uso futuro

### ✅ **Usar Agentes para Gerar Roteiros**
(Em breve - será adicionada uma seção dedicada para gerenciar e usar agentes)

## 🔍 Verificação

Se ainda não aparecer:

1. **Verifique o Console do Navegador**:
   - Pressione `F12`
   - Vá para a aba "Console"
   - Procure por erros em vermelho

2. **Verifique se o servidor está rodando**:
   - O servidor deve estar na porta 5001
   - Verifique se há mensagens de erro no terminal

3. **Verifique se fez login**:
   - Certifique-se de estar logado no sistema

## 📝 Notas

- A transcrição só está disponível para vídeos que têm legendas no YouTube
- O agente é criado automaticamente pela IA analisando o roteiro do vídeo
- Você pode criar múltiplos agentes para diferentes nichos
- Cada agente pode ser usado para gerar novos roteiros seguindo o mesmo padrão de sucesso

