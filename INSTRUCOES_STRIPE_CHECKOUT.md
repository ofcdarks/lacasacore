# ✅ Integração Stripe Checkout - Implementação Completa

## 📋 O que foi implementado:

### 1. **Backend (server.js)**
- ✅ Adicionado import do Stripe
- ✅ Função auxiliar `getStripeInstance()` para criar instância do Stripe
- ✅ Endpoint `GET /api/stripe/plans` - Retorna todos os IDs dos planos configurados
- ✅ Endpoint `POST /api/stripe/create-checkout` - Cria sessão de checkout
- ✅ Endpoint `POST /api/stripe/webhook` - Processa eventos do Stripe (pagamentos, cancelamentos)

### 2. **Frontend (plans.html)**
- ✅ Verificação de autenticação
- ✅ Carregamento dos planos disponíveis ao carregar a página
- ✅ Event listeners em todos os botões de compra
- ✅ Integração com checkout do Stripe
- ✅ Tratamento de retorno (sucesso/cancelamento)

### 3. **Dependências**
- ✅ Stripe adicionado ao `package.json` e instalado

---

## 🚀 Como usar:

### **Passo 1: Configurar Stripe no Dashboard Admin**

1. Acesse o Dashboard Admin
2. Vá na aba "Pagamentos (Stripe)"
3. Configure:
   - **Publishable Key**: `pk_test_...` ou `pk_live_...`
   - **Secret Key**: `sk_test_...` ou `sk_live_...`
   - **Webhook Secret**: `whsec_...` (configure no painel do Stripe)

### **Passo 2: Configurar IDs dos Planos**

Na mesma aba "Pagamentos (Stripe)", preencha os **Price IDs** do Stripe para cada plano:

- `plan-start` → Price ID do START CREATOR mensal
- `plan-turbo` → Price ID do TURBO MAKER mensal
- `plan-master` → Price ID do MASTER PRO mensal
- `plan-start-annual` → Price ID do START CREATOR anual
- `plan-turbo-annual` → Price ID do TURBO MAKER anual
- `plan-master-annual` → Price ID do MASTER PRO anual
- `package-1000` → Price ID do pacote 1.000 créditos
- `package-2500` → Price ID do pacote 2.500 créditos
- `package-5000` → Price ID do pacote 5.000 créditos
- `package-10000` → Price ID do pacote 10.000 créditos
- `package-20000` → Price ID do pacote 20.000 créditos

### **Passo 3: Configurar Webhook no Stripe**

1. Acesse o painel do Stripe: https://dashboard.stripe.com
2. Vá em **Developers** → **Webhooks**
3. Clique em **Add endpoint**
4. Configure:
   - **Endpoint URL**: `https://seudominio.com/api/stripe/webhook`
   - **Events to send**: Selecione:
     - `checkout.session.completed`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
5. Copie o **Signing secret** (começa com `whsec_...`)
6. Cole no campo "Webhook Secret" no Dashboard Admin

---

## 🔄 Fluxo de Pagamento:

### **Assinaturas Recorrentes (Mensais/Anuais):**

1. Usuário clica em "Assinar Agora" ou "Assinar Anual"
2. Sistema cria sessão de checkout no Stripe
3. Usuário é redirecionado para página de pagamento do Stripe
4. Após pagamento bem-sucedido:
   - Stripe envia webhook `checkout.session.completed`
   - Sistema atualiza plano do usuário
   - Sistema recarrega créditos baseado no plano

### **Pacotes Avulsos (One-time):**

1. Usuário clica em "Comprar"
2. Sistema cria sessão de checkout no Stripe (modo payment)
3. Usuário é redirecionado para página de pagamento do Stripe
4. Após pagamento bem-sucedido:
   - Stripe envia webhook `checkout.session.completed`
   - Sistema adiciona créditos ao usuário (não expiram)

---

## 🧪 Testando:

### **Ambiente de Teste:**

1. Use chaves de teste do Stripe (`pk_test_` e `sk_test_`)
2. Use cartão de teste: `4242 4242 4242 4242`
3. Qualquer data de expiração futura
4. Qualquer CVC

### **Verificar se está funcionando:**

1. Abra o console do navegador (F12)
2. Clique em um botão de compra
3. Verifique se aparece o redirecionamento para Stripe
4. Complete o pagamento de teste
5. Verifique se o webhook foi processado (logs do servidor)

---

## 📝 Notas Importantes:

### **Plano FREE:**
- O botão "Plano Gratuito" não cria checkout
- Apenas mostra mensagem que o plano já está ativo

### **Segurança:**
- ✅ Tokens JWT são validados em todas as requisições
- ✅ Webhook secret é validado para garantir que eventos vêm do Stripe
- ✅ Dados do usuário são passados via metadata (não expostos publicamente)

### **Tratamento de Erros:**
- Se um plano não estiver configurado, mostra alerta
- Se houver erro no checkout, mostra mensagem de erro
- Logs detalhados no console do servidor

---

## 🔧 Troubleshooting:

### **Erro: "Chave secreta do Stripe não configurada"**
- Verifique se a Secret Key está salva no Dashboard Admin

### **Erro: "Price ID do Stripe não configurado"**
- Verifique se o Price ID está preenchido no Dashboard Admin
- Certifique-se de que o Price ID está correto no Stripe

### **Webhook não está funcionando:**
- Verifique se a URL do webhook está correta
- Verifique se o webhook secret está configurado
- Verifique logs do servidor para erros
- Teste o webhook no painel do Stripe (Send test webhook)

### **Usuário não recebe créditos após pagamento:**
- Verifique logs do servidor para ver se webhook foi processado
- Verifique se o planKey está correto no metadata
- Verifique se a tabela `plan_credits` tem os valores corretos

---

## 📊 Estrutura de Dados:

### **Tabela app_settings:**
- `stripe_publishable_key` - Chave pública do Stripe
- `stripe_secret_key` - Chave secreta do Stripe
- `stripe_webhook_secret` - Secret do webhook
- `stripe_plan-start` - Price ID do plano START
- `stripe_plan-turbo` - Price ID do plano TURBO
- `stripe_plan-master` - Price ID do plano MASTER
- `stripe_plan-start-annual` - Price ID do plano START anual
- `stripe_plan-turbo-annual` - Price ID do plano TURBO anual
- `stripe_plan-master-annual` - Price ID do plano MASTER anual
- `stripe_package-1000` - Price ID do pacote 1.000 créditos
- `stripe_package-2500` - Price ID do pacote 2.500 créditos
- `stripe_package-5000` - Price ID do pacote 5.000 créditos
- `stripe_package-10000` - Price ID do pacote 10.000 créditos
- `stripe_package-20000` - Price ID do pacote 20.000 créditos

---

## ✅ Checklist Final:

- [x] Stripe instalado
- [x] Endpoints criados
- [x] Frontend integrado
- [ ] Stripe configurado no Dashboard Admin
- [ ] Price IDs configurados
- [ ] Webhook configurado no Stripe
- [ ] Teste realizado com cartão de teste

---

## 🎉 Pronto!

Agora todos os botões de compra estão funcionais! Quando o usuário clicar em qualquer botão, será redirecionado para o checkout do Stripe e, após o pagamento, o sistema será atualizado automaticamente via webhook.

