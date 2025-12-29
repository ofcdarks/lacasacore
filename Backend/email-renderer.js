// Email Renderer - Renderiza templates de email para HTML
// Usa templates HTML puros (não precisa de React)

/**
 * Renderiza um template de email para HTML
 * @param {string} templateName - Nome do template (AccessGrantedEmail, PendingApprovalEmail, etc)
 * @param {object} props - Props para passar ao template
 * @returns {string} HTML renderizado
 */
async function renderEmailTemplate(templateName, props = {}) {
    // Usar diretamente os templates HTML fallback (mais confiáveis e rápidos)
    return renderFallbackTemplate(templateName, props);
}

/**
 * Template HTML profissional e moderno
 */
function renderFallbackTemplate(templateName, props) {
    const { userName = 'Usuário', planName = '', resetLink = '#', endDate = '', features = [], loginLink = 'http://127.0.0.1:5001/dashboard.html', 
            pacote = '', creditos = 0, valor = '', data_compra = '', saldo_atual = 0, data_pagamento = '', proxima_cobranca = '' } = props;
    
    // Cores da landing page
    const colors = {
        primary: '#f97316', // Orange-500
        primaryGradient: 'linear-gradient(135deg, hsl(38, 92%, 50%) 0%, hsl(32, 95%, 45%) 100%)',
        background: 'hsl(220, 15%, 4%)',
        card: 'hsl(220, 15%, 7%)',
        text: 'hsl(0, 0%, 98%)',
        textMuted: 'hsl(220, 8%, 55%)',
        success: '#22c55e',
        warning: '#f59e0b'
    };
    
    // Função helper para criar header com coroa de rei
    const createHeader = () => `
        <tr>
            <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                <div style="position:relative;z-index:1;">
                    <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                    <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                    <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                </div>
            </td>
        </tr>
    `;
    
    const templates = {
        PendingApprovalEmail: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <meta name="supported-color-schemes" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Inter:wght@400;600;700&display=swap');
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <!-- Preview Text (oculto mas visível na caixa de entrada) -->
                <div style="display:none;font-size:1px;color:${colors.background};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
                    🎉 Cadastro recebido! Sua jornada para criar conteúdo viral está prestes a começar. Nossa equipe está analisando seu cadastro e você receberá uma confirmação em até 24-48 horas.
                </div>
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.1);">
                                <!-- Header com gradiente da landing page -->
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:48px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Conteúdo principal -->
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <div style="text-align:center;margin-bottom:36px;">
                                            <div style="display:inline-block;background:linear-gradient(135deg,rgba(249,115,22,0.25),rgba(249,115,22,0.08));border:2px solid rgba(249,115,22,0.4);border-radius:50%;padding:28px;margin-bottom:28px;box-shadow:0 8px 32px rgba(249,115,22,0.2);">
                                                <span style="font-size:56px;">⏳</span>
                                            </div>
                                        </div>
                                        <h2 style="color:${colors.text};font-size:36px;font-weight:800;text-align:center;margin-bottom:28px;letter-spacing:-1px;font-family:'Outfit',sans-serif;">🎯 Cadastro Recebido!</h2>
                                        <p style="color:${colors.primary};font-size:20px;font-weight:700;margin-bottom:20px;text-align:center;">Olá, ${userName}! 👋</p>
                                        <p style="color:${colors.text};font-size:17px;line-height:1.7;margin-bottom:28px;text-align:center;opacity:0.95;">
                                            Ficamos <strong style="color:${colors.primary};">muito felizes</strong> em receber seu cadastro! Sua jornada para criar conteúdo viral está prestes a começar.
                                        </p>
                                        <!-- Status Badge -->
                                        <div style="text-align:center;margin:36px 0;">
                                            <div style="display:inline-block;background:linear-gradient(135deg,rgba(249,115,22,0.2),rgba(249,115,22,0.05));border:2px solid rgba(249,115,22,0.4);border-radius:50px;padding:18px 40px;box-shadow:0 4px 16px rgba(249,115,22,0.2);">
                                                <span style="font-size:24px;margin-right:10px;">📋</span>
                                                <span style="color:${colors.primary};font-weight:800;font-size:16px;letter-spacing:0.5px;">EM ANÁLISE</span>
                                            </div>
                                        </div>
                                        <p style="color:${colors.textMuted};font-size:16px;line-height:1.8;margin-bottom:36px;text-align:center;">
                                            Nossa equipe está analisando seu cadastro. Este processo geralmente leva até <strong style="color:${colors.success};">24-48 horas</strong>.
                                        </p>
                                        <!-- Timeline -->
                                        <div style="background:rgba(0,0,0,0.4);border-radius:20px;padding:36px;margin:36px 0;border:1px solid rgba(249,115,22,0.15);box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                                            <h3 style="color:${colors.text};font-size:22px;font-weight:800;margin-bottom:28px;text-align:center;font-family:'Outfit',sans-serif;">📋 Próximos Passos</h3>
                                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                                <tr>
                                                    <td width="48" valign="top" style="padding-right:20px;">
                                                        <div style="background:${colors.primaryGradient};color:#fff;width:48px;height:48px;border-radius:50%;text-align:center;line-height:48px;font-weight:800;font-size:20px;box-shadow:0 4px 16px rgba(249,115,22,0.3);">1</div>
                                                    </td>
                                                    <td valign="top">
                                                        <p style="color:${colors.text};font-weight:700;font-size:16px;margin-bottom:6px;margin-top:0;">Análise da Conta</p>
                                                        <p style="color:${colors.textMuted};font-size:14px;line-height:1.6;margin:0;">Nossa equipe verifica seu cadastro</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                                <tr>
                                                    <td width="48" valign="top" style="padding-right:20px;">
                                                        <div style="background:${colors.primaryGradient};color:#fff;width:48px;height:48px;border-radius:50%;text-align:center;line-height:48px;font-weight:800;font-size:20px;box-shadow:0 4px 16px rgba(249,115,22,0.3);">2</div>
                                                    </td>
                                                    <td valign="top">
                                                        <p style="color:${colors.text};font-weight:700;font-size:16px;margin-bottom:6px;margin-top:0;">Aprovação</p>
                                                        <p style="color:${colors.textMuted};font-size:14px;line-height:1.6;margin:0;">Você receberá um email de confirmação</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            <table width="100%" cellpadding="0" cellspacing="0">
                                                <tr>
                                                    <td width="48" valign="top" style="padding-right:20px;">
                                                        <div style="background:linear-gradient(135deg,${colors.success},#16a34a);color:#fff;width:48px;height:48px;border-radius:50%;text-align:center;line-height:48px;font-weight:800;font-size:20px;box-shadow:0 4px 16px rgba(34,197,94,0.3);">3</div>
                                                    </td>
                                                    <td valign="top">
                                                        <p style="color:${colors.text};font-weight:700;font-size:16px;margin-bottom:6px;margin-top:0;">Acesso Liberado! 🎉</p>
                                                        <p style="color:${colors.textMuted};font-size:14px;line-height:1.6;margin:0;">Comece a criar conteúdo de sucesso</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </div>
                                        <!-- Features Preview -->
                                        <div style="background:linear-gradient(135deg,rgba(249,115,22,0.15),rgba(249,115,22,0.03));border:1px solid rgba(249,115,22,0.25);border-radius:20px;padding:36px;margin:36px 0;box-shadow:0 8px 32px rgba(249,115,22,0.1);">
                                            <h3 style="color:${colors.text};font-size:20px;font-weight:800;margin-bottom:24px;text-align:center;font-family:'Outfit',sans-serif;">🚀 Em Breve Você Terá Acesso a:</h3>
                                            <table width="100%" cellpadding="10" cellspacing="0">
                                                <tr><td style="color:${colors.text};font-size:15px;padding:10px 0;"><span style="color:${colors.success};font-weight:800;margin-right:14px;font-size:18px;">✓</span>Analisador de Títulos Virais com IA</td></tr>
                                                <tr><td style="color:${colors.text};font-size:15px;padding:10px 0;"><span style="color:${colors.success};font-weight:800;margin-right:14px;font-size:18px;">✓</span>Gerador de Thumbnails Automático</td></tr>
                                                <tr><td style="color:${colors.text};font-size:15px;padding:10px 0;"><span style="color:${colors.success};font-weight:800;margin-right:14px;font-size:18px;">✓</span>Roteiros Inteligentes para Vídeos</td></tr>
                                                <tr><td style="color:${colors.text};font-size:15px;padding:10px 0;"><span style="color:${colors.success};font-weight:800;margin-right:14px;font-size:18px;">✓</span>Análise de Competidores e Nichos</td></tr>
                                            </table>
                                        </div>
                                        <!-- Info Box -->
                                        <div style="background:linear-gradient(135deg,rgba(59,130,246,0.15),rgba(59,130,246,0.05));border:1px solid rgba(59,130,246,0.3);border-radius:16px;padding:24px;text-align:center;margin-top:36px;box-shadow:0 4px 16px rgba(59,130,246,0.1);">
                                            <p style="color:${colors.text};font-weight:700;font-size:16px;margin-bottom:10px;">💡 Dica Importante</p>
                                            <p style="color:${colors.textMuted};font-size:14px;line-height:1.7;">Fique de olho em sua caixa de entrada e <strong style="color:${colors.primary};">pasta de spam</strong> para não perder o email de aprovação!</p>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Footer -->
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:12px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                        <p style="font-size:12px;">
                                            <a href="/termos-de-uso" style="color:#f59e0b;text-decoration:none;margin:0 8px;">Termos de Uso</a>
                                            <span style="color:rgba(255,255,255,0.3);">•</span>
                                            <a href="/politica-de-privacidade" style="color:#f59e0b;text-decoration:none;margin:0 8px;">Política de Privacidade</a>
                                            <span style="color:rgba(255,255,255,0.3);">•</span>
                                            <a href="https://wa.me/5514997022684?text=Olá! Preciso de suporte com a La Casa Dark Core." style="color:#f59e0b;text-decoration:none;margin:0 8px;">Suporte</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        AccessGrantedEmail: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <meta name="supported-color-schemes" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Inter:wght@400;600;700&display=swap');
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(34,197,94,0.2);border:1px solid rgba(34,197,94,0.15);">
                                <!-- Header com coroa de rei -->
                                <tr>
                                    <td style="background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Conteúdo principal -->
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <div style="text-align:center;margin-bottom:32px;">
                                            <div style="display:inline-block;background:linear-gradient(135deg,rgba(34,197,94,0.2),rgba(34,197,94,0.05));border:2px solid rgba(34,197,94,0.4);border-radius:50%;padding:24px;margin-bottom:24px;">
                                                <span style="font-size:48px;">🏆</span>
                                            </div>
                                        </div>
                                        <h2 style="color:#fff;font-size:32px;font-weight:700;text-align:center;margin-bottom:24px;letter-spacing:-0.5px;">Seu Acesso Foi Liberado!</h2>
                                        <p style="color:#22c55e;font-size:18px;font-weight:600;margin-bottom:16px;">Olá, ${userName}! 👋</p>
                                        <p style="color:rgba(255,255,255,0.85);font-size:16px;line-height:1.6;margin-bottom:24px;">
                                            Parabéns! Seu acesso ao plano <strong style="color:#f59e0b;">${planName || 'Premium'}</strong> foi <strong style="color:#22c55e;">ativado com sucesso</strong>! Você já pode aproveitar todos os recursos exclusivos da nossa plataforma.
                                        </p>
                                        <!-- Plan Badge -->
                                        <div style="text-align:center;margin:32px 0;">
                                            <div style="display:inline-block;background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05));border:2px solid rgba(245,158,11,0.3);border-radius:50px;padding:16px 32px;">
                                                <span style="font-size:20px;margin-right:8px;">⭐</span>
                                                <span style="color:#f59e0b;font-weight:700;font-size:15px;">PLANO ${(planName || 'PREMIUM').toUpperCase()} ATIVO</span>
                                            </div>
                                        </div>
                                        <!-- Features List -->
                                        <div style="background:rgba(0,0,0,0.3);border-radius:16px;padding:32px;margin:32px 0;border:1px solid rgba(245,158,11,0.15);">
                                            <h3 style="color:#fff;font-size:18px;font-weight:700;margin-bottom:20px;text-align:center;">🚀 Seus Benefícios Exclusivos:</h3>
                                            <table width="100%" cellpadding="8" cellspacing="0">
                                                <tr><td style="color:rgba(255,255,255,0.85);font-size:14px;padding:8px 0;"><span style="color:#22c55e;font-weight:700;margin-right:12px;font-size:18px;">✓</span>Analisador de Títulos Virais com IA</td></tr>
                                                <tr><td style="color:rgba(255,255,255,0.85);font-size:14px;padding:8px 0;"><span style="color:#22c55e;font-weight:700;margin-right:12px;font-size:18px;">✓</span>Gerador de Thumbnails Automático</td></tr>
                                                <tr><td style="color:rgba(255,255,255,0.85);font-size:14px;padding:8px 0;"><span style="color:#22c55e;font-weight:700;margin-right:12px;font-size:18px;">✓</span>Roteiros Inteligentes para Vídeos</td></tr>
                                                <tr><td style="color:rgba(255,255,255,0.85);font-size:14px;padding:8px 0;"><span style="color:#22c55e;font-weight:700;margin-right:12px;font-size:18px;">✓</span>Análise de Competidores e Nichos</td></tr>
                                                <tr><td style="color:rgba(255,255,255,0.85);font-size:14px;padding:8px 0;"><span style="color:#22c55e;font-weight:700;margin-right:12px;font-size:18px;">✓</span>Biblioteca de Títulos de Sucesso</td></tr>
                                                <tr><td style="color:rgba(255,255,255,0.85);font-size:14px;padding:8px 0;"><span style="color:#22c55e;font-weight:700;margin-right:12px;font-size:18px;">✓</span>Suporte Prioritário 24/7</td></tr>
                                            </table>
                                        </div>
                                        <!-- CTA Button -->
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="${loginLink}" style="display:inline-block;background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);color:#fff;padding:18px 48px;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;box-shadow:0 8px 32px rgba(34,197,94,0.4);">🚀 Acessar Minha Conta</a>
                                        </div>
                                        <!-- Quick Start -->
                                        <div style="background:rgba(0,0,0,0.3);border-radius:16px;padding:32px;margin:32px 0;border:1px solid rgba(255,255,255,0.05);">
                                            <h3 style="color:#fff;font-size:20px;font-weight:700;margin-bottom:24px;text-align:center;">📋 Primeiros Passos</h3>
                                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                                                <tr>
                                                    <td width="40" valign="top" style="padding-right:16px;">
                                                        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#0a0a0f;width:40px;height:40px;border-radius:50%;text-align:center;line-height:40px;font-weight:700;font-size:18px;">1</div>
                                                    </td>
                                                    <td valign="top">
                                                        <p style="color:#fff;font-weight:600;font-size:15px;margin-bottom:4px;margin-top:0;">Configure seu Dashboard</p>
                                                        <p style="color:rgba(255,255,255,0.6);font-size:13px;line-height:1.5;margin:0;">Personalize sua experiência</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                                                <tr>
                                                    <td width="40" valign="top" style="padding-right:16px;">
                                                        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#0a0a0f;width:40px;height:40px;border-radius:50%;text-align:center;line-height:40px;font-weight:700;font-size:18px;">2</div>
                                                    </td>
                                                    <td valign="top">
                                                        <p style="color:#fff;font-weight:600;font-size:15px;margin-bottom:4px;margin-top:0;">Explore as Ferramentas</p>
                                                        <p style="color:rgba(255,255,255,0.6);font-size:13px;line-height:1.5;margin:0;">Títulos virais, thumbnails IA e mais</p>
                                                    </td>
                                                </tr>
                                            </table>
                                            <table width="100%" cellpadding="0" cellspacing="0">
                                                <tr>
                                                    <td width="40" valign="top" style="padding-right:16px;">
                                                        <div style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;width:40px;height:40px;border-radius:50%;text-align:center;line-height:40px;font-weight:700;font-size:18px;">3</div>
                                                    </td>
                                                    <td valign="top">
                                                        <p style="color:#fff;font-weight:600;font-size:15px;margin-bottom:4px;margin-top:0;">Crie Conteúdo de Sucesso</p>
                                                        <p style="color:rgba(255,255,255,0.6);font-size:13px;line-height:1.5;margin:0;">Veja seu canal crescer</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </div>
                                        <!-- Support Box -->
                                        <div style="background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.02));border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:24px;text-align:center;">
                                            <p style="color:#fff;font-weight:600;font-size:16px;margin-bottom:8px;">💬 Precisa de Ajuda?</p>
                                            <p style="color:rgba(255,255,255,0.7);font-size:14px;margin-bottom:16px;line-height:1.6;">Nossa equipe de suporte está disponível 24/7 para ajudá-lo.</p>
                                            <a href="https://wa.me/5514997022684?text=Olá! Preciso de suporte com a La Casa Dark Core." style="color:#f59e0b;text-decoration:none;font-weight:600;font-size:14px;">Falar com Suporte →</a>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Footer -->
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:12px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                        <p style="font-size:12px;">
                                            <a href="/termos-de-uso" style="color:#f59e0b;text-decoration:none;margin:0 8px;">Termos de Uso</a>
                                            <span style="color:rgba(255,255,255,0.3);">•</span>
                                            <a href="/politica-de-privacidade" style="color:#f59e0b;text-decoration:none;margin:0 8px;">Política de Privacidade</a>
                                            <span style="color:rgba(255,255,255,0.3);">•</span>
                                            <a href="https://wa.me/5514997022684?text=Olá! Preciso de suporte com a La Casa Dark Core." style="color:#f59e0b;text-decoration:none;margin:0 8px;">Suporte</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        PasswordRecoveryEmail: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.1);">
                                <!-- Header com coroa de rei -->
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Conteúdo -->
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <div style="text-align:center;margin-bottom:32px;">
                                            <div style="display:inline-block;background:linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.05));border:2px solid rgba(245,158,11,0.4);border-radius:50%;padding:24px;">
                                                <span style="font-size:48px;">🔑</span>
                                            </div>
                                        </div>
                                        <h2 style="color:#fff;font-size:32px;font-weight:700;text-align:center;margin-bottom:24px;letter-spacing:-0.5px;">Recuperação de Senha</h2>
                                        <p style="color:#f59e0b;font-size:18px;font-weight:600;margin-bottom:16px;">Olá, ${userName}! 👋</p>
                                        <p style="color:rgba(255,255,255,0.85);font-size:16px;line-height:1.6;margin-bottom:24px;">
                                            Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha segura:
                                        </p>
                                        <!-- CTA Button -->
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#0a0a0f;padding:18px 48px;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;box-shadow:0 8px 32px rgba(245,158,11,0.4);">🔓 Redefinir Minha Senha</a>
                                        </div>
                                        <!-- Security Info -->
                                        <div style="background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:20px;margin-top:32px;">
                                            <p style="color:#fff;font-weight:600;font-size:14px;margin-bottom:8px;text-align:center;">⏰ Validade do Link</p>
                                            <p style="color:rgba(255,255,255,0.7);font-size:13px;line-height:1.6;text-align:center;margin:0;">
                                                Este link expira em <strong style="color:#f59e0b;">24 horas</strong>. Se você não solicitou esta alteração, ignore este email com segurança.
                                            </p>
                                        </div>
                                        <!-- Security Tip -->
                                        <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:20px;margin-top:24px;text-align:center;">
                                            <p style="color:#fff;font-weight:600;font-size:15px;margin-bottom:8px;">🛡️ Dica de Segurança</p>
                                            <p style="color:rgba(255,255,255,0.7);font-size:13px;line-height:1.6;margin:0;">Nunca compartilhe sua senha com terceiros. Nossa equipe nunca solicitará sua senha por email.</p>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Footer -->
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:12px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                        <p style="font-size:12px;">
                                            <a href="/termos-de-uso" style="color:#f59e0b;text-decoration:none;margin:0 8px;">Termos de Uso</a>
                                            <span style="color:rgba(255,255,255,0.3);">•</span>
                                            <a href="/politica-de-privacidade" style="color:#f59e0b;text-decoration:none;margin:0 8px;">Política de Privacidade</a>
                                            <span style="color:rgba(255,255,255,0.3);">•</span>
                                            <a href="https://wa.me/5514997022684?text=Olá! Preciso de suporte com a La Casa Dark Core." style="color:#f59e0b;text-decoration:none;margin:0 8px;">Suporte</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        CancellationEmail: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.2);">
                                <!-- Header com coroa de rei -->
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Conteúdo -->
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <div style="text-align:center;margin-bottom:32px;">
                                            <div style="display:inline-block;background:linear-gradient(135deg,rgba(239,68,68,0.2),rgba(239,68,68,0.05));border:2px solid rgba(239,68,68,0.3);border-radius:50%;padding:24px;">
                                                <span style="font-size:48px;">😢</span>
                                            </div>
                                        </div>
                                        <h2 style="color:#fff;font-size:32px;font-weight:700;text-align:center;margin-bottom:24px;letter-spacing:-0.5px;">Cancelamento Confirmado</h2>
                                        <p style="color:#f59e0b;font-size:18px;font-weight:600;margin-bottom:16px;">Olá, ${userName}! 👋</p>
                                        <p style="color:rgba(255,255,255,0.85);font-size:16px;line-height:1.6;margin-bottom:24px;">
                                            Confirmamos o cancelamento da sua assinatura do plano <strong style="color:#f59e0b;">${planName || 'Premium'}</strong>. Lamentamos ver você partir.
                                        </p>
                                        <!-- Info Card -->
                                        <div style="background:rgba(0,0,0,0.3);border-radius:16px;padding:24px;margin:32px 0;border:1px solid rgba(255,255,255,0.1);">
                                            <table width="100%" cellpadding="8" cellspacing="0">
                                                <tr>
                                                    <td style="color:rgba(255,255,255,0.6);font-size:14px;padding:8px 0;">Plano cancelado:</td>
                                                    <td style="color:#fff;font-weight:600;font-size:14px;text-align:right;padding:8px 0;">${planName || 'Premium'}</td>
                                                </tr>
                                                <tr>
                                                    <td style="color:rgba(255,255,255,0.6);font-size:14px;padding:8px 0;">Acesso até:</td>
                                                    <td style="color:#22c55e;font-weight:600;font-size:14px;text-align:right;padding:8px 0;">${endDate || '31/12/2024'}</td>
                                                </tr>
                                            </table>
                                        </div>
                                        <p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.7;margin-bottom:32px;">
                                            Você ainda terá acesso a todos os recursos até a data acima. Após esse período, sua conta será convertida para o plano gratuito.
                                        </p>
                                        <!-- Reativar Button -->
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="#" style="display:inline-block;background:transparent;color:#f59e0b;padding:16px 40px;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;border:2px solid #f59e0b;">🔄 Reativar Minha Assinatura</a>
                                        </div>
                                        <!-- Feedback Box -->
                                        <div style="background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.02));border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:24px;margin-top:32px;text-align:center;">
                                            <p style="color:#fff;font-weight:600;font-size:16px;margin-bottom:8px;">📝 Nos Ajude a Melhorar</p>
                                            <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;margin-bottom:16px;">
                                                Sua opinião é muito importante. Gostaríamos de saber o motivo do cancelamento para melhorarmos nosso serviço.
                                            </p>
                                            <a href="#" style="color:#f59e0b;text-decoration:none;font-weight:600;font-size:14px;">Deixar Feedback →</a>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Footer -->
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:12px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                        <p style="font-size:12px;">
                                            <a href="/termos-de-uso" style="color:#f59e0b;text-decoration:none;margin:0 8px;">Termos de Uso</a>
                                            <span style="color:rgba(255,255,255,0.3);">•</span>
                                            <a href="/politica-de-privacidade" style="color:#f59e0b;text-decoration:none;margin:0 8px;">Política de Privacidade</a>
                                            <span style="color:rgba(255,255,255,0.3);">•</span>
                                            <a href="https://wa.me/5514997022684?text=Olá! Preciso de suporte com a La Casa Dark Core." style="color:#f59e0b;text-decoration:none;margin:0 8px;">Suporte</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        // Templates dinâmicos por plano - START CREATOR
        'subscription_plan-start': `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.1);">
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <h2 style="color:${colors.text};font-size:36px;font-weight:800;text-align:center;margin-bottom:28px;font-family:'Outfit',sans-serif;">🎉 Assinatura Confirmada!</h2>
                                        <p style="color:${colors.primary};font-size:20px;font-weight:700;margin-bottom:20px;text-align:center;">Olá, ${props.nome || 'Usuário'}! 👋</p>
                                        <p style="color:${colors.text};font-size:17px;line-height:1.7;margin-bottom:28px;text-align:center;">
                                            Sua assinatura do plano <strong style="color:${colors.primary};">START CREATOR</strong> foi confirmada com sucesso!
                                        </p>
                                        <div style="background:rgba(0,0,0,0.4);border-radius:20px;padding:32px;margin:32px 0;border:1px solid rgba(249,115,22,0.2);">
                                            <table width="100%" cellpadding="10">
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Plano:</td><td style="color:${colors.text};font-weight:700;font-size:16px;text-align:right;">START CREATOR</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Valor:</td><td style="color:${colors.success};font-weight:700;font-size:16px;text-align:right;">${valor || 'R$ 79,90'}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Créditos:</td><td style="color:${colors.primary};font-weight:700;font-size:16px;text-align:right;">${props.creditos || 100}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Data de Pagamento:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${data_pagamento || new Date().toLocaleDateString('pt-BR')}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Próxima Cobrança:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${proxima_cobranca || 'Em 30 dias'}</td></tr>
                                            </table>
                                        </div>
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="${loginLink}" style="display:inline-block;background:${colors.primaryGradient};color:#fff;padding:18px 48px;text-decoration:none;border-radius:12px;font-weight:800;font-size:16px;box-shadow:0 8px 32px rgba(249,115,22,0.4);">🚀 Acessar Minha Conta</a>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        // Template TURBO MAKER
        'subscription_plan-turbo': `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.1);">
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <h2 style="color:${colors.text};font-size:36px;font-weight:800;text-align:center;margin-bottom:28px;font-family:'Outfit',sans-serif;">🚀 Assinatura TURBO Confirmada!</h2>
                                        <p style="color:${colors.primary};font-size:20px;font-weight:700;margin-bottom:20px;text-align:center;">Olá, ${props.nome || 'Usuário'}! 👋</p>
                                        <p style="color:${colors.text};font-size:17px;line-height:1.7;margin-bottom:28px;text-align:center;">
                                            Sua assinatura do plano <strong style="color:${colors.primary};">TURBO MAKER</strong> foi confirmada! Agora você tem acesso a recursos avançados.
                                        </p>
                                        <div style="background:rgba(0,0,0,0.4);border-radius:20px;padding:32px;margin:32px 0;border:1px solid rgba(249,115,22,0.2);">
                                            <table width="100%" cellpadding="10">
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Plano:</td><td style="color:${colors.text};font-weight:700;font-size:16px;text-align:right;">TURBO MAKER</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Valor:</td><td style="color:${colors.success};font-weight:700;font-size:16px;text-align:right;">${valor || 'R$ 197,00'}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Créditos:</td><td style="color:${colors.primary};font-weight:700;font-size:16px;text-align:right;">${props.creditos || 500}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Data de Pagamento:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${data_pagamento || new Date().toLocaleDateString('pt-BR')}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Próxima Cobrança:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${proxima_cobranca || 'Em 30 dias'}</td></tr>
                                            </table>
                                        </div>
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="${loginLink}" style="display:inline-block;background:${colors.primaryGradient};color:#fff;padding:18px 48px;text-decoration:none;border-radius:12px;font-weight:800;font-size:16px;box-shadow:0 8px 32px rgba(249,115,22,0.4);">🚀 Acessar Minha Conta</a>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        // Template MASTER PRO
        'subscription_plan-master': `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.1);">
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <h2 style="color:${colors.text};font-size:36px;font-weight:800;text-align:center;margin-bottom:28px;font-family:'Outfit',sans-serif;">👑 Assinatura MASTER Confirmada!</h2>
                                        <p style="color:${colors.primary};font-size:20px;font-weight:700;margin-bottom:20px;text-align:center;">Olá, ${props.nome || 'Usuário'}! 👋</p>
                                        <p style="color:${colors.text};font-size:17px;line-height:1.7;margin-bottom:28px;text-align:center;">
                                            Sua assinatura do plano <strong style="color:${colors.primary};">MASTER PRO</strong> foi confirmada! Você agora tem acesso completo a todos os recursos premium.
                                        </p>
                                        <div style="background:rgba(0,0,0,0.4);border-radius:20px;padding:32px;margin:32px 0;border:1px solid rgba(249,115,22,0.2);">
                                            <table width="100%" cellpadding="10">
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Plano:</td><td style="color:${colors.text};font-weight:700;font-size:16px;text-align:right;">MASTER PRO</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Valor:</td><td style="color:${colors.success};font-weight:700;font-size:16px;text-align:right;">${valor || 'R$ 297,00'}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Créditos:</td><td style="color:${colors.primary};font-weight:700;font-size:16px;text-align:right;">${props.creditos || 1000}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Data de Pagamento:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${data_pagamento || new Date().toLocaleDateString('pt-BR')}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Próxima Cobrança:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${proxima_cobranca || 'Em 30 dias'}</td></tr>
                                            </table>
                                        </div>
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="${loginLink}" style="display:inline-block;background:${colors.primaryGradient};color:#fff;padding:18px 48px;text-decoration:none;border-radius:12px;font-weight:800;font-size:16px;box-shadow:0 8px 32px rgba(249,115,22,0.4);">🚀 Acessar Minha Conta</a>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        // Template para pacotes de créditos
        package: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.1);">
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <h2 style="color:${colors.text};font-size:36px;font-weight:800;text-align:center;margin-bottom:28px;font-family:'Outfit',sans-serif;">💎 Pacote de Créditos Comprado!</h2>
                                        <p style="color:${colors.primary};font-size:20px;font-weight:700;margin-bottom:20px;text-align:center;">Olá, ${props.nome || 'Usuário'}! 👋</p>
                                        <p style="color:${colors.text};font-size:17px;line-height:1.7;margin-bottom:28px;text-align:center;">
                                            Seu pacote de créditos foi adicionado com sucesso à sua conta!
                                        </p>
                                        <div style="background:rgba(0,0,0,0.4);border-radius:20px;padding:32px;margin:32px 0;border:1px solid rgba(249,115,22,0.2);">
                                            <table width="100%" cellpadding="10">
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Pacote:</td><td style="color:${colors.text};font-weight:700;font-size:16px;text-align:right;">${pacote || 'Pacote Premium'}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Créditos Adicionados:</td><td style="color:${colors.success};font-weight:700;font-size:16px;text-align:right;">+${creditos || 0}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Valor:</td><td style="color:${colors.success};font-weight:700;font-size:16px;text-align:right;">${valor || 'R$ 99,90'}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Saldo Atual:</td><td style="color:${colors.primary};font-weight:800;font-size:18px;text-align:right;">${saldo_atual || 0} créditos</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Data da Compra:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${data_compra || new Date().toLocaleDateString('pt-BR')}</td></tr>
                                            </table>
                                        </div>
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="${loginLink}" style="display:inline-block;background:${colors.primaryGradient};color:#fff;padding:18px 48px;text-decoration:none;border-radius:12px;font-weight:800;font-size:16px;box-shadow:0 8px 32px rgba(249,115,22,0.4);">🚀 Acessar Minha Conta</a>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        // Templates para planos anuais START CREATOR
        'subscription_plan-start-annual': `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.1);">
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <h2 style="color:${colors.text};font-size:36px;font-weight:800;text-align:center;margin-bottom:28px;font-family:'Outfit',sans-serif;">🎉 Assinatura Anual Confirmada!</h2>
                                        <p style="color:${colors.primary};font-size:20px;font-weight:700;margin-bottom:20px;text-align:center;">Olá, ${props.nome || 'Usuário'}! 👋</p>
                                        <p style="color:${colors.text};font-size:17px;line-height:1.7;margin-bottom:28px;text-align:center;">
                                            Sua assinatura anual do plano <strong style="color:${colors.primary};">START CREATOR</strong> foi confirmada com sucesso!
                                        </p>
                                        <div style="background:rgba(0,0,0,0.4);border-radius:20px;padding:32px;margin:32px 0;border:1px solid rgba(249,115,22,0.2);">
                                            <table width="100%" cellpadding="10">
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Plano:</td><td style="color:${colors.text};font-weight:700;font-size:16px;text-align:right;">START CREATOR Anual</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Valor:</td><td style="color:${colors.success};font-weight:700;font-size:16px;text-align:right;">${valor || 'R$ 799,00'}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Créditos:</td><td style="color:${colors.primary};font-weight:700;font-size:16px;text-align:right;">${props.creditos || 1200}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Data de Pagamento:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${data_pagamento || new Date().toLocaleDateString('pt-BR')}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Próxima Cobrança:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${proxima_cobranca || 'Em 365 dias'}</td></tr>
                                            </table>
                                        </div>
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="${loginLink}" style="display:inline-block;background:${colors.primaryGradient};color:#fff;padding:18px 48px;text-decoration:none;border-radius:12px;font-weight:800;font-size:16px;box-shadow:0 8px 32px rgba(249,115,22,0.4);">🚀 Acessar Minha Conta</a>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        // Template TURBO MAKER Anual
        'subscription_plan-turbo-annual': `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.1);">
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <h2 style="color:${colors.text};font-size:36px;font-weight:800;text-align:center;margin-bottom:28px;font-family:'Outfit',sans-serif;">🚀 Assinatura Anual TURBO Confirmada!</h2>
                                        <p style="color:${colors.primary};font-size:20px;font-weight:700;margin-bottom:20px;text-align:center;">Olá, ${props.nome || 'Usuário'}! 👋</p>
                                        <p style="color:${colors.text};font-size:17px;line-height:1.7;margin-bottom:28px;text-align:center;">
                                            Sua assinatura anual do plano <strong style="color:${colors.primary};">TURBO MAKER</strong> foi confirmada!
                                        </p>
                                        <div style="background:rgba(0,0,0,0.4);border-radius:20px;padding:32px;margin:32px 0;border:1px solid rgba(249,115,22,0.2);">
                                            <table width="100%" cellpadding="10">
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Plano:</td><td style="color:${colors.text};font-weight:700;font-size:16px;text-align:right;">TURBO MAKER Anual</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Valor:</td><td style="color:${colors.success};font-weight:700;font-size:16px;text-align:right;">${valor || 'R$ 1.970,00'}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Créditos:</td><td style="color:${colors.primary};font-weight:700;font-size:16px;text-align:right;">${props.creditos || 6000}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Data de Pagamento:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${data_pagamento || new Date().toLocaleDateString('pt-BR')}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Próxima Cobrança:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${proxima_cobranca || 'Em 365 dias'}</td></tr>
                                            </table>
                                        </div>
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="${loginLink}" style="display:inline-block;background:${colors.primaryGradient};color:#fff;padding:18px 48px;text-decoration:none;border-radius:12px;font-weight:800;font-size:16px;box-shadow:0 8px 32px rgba(249,115,22,0.4);">🚀 Acessar Minha Conta</a>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `,
        // Template MASTER PRO Anual
        'subscription_plan-master-annual': `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="dark">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
                </style>
            </head>
            <body style="margin:0;padding:0;background:${colors.background};min-height:100vh;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};padding:40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colors.card};border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 40px rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.1);">
                                <tr>
                                    <td style="background:${colors.primaryGradient};padding:56px 40px;text-align:center;position:relative;overflow:hidden;">
                                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+') repeat;opacity:0.1;"></div>
                                        <div style="position:relative;z-index:1;">
                                            <div style="font-size:80px;margin-bottom:24px;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.4));line-height:1;">👑</div>
                                            <h1 style="color:#fff;font-size:48px;font-weight:900;letter-spacing:-1.5px;margin:0;text-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:'Outfit',sans-serif;line-height:1.1;">La Casa Dark Core</h1>
                                            <p style="color:rgba(255,255,255,0.98);font-size:20px;margin-top:20px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.3);letter-spacing:0.5px;">Ferramenta #1 para Canal Dark no YouTube</p>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:48px 40px;">
                                        <h2 style="color:${colors.text};font-size:36px;font-weight:800;text-align:center;margin-bottom:28px;font-family:'Outfit',sans-serif;">👑 Assinatura Anual MASTER Confirmada!</h2>
                                        <p style="color:${colors.primary};font-size:20px;font-weight:700;margin-bottom:20px;text-align:center;">Olá, ${props.nome || 'Usuário'}! 👋</p>
                                        <p style="color:${colors.text};font-size:17px;line-height:1.7;margin-bottom:28px;text-align:center;">
                                            Sua assinatura anual do plano <strong style="color:${colors.primary};">MASTER PRO</strong> foi confirmada!
                                        </p>
                                        <div style="background:rgba(0,0,0,0.4);border-radius:20px;padding:32px;margin:32px 0;border:1px solid rgba(249,115,22,0.2);">
                                            <table width="100%" cellpadding="10">
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Plano:</td><td style="color:${colors.text};font-weight:700;font-size:16px;text-align:right;">MASTER PRO Anual</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Valor:</td><td style="color:${colors.success};font-weight:700;font-size:16px;text-align:right;">${valor || 'R$ 2.970,00'}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Créditos:</td><td style="color:${colors.primary};font-weight:700;font-size:16px;text-align:right;">${props.creditos || 12000}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Data de Pagamento:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${data_pagamento || new Date().toLocaleDateString('pt-BR')}</td></tr>
                                                <tr><td style="color:${colors.textMuted};font-size:14px;">Próxima Cobrança:</td><td style="color:${colors.text};font-size:14px;text-align:right;">${proxima_cobranca || 'Em 365 dias'}</td></tr>
                                            </table>
                                        </div>
                                        <div style="text-align:center;margin:40px 0;">
                                            <a href="${loginLink}" style="display:inline-block;background:${colors.primaryGradient};color:#fff;padding:18px 48px;text-decoration:none;border-radius:12px;font-weight:800;font-size:16px;box-shadow:0 8px 32px rgba(249,115,22,0.4);">🚀 Acessar Minha Conta</a>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="background:rgba(0,0,0,0.3);padding:32px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                                        <p style="color:rgba(255,255,255,0.5);font-size:13px;">© 2026 La Casa Dark Core. Todos os direitos reservados.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `
    };
    
    // Se o template não existir, tentar usar template genérico baseado no tipo
    if (!templates[templateName]) {
        // Templates dinâmicos para planos anuais
        if (templateName.includes('annual')) {
            const basePlan = templateName.replace('-annual', '');
            if (templates[basePlan]) {
                let template = templates[basePlan];
                template = template.replace(/Mensal/g, 'Anual');
                template = template.replace(/Em 30 dias/g, 'Em 365 dias');
                return template;
            }
        }
        return templates.PendingApprovalEmail;
    }
    
    return templates[templateName];
}

module.exports = {
    renderEmailTemplate,
    renderFallbackTemplate
};

