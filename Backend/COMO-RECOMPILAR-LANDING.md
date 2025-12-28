# Como Recompilar a Landing Page React

A landing page foi criada com **Vite + React** (provavelmente usando Lovable.dev).

## Opções para Atualizar os Valores

### Opção 1: Se você tem acesso ao código fonte React

1. Navegue até a pasta do projeto React da landing page
2. Localize onde os valores dos planos estão definidos (geralmente em um arquivo de configuração ou componente de planos)
3. Atualize os valores:
   - FREE: `100` → `50` créditos/mês
   - START CREATOR: `1000` → `800` créditos/mês
   - TURBO MAKER: `2500` → `1600` créditos/mês
   - MASTER PRO: `5000` → `2400` créditos/mês
4. Execute o build:
   ```bash
   npm run build
   # ou
   yarn build
   # ou
   pnpm build
   ```
5. Copie os arquivos da pasta `dist` para `Backend/landing-dist/`

### Opção 2: Se você usa Lovable.dev

1. Acesse seu projeto no Lovable.dev
2. Encontre o componente de planos/preços
3. Atualize os valores diretamente na interface
4. Faça o deploy/export da landing page atualizada
5. Substitua os arquivos em `Backend/landing-dist/`

### Opção 3: Atualização Manual nos Arquivos Compilados (Já feito)

Já atualizei os arquivos JavaScript compilados diretamente:
- `Backend/landing-dist/assets/index-CJf_7i13.js`
- `Backend/landing-dist/assets/index-D74MUa4q.js`

**Importante:** Limpe o cache do navegador (Ctrl+F5) para ver as mudanças.

### Opção 4: Usar Endpoint API (Recomendado para futuro)

Criei um endpoint público `/api/public/plans` que retorna os valores corretos.
Você pode modificar a landing page React para consumir esse endpoint ao invés de valores hardcoded.

## Valores Corretos dos Planos

- **FREE (Acesso Inicial):** 50 créditos/mês
- **START CREATOR:** 800 créditos/mês  
- **TURBO MAKER:** 1.600 créditos/mês
- **MASTER PRO:** 2.400 créditos/mês

## Verificação

Após atualizar, acesse `http://localhost:3000/` e verifique se os valores estão corretos.
Se ainda aparecerem valores antigos, limpe o cache do navegador (Ctrl+Shift+Delete ou Ctrl+F5).

