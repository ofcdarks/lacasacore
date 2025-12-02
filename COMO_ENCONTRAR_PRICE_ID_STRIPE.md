# 🔍 Como Encontrar o Price ID Correto no Stripe

## ⚠️ PROBLEMA COMUM

Você está vendo o erro: **"No such price: 'prod_...'"**

Isso acontece porque você configurou um **Product ID** (`prod_...`) ao invés de um **Price ID** (`price_...`).

## ✅ SOLUÇÃO

### **Diferença entre Product ID e Price ID:**

- **Product ID** (`prod_...`): Identifica o produto/serviço
- **Price ID** (`price_...`): Identifica o preço específico (mensal, anual, etc.)

**Você precisa usar o Price ID, não o Product ID!**

---

## 📋 Passo a Passo para Encontrar o Price ID

### **1. Acesse o Dashboard do Stripe**
- Vá para: https://dashboard.stripe.com
- Faça login na sua conta

### **2. Navegue até "Produtos"**
- No menu lateral, clique em **"Produtos"** (Products)
- Ou acesse diretamente: https://dashboard.stripe.com/products

### **3. Encontre o Produto**
- Procure pelo produto que você criou (ex: "START CREATOR", "TURBO MAKER", etc.)
- Clique no produto

### **4. Veja os Preços (Prices)**
- Na página do produto, você verá uma seção **"Preços"** (Prices)
- Cada preço tem um **Price ID** que começa com `price_`

### **5. Copie o Price ID Correto**
- Para planos **mensais**: copie o Price ID do preço mensal
- Para planos **anuais**: copie o Price ID do preço anual
- Para **pacotes avulsos**: copie o Price ID do preço único

**Exemplo:**
```
✅ CORRETO: price_1ABC123def456GHI789
❌ ERRADO: prod_TWeq3qM4p19uhh
```

---

## 🎯 Exemplo Visual

Quando você abrir um produto no Stripe, verá algo assim:

```
Produto: START CREATOR
├── Preço Mensal
│   └── Price ID: price_1ABC123def456GHI789  ← USE ESTE!
└── Preço Anual
    └── Price ID: price_1XYZ789ghi456JKL123  ← USE ESTE!
```

---

## 🔧 Como Configurar no Dashboard Admin

1. Acesse o **Dashboard Admin** da sua aplicação
2. Vá em **"Pagamentos (Stripe)"**
3. Para cada plano, cole o **Price ID** (não o Product ID):
   - `plan-start` → Cole o Price ID do plano mensal START
   - `plan-start-annual` → Cole o Price ID do plano anual START
   - `plan-turbo` → Cole o Price ID do plano mensal TURBO
   - E assim por diante...

---

## ⚡ Dica Rápida

Se você não tem um Price ID ainda:

1. **Crie um novo produto no Stripe:**
   - Vá em "Produtos" → "Adicionar produto"
   - Configure nome, descrição, preço
   - **Importante:** Ao criar o preço, o Stripe gera automaticamente um Price ID

2. **Ou adicione um preço a um produto existente:**
   - Abra o produto
   - Clique em "Adicionar preço" (Add price)
   - Configure o preço (mensal, anual, etc.)
   - Copie o Price ID gerado

---

## ✅ Verificação

Após configurar, o Price ID deve:
- ✅ Começar com `price_`
- ✅ Ter aproximadamente 24-28 caracteres
- ✅ Estar associado ao produto correto no Stripe

---

## 🆘 Ainda com Problemas?

Se você ainda está vendo erros:

1. **Verifique se o Price ID está correto:**
   - Deve começar com `price_`
   - Não deve ser um Product ID (`prod_`)

2. **Verifique se o Price ID existe no Stripe:**
   - Acesse o produto no Stripe
   - Confirme que o Price ID que você copiou realmente existe

3. **Verifique se está usando a chave correta:**
   - Se está testando, use chaves de **teste** (`sk_test_...`)
   - Se está em produção, use chaves de **produção** (`sk_live_...`)
   - **Não misture!** Price IDs de teste só funcionam com chaves de teste

---

## 📝 Resumo

| O que você precisa | Formato | Onde encontrar |
|-------------------|---------|----------------|
| **Price ID** | `price_...` | Stripe → Produtos → [Seu Produto] → Preços |
| **Product ID** | `prod_...` | ❌ NÃO USE - não funciona para checkout |

**Sempre use o Price ID (`price_...`) para checkout!**

