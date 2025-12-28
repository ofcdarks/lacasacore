O problema de travamento em 90% ocorre porque o servidor Node.js tem um limite padrão de **2 minutos** para responder. Como a geração de 138 cenas demora mais que isso, o servidor corta a conexão silenciosamente enquanto o frontend continua esperando (travado nos 90%).

### Solução Planejada:

1.  **Aumentar Timeout da Rota:**
    *   Vou configurar o servidor para aguardar até **30 minutos** especificamente nas rotas de geração de prompts (`/api/generate/scene-prompts*`), garantindo que a conexão não seja cortada durante o processamento longo.

2.  **Otimizar Lotes (Batching):**
    *   Vou reduzir o tamanho dos lotes de 12 para **8 cenas por vez**.
    *   *Por que?* Lotes menores processam mais rápido e têm menos chance de falhar na API da IA, tornando o progresso mais constante e seguro.

3.  **Manter Recuperação de Falhas:**
    *   A lógica de "placeholders de emergência" que criei continuará ativa. Se um lote específico falhar, ele será preenchido com cenas vazias para não quebrar o processo todo.

Com isso, o servidor terá tempo de terminar todo o trabalho e devolver a resposta completa para o frontend, destravando a barra de progresso.