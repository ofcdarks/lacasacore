# 🎬 Configuração do YouTube no EasyPanel

Este guia explica como configurar as credenciais do YouTube no EasyPanel (VPS).

## 📋 Pré-requisitos

1. Conta Google com acesso ao YouTube
2. Acesso ao [Google Cloud Console](https://console.cloud.google.com/)
3. Aplicação já deployada no EasyPanel

## 🔧 Passo 1: Obter Credenciais do Google

### 1.1. Criar Projeto no Google Cloud Console

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Clique em **"Selecionar um projeto"** no topo
3. Clique em **"Novo Projeto"**
4. Digite um nome para o projeto (ex: "La Casa Dark Core")
5. Clique em **"Criar"**

### 1.2. Habilitar a API do YouTube

1. No menu lateral, vá em **"APIs e Serviços"** > **"Biblioteca"**
2. Procure por **"YouTube Data API v3"**
3. Clique na API e depois em **"Habilitar"**
4. Aguarde alguns segundos para a API ser habilitada

### 1.3. Configurar a Tela de Consentimento OAuth

1. No menu lateral, vá em **"APIs e Serviços"** > **"Tela de consentimento OAuth"**
2. Selecione **"Externo"** (ou "Interno" se você tiver Workspace)
3. Preencha os campos obrigatórios:
   - **Nome do aplicativo**: La Casa Dark Core
   - **Email de suporte do usuário**: Seu email
   - **Email de contato do desenvolvedor**: Seu email
4. Clique em **"Salvar e continuar"**
5. Nas **"Escopos"**, clique em **"Adicionar ou remover escopos"**
6. Selecione os seguintes escopos:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube`
7. Clique em **"Atualizar"** e depois **"Salvar e continuar"**
8. Adicione usuários de teste (se necessário) e continue
9. Revise e **"Voltar ao painel"**

### 1.4. Criar Credenciais OAuth 2.0

1. No menu lateral, vá em **"APIs e Serviços"** > **"Credenciais"**
2. Clique em **"+ Criar credenciais"** > **"ID do cliente OAuth"**
3. Selecione o tipo de aplicativo: **"Aplicativo da Web"**
4. Preencha:
   - **Nome**: La Casa Dark Core - YouTube Integration
   - **URIs de redirecionamento autorizados**: 
     - `https://SEU-DOMINIO.com/api/youtube/oauth/callback`
     - **IMPORTANTE**: 
       - Substitua `SEU-DOMINIO.com` pelo seu domínio real
       - A URL deve ser EXATAMENTE igual (sem barra no final, sem espaços)
       - Use `https://` (não `http://`)
       - Exemplo: `https://app.lacasacore.com/api/youtube/oauth/callback`
5. Clique em **"Criar"**
6. **IMPORTANTE**: Copie o **ID do cliente** e o **Segredo do cliente**
   - Você verá uma tela com essas informações
   - **Salve o Segredo do cliente agora**, pois você só verá ele uma vez!

## 🔧 Passo 2: Configurar no EasyPanel

### 2.1. Acessar as Variáveis de Ambiente

1. Acesse o painel do EasyPanel
2. Encontre sua aplicação (La Casa Dark Core)
3. Clique na aplicação para ver os detalhes
4. Procure pela seção **"Environment Variables"** ou **"Variáveis de Ambiente"**
   - Pode estar em **"Settings"**, **"Config"**, **"Environment"** ou **"Variables"**

### 2.2. Adicionar as Variáveis

Adicione as seguintes variáveis de ambiente:

#### Variáveis Obrigatórias:

1. **YOUTUBE_CLIENT_ID**
   - Valor: O ID do cliente que você copiou do Google Cloud Console
   - Exemplo: `123456789-abcdefghijklmnop.apps.googleusercontent.com`

2. **YOUTUBE_CLIENT_SECRET**
   - Valor: O Segredo do cliente que você copiou do Google Cloud Console
   - Exemplo: `GOCSPX-abcdefghijklmnopqrstuvwxyz`

3. **YOUTUBE_REDIRECT_URI**
   - Valor: A URL de redirecionamento (deve ser EXATAMENTE igual ao configurado no Google Cloud Console)
   - Exemplo: `https://app.lacasacore.com/api/youtube/oauth/callback`
   - **IMPORTANTE**: 
     - Sem barra no final
     - Use `https://` (não `http://`)
     - Use seu domínio real

#### Como Adicionar no EasyPanel:

1. Clique em **"Add Variable"** ou **"Adicionar Variável"**
2. Para cada variável:
   - **Key/Chave**: `YOUTUBE_CLIENT_ID`
   - **Value/Valor**: Cole o valor copiado do Google Cloud Console
   - Clique em **"Save"** ou **"Salvar"**
3. Repita para as outras variáveis

### 2.3. Verificar o Domínio e Porta

Antes de configurar, você precisa saber:

1. **Qual é o domínio da sua aplicação?**
   - Exemplo: `app.lacasacore.com` ou `lacasacore.com`
   - Verifique no EasyPanel nas configurações de domínio

2. **A aplicação está usando HTTPS?**
   - O OAuth do Google **requer HTTPS** em produção
   - Certifique-se de que o EasyPanel está configurado com SSL/HTTPS

3. **Qual é a porta?**
   - Geralmente, aplicações no EasyPanel usam porta padrão (80 para HTTP, 443 para HTTPS)
   - Verifique nas configurações da aplicação

### 2.4. Exemplo Completo de Configuração

```
YOUTUBE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
YOUTUBE_REDIRECT_URI=https://app.lacasacore.com/api/youtube/oauth/callback
```

## 🔧 Passo 3: Reiniciar a Aplicação

1. No EasyPanel, após adicionar as variáveis de ambiente
2. Clique em **"Restart"** ou **"Reiniciar"** na aplicação
3. Aguarde a aplicação reiniciar

## ✅ Passo 4: Testar a Integração

1. Acesse sua aplicação no navegador
2. Faça login no dashboard
3. Vá em **"Integração com YouTube"**
4. Clique em **"Adicionar Canal"**
5. Você deve ser redirecionado para o Google para autorizar
6. Autorize o acesso
7. Você será redirecionado de volta para a aplicação

## 🐛 Solução de Problemas

### Erro: "Credenciais do YouTube não configuradas"

**Causa**: As variáveis de ambiente não foram configuradas ou a aplicação não foi reiniciada.

**Solução**:
1. Verifique se as variáveis estão configuradas no EasyPanel
2. Verifique se os nomes das variáveis estão corretos (maiúsculas, sem espaços)
3. Reinicie a aplicação no EasyPanel
4. Verifique os logs da aplicação para ver se há erros

### Erro: "redirect_uri_mismatch"

**Causa**: A URL de redirecionamento no EasyPanel não corresponde à configurada no Google Cloud Console.

**Solução**:
1. Verifique se o `YOUTUBE_REDIRECT_URI` no EasyPanel está EXATAMENTE igual ao configurado no Google Cloud Console
2. Verifique se não há barra no final
3. Verifique se está usando `https://` (não `http://`)
4. Verifique se o domínio está correto
5. Atualize a configuração no Google Cloud Console se necessário

### Erro: "invalid_client"

**Causa**: O `YOUTUBE_CLIENT_ID` ou `YOUTUBE_CLIENT_SECRET` está incorreto.

**Solução**:
1. Verifique se copiou corretamente do Google Cloud Console
2. Verifique se não há espaços extras
3. Verifique se as variáveis estão salvas no EasyPanel
4. Reinicie a aplicação

### Como Ver os Logs no EasyPanel

1. No EasyPanel, vá para sua aplicação
2. Clique em **"Logs"** ou **"View Logs"**
3. Procure por erros relacionados ao YouTube
4. Os logs devem mostrar mensagens como:
   - `[YouTube Integration] Erro ao conectar: ...`
   - `Credenciais do YouTube não configuradas`

## 📝 Checklist

- [ ] Projeto criado no Google Cloud Console
- [ ] YouTube Data API v3 habilitada
- [ ] Tela de consentimento OAuth configurada
- [ ] Credenciais OAuth 2.0 criadas
- [ ] ID do cliente e Segredo do cliente copiados
- [ ] URI de redirecionamento configurado no Google Cloud Console
- [ ] Variáveis de ambiente adicionadas no EasyPanel:
  - [ ] `YOUTUBE_CLIENT_ID`
  - [ ] `YOUTUBE_CLIENT_SECRET`
  - [ ] `YOUTUBE_REDIRECT_URI`
- [ ] Aplicação reiniciada no EasyPanel
- [ ] Integração testada com sucesso

## 🔒 Segurança

- **NUNCA** compartilhe suas credenciais
- **NUNCA** commite credenciais no código
- Use variáveis de ambiente (como no EasyPanel)
- Mantenha suas credenciais seguras
- Revogue credenciais comprometidas no Google Cloud Console

## 🌐 Domínio e HTTPS

- O OAuth do Google **requer HTTPS** em produção
- Certifique-se de que o EasyPanel está configurado com SSL/HTTPS
- O domínio deve estar configurado corretamente no EasyPanel
- O `YOUTUBE_REDIRECT_URI` deve usar o mesmo domínio da aplicação

## 📚 Recursos Adicionais

- [Documentação do YouTube Data API](https://developers.google.com/youtube/v3)
- [Guia OAuth 2.0 do Google](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Documentação do EasyPanel](https://easypanel.io/docs)

---

**Pronto!** Após seguir estes passos, sua integração com YouTube estará configurada e funcionando no EasyPanel. 🎉

