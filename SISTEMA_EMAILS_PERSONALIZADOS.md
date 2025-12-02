# 📧 Sistema de Emails Personalizados - La Casa Dark Core

## ✅ O que foi implementado:

### 1. **Sistema de Envio de Emails**
- ✅ Nodemailer instalado e configurado
- ✅ Funções de envio de emails criadas
- ✅ Sistema de templates com substituição de variáveis
- ✅ Integração com configuração SMTP do dashboard

### 2. **Templates de Email Configuráveis**

#### **Templates Principais:**
1. **Boas-vindas (Registro)** - `register`
   - Enviado quando usuário se cadastra
   - Variáveis: `{{nome}}`, `{{email}}`, `{{creditos_iniciais}}`, `{{link_acesso}}`

2. **Cancelamento** - `cancel`
   - Enviado quando assinatura é cancelada
   - Variáveis: `{{nome}}`, `{{email}}`, `{{plano}}`, `{{data_cancelamento}}`, `{{data_fim_acesso}}`

3. **Confirmação de Pagamento** - `payment`
   - Enviado quando pagamento é confirmado (template genérico)
   - Variáveis: `{{nome}}`, `{{email}}`, `{{plano}}`, `{{valor}}`, `{{data_pagamento}}`, `{{proxima_cobranca}}`

4. **Pacote de Créditos** - `package`
   - Enviado quando pacote avulso é comprado
   - Variáveis: `{{nome}}`, `{{email}}`, `{{pacote}}`, `{{creditos}}`, `{{valor}}`, `{{data_compra}}`, `{{saldo_atual}}`

5. **Senha Provisória** - `password_reset`
   - Enviado quando admin cria senha provisória
   - Variáveis: `{{nome}}`, `{{email}}`, `{{senha_provisoria}}`, `{{link_acesso}}`

#### **Templates por Plano (Opcionais):**
- `subscription_plan-start` - START CREATOR Mensal
- `subscription_plan-turbo` - TURBO MAKER Mensal
- `subscription_plan-master` - MASTER PRO Mensal
- `subscription_plan-start-annual` - START CREATOR Anual
- `subscription_plan-turbo-annual` - TURBO MAKER Anual
- `subscription_plan-master-annual` - MASTER PRO Anual

**Variáveis disponíveis para templates de assinatura:**
- `{{nome}}`, `{{email}}`, `{{plano}}`, `{{valor}}`, `{{data_pagamento}}`, `{{proxima_cobranca}}`, `{{creditos}}`

---

## 🚀 Como Configurar:

### **Passo 1: Configurar SMTP**

1. Acesse o **Dashboard Admin**
2. Vá em **"Configurações"** → **"Templates de Email"**
3. Configure o SMTP:
   - **Servidor SMTP**: Ex: `smtp.gmail.com`
   - **Porta**: Ex: `587` (ou `465` para SSL)
   - **Email de Envio**: Seu email
   - **Senha**: Senha do email (para Gmail, use senha de app)
   - **Usar TLS/SSL**: Marque se necessário

### **Passo 2: Configurar Templates**

Na mesma seção, configure cada template:

1. **Boas-vindas**: Personalize a mensagem de boas-vindas
2. **Cancelamento**: Personalize a mensagem de cancelamento
3. **Confirmação de Pagamento**: Template genérico para todos os planos
4. **Pacote de Créditos**: Mensagem para compra de pacotes
5. **Senha Provisória**: Mensagem com senha temporária

### **Passo 3: Templates por Plano (Opcional)**

Para personalizar emails específicos por plano:
1. Preencha os campos de cada plano
2. Clique em **"Salvar Todos os Templates de Assinatura"**
3. Se não configurar, será usado o template genérico de "Confirmação de Pagamento"

---

## 📝 Exemplos de Templates:

### **Boas-vindas:**
```
Assunto: Bem-vindo à La Casa Dark Core!

Corpo:
Olá {{nome}},

Bem-vindo à La Casa Dark Core! Estamos muito felizes em tê-lo conosco.

Sua conta foi criada com sucesso e você já pode começar a usar todas as funcionalidades da plataforma.

Seus créditos iniciais: {{creditos_iniciais}}

Acesse sua conta: {{link_acesso}}

Qualquer dúvida, estamos à disposição!

Equipe La Casa Dark Core
```

### **Assinatura de Plano:**
```
Assunto: Assinatura {{plano}} Confirmada!

Corpo:
Olá {{nome}},

Sua assinatura do plano {{plano}} foi confirmada com sucesso!

Detalhes:
- Plano: {{plano}}
- Valor: {{valor}}
- Data do pagamento: {{data_pagamento}}
- Próxima cobrança: {{proxima_cobranca}}
- Créditos mensais: {{creditos}}

Obrigado por confiar em nós!

Equipe La Casa Dark Core
```

---

## 🔄 Quando os Emails são Enviados:

1. **Boas-vindas**: Automaticamente ao criar conta
2. **Assinatura**: Automaticamente quando pagamento é confirmado via Stripe webhook
3. **Cancelamento**: Automaticamente quando assinatura é cancelada via Stripe webhook
4. **Pacote**: Automaticamente quando pacote avulso é comprado
5. **Senha Provisória**: Automaticamente quando admin cria senha provisória

---

## ⚙️ Configuração SMTP por Provedor:

### **Gmail:**
- Servidor: `smtp.gmail.com`
- Porta: `587` (TLS) ou `465` (SSL)
- Senha: Use "Senha de App" (não a senha normal)
- Como criar senha de app: https://support.google.com/accounts/answer/185833

### **Outlook/Hotmail:**
- Servidor: `smtp-mail.outlook.com`
- Porta: `587`
- Usar TLS: Sim

### **SendGrid:**
- Servidor: `smtp.sendgrid.net`
- Porta: `587`
- Email: `apikey`
- Senha: Sua API key do SendGrid

### **Mailgun:**
- Servidor: `smtp.mailgun.org`
- Porta: `587`
- Email e senha: Credenciais do Mailgun

---

## 🧪 Testar Envio de Emails:

1. Configure o SMTP no dashboard
2. Configure um template (ex: Boas-vindas)
3. Crie uma conta de teste
4. Verifique se o email foi recebido

**Nota:** Se não receber, verifique:
- Spam/lixo eletrônico
- Logs do servidor (console)
- Configuração SMTP (credenciais corretas)

---

## 📊 Variáveis Disponíveis por Template:

### **Boas-vindas (`register`):**
- `{{nome}}` - Nome do usuário
- `{{email}}` - Email do usuário
- `{{creditos_iniciais}}` - Créditos iniciais recebidos
- `{{link_acesso}}` - Link para fazer login

### **Cancelamento (`cancel`):**
- `{{nome}}` - Nome do usuário
- `{{email}}` - Email do usuário
- `{{plano}}` - Nome do plano cancelado
- `{{data_cancelamento}}` - Data do cancelamento
- `{{data_fim_acesso}}` - Data até quando terá acesso

### **Confirmação de Pagamento (`payment`):**
- `{{nome}}` - Nome do usuário
- `{{email}}` - Email do usuário
- `{{plano}}` - Nome do plano
- `{{valor}}` - Valor pago (ex: R$ 79,90)
- `{{data_pagamento}}` - Data do pagamento
- `{{proxima_cobranca}}` - Data da próxima cobrança

### **Pacote de Créditos (`package`):**
- `{{nome}}` - Nome do usuário
- `{{email}}` - Email do usuário
- `{{pacote}}` - Nome do pacote
- `{{creditos}}` - Quantidade de créditos
- `{{valor}}` - Valor pago
- `{{data_compra}}` - Data da compra
- `{{saldo_atual}}` - Saldo atual de créditos

### **Senha Provisória (`password_reset`):**
- `{{nome}}` - Nome do usuário
- `{{email}}` - Email do usuário
- `{{senha_provisoria}}` - Senha temporária
- `{{link_acesso}}` - Link para fazer login

### **Templates de Assinatura (`subscription_*`):**
- `{{nome}}` - Nome do usuário
- `{{email}}` - Email do usuário
- `{{plano}}` - Nome do plano
- `{{valor}}` - Valor pago
- `{{data_pagamento}}` - Data do pagamento
- `{{proxima_cobranca}}` - Data da próxima cobrança
- `{{creditos}}` - Créditos mensais do plano

---

## ✅ Checklist de Configuração:

- [ ] SMTP configurado no dashboard
- [ ] Template de Boas-vindas configurado
- [ ] Template de Cancelamento configurado
- [ ] Template de Confirmação de Pagamento configurado
- [ ] Template de Pacote de Créditos configurado
- [ ] Template de Senha Provisória configurado
- [ ] (Opcional) Templates por plano configurados
- [ ] Teste de envio realizado

---

## 🎉 Pronto!

Agora todos os emails são enviados automaticamente nos momentos corretos, com templates personalizáveis no dashboard admin!

