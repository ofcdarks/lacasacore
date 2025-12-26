Vou aprofundar significativamente a análise do canal, transformando-a de um resumo genérico para uma ferramenta estratégica baseada em dados reais e comportamentais.

### 1. Coleta de Dados Expandida (`fetchChannelDataForInsights`)
Atualmente, o sistema olha apenas para títulos e visualizações básicas de 20 vídeos.
*   **Aumentar Amostra:** Analisaremos os **50 vídeos mais recentes** para ter relevância estatística.
*   **Métricas de Engajamento:** Coletaremos Likes e Contagem de Comentários para calcular a **Taxa de Engajamento Real** (não apenas views).
*   **Análise de Sentimento:** Buscaremos os **comentários dos 5 vídeos com melhor performance** para entender *por que* o público gostou (feedback qualitativo).
*   **Dados Temporais:** Analisaremos as datas e horários reais de publicação dos vídeos de sucesso para recomendar horários baseados em fatos, não em estimativas gerais.

### 2. Processamento Avançado e Engenharia de Prompt (`generateChannelInsights`)
Vou reescrever o prompt da IA para gerar insights de nível consultivo:
*   **Análise de Outliers:** Identificar vídeos que performaram muito acima/abaixo da média e explicar os padrões (ex: "Vídeos com rosto na thumbnail tiveram 3x mais cliques").
*   **Auditoria de SEO:** Analisar se as palavras-chave nos títulos e descrições estão alinhadas com o nicho.
*   **Análise de Sentimento do Público:** Sintetizar o que os espectadores estão pedindo ou elogiando nos comentários.
*   **Matriz de Conteúdo:** Categorizar quais tópicos geram mais retenção/engajamento vs. quais geram apenas views vazios.

### 3. Melhoria na Apresentação
*   Manter a compatibilidade com a interface atual, mas enriquecer drasticamente o conteúdo dos campos `Resumo`, `Estratégias` e `Padrões de Título`.
*   Os "Padrões de Títulos" deixarão de ser dicas genéricas (ex: "Use listas") para serem padrões extraídos do próprio canal (ex: "Títulos começando com 'O Segredo de...' têm 40% mais views").

**Resumo da Mudança Técnica:**
*   Edição no arquivo `Backend/server.js`:
    *   Atualizar função `fetchChannelDataForInsights` para buscar mais vídeos, estatísticas detalhadas e comentários.
    *   Atualizar função `generateChannelInsights` com lógica de cálculo de engajamento e novo prompt estruturado para "Deep Dive Analysis".
