import React from 'react';

interface PendingApprovalEmailProps {
  userName?: string;
}

export const PendingApprovalEmail: React.FC<PendingApprovalEmailProps> = ({
  userName = 'Usuário',
}) => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style={styles.body}>
        <table style={styles.container} cellPadding="0" cellSpacing="0">
          <tr>
            <td>
              {/* Header */}
              <table style={styles.header} cellPadding="0" cellSpacing="0">
                <tr>
                  <td style={styles.logoContainer}>
                    <div style={styles.logoIcon}>🏰</div>
                    <span style={styles.logoText}>La Casa Dark Core</span>
                  </td>
                </tr>
              </table>

              {/* Main Content */}
              <table style={styles.content} cellPadding="0" cellSpacing="0">
                <tr>
                  <td>
                    <div style={styles.iconWrapper}>
                      <span style={styles.mainIcon}>⏳</span>
                    </div>
                    
                    <h1 style={styles.title}>Cadastro Recebido!</h1>
                    
                    <p style={styles.greeting}>Olá, {userName}!</p>
                    
                    <p style={styles.text}>
                      Recebemos seu cadastro na <strong style={{ color: '#f59e0b' }}>La Casa Dark Core</strong> 
                      e ficamos muito felizes com seu interesse em nossa plataforma!
                    </p>

                    {/* Status Badge */}
                    <div style={styles.statusBadge}>
                      <span style={styles.statusIcon}>📋</span>
                      <span style={styles.statusText}>Em Análise</span>
                    </div>

                    <p style={styles.text}>
                      Sua conta está atualmente em análise por nossa equipe. Este processo 
                      geralmente leva até <strong style={{ color: '#f59e0b' }}>24-48 horas</strong>.
                    </p>

                    <div style={styles.divider}></div>

                    {/* Next Steps */}
                    <h2 style={styles.subtitle}>O que acontece agora?</h2>
                    
                    <div style={styles.stepsContainer}>
                      <div style={styles.step}>
                        <div style={styles.stepNumber}>1</div>
                        <div style={styles.stepContent}>
                          <p style={styles.stepTitle}>Análise da Conta</p>
                          <p style={styles.stepDesc}>Nossa equipe verifica seu cadastro</p>
                        </div>
                      </div>
                      <div style={styles.step}>
                        <div style={styles.stepNumber}>2</div>
                        <div style={styles.stepContent}>
                          <p style={styles.stepTitle}>Aprovação</p>
                          <p style={styles.stepDesc}>Você receberá um email de confirmação</p>
                        </div>
                      </div>
                      <div style={styles.step}>
                        <div style={styles.stepNumber}>3</div>
                        <div style={styles.stepContent}>
                          <p style={styles.stepTitle}>Acesso Liberado</p>
                          <p style={styles.stepDesc}>Comece a criar conteúdo de sucesso</p>
                        </div>
                      </div>
                    </div>

                    {/* Info Box */}
                    <div style={styles.infoBox}>
                      <p style={styles.infoTitle}>💡 Enquanto Aguarda</p>
                      <p style={styles.infoText}>
                        Fique de olho em sua caixa de entrada (e na pasta de spam/lixo eletrônico) 
                        para não perder o email de aprovação!
                      </p>
                    </div>

                    {/* Features Preview */}
                    <div style={styles.featuresCard}>
                      <h3 style={styles.featuresTitle}>🚀 Em Breve Você Terá Acesso a:</h3>
                      <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
                        <tr>
                          <td style={styles.featureItem}>
                            <span style={styles.checkIcon}>✓</span>
                            Analisador de Títulos Virais com IA
                          </td>
                        </tr>
                        <tr>
                          <td style={styles.featureItem}>
                            <span style={styles.checkIcon}>✓</span>
                            Gerador de Thumbnails Automático
                          </td>
                        </tr>
                        <tr>
                          <td style={styles.featureItem}>
                            <span style={styles.checkIcon}>✓</span>
                            Roteiros Inteligentes para Vídeos
                          </td>
                        </tr>
                        <tr>
                          <td style={styles.featureItem}>
                            <span style={styles.checkIcon}>✓</span>
                            Análise de Competidores e Nichos
                          </td>
                        </tr>
                      </table>
                    </div>

                    {/* Support Box */}
                    <div style={styles.supportBox}>
                      <p style={styles.supportTitle}>💬 Precisa de Ajuda?</p>
                      <p style={styles.supportText}>
                        Se tiver alguma dúvida sobre o processo, nossa equipe está disponível 
                        para ajudá-lo.
                      </p>
                      <a href="#" style={styles.supportLink}>Falar com Suporte →</a>
                    </div>
                  </td>
                </tr>
              </table>

              {/* Footer */}
              <table style={styles.footer} cellPadding="0" cellSpacing="0">
                <tr>
                  <td>
                    <p style={styles.footerText}>
                      © 2024 La Casa Dark Core. Todos os direitos reservados.
                    </p>
                    <p style={styles.footerLinks}>
                      <a href="#" style={styles.footerLink}>Termos de Uso</a>
                      {' • '}
                      <a href="#" style={styles.footerLink}>Política de Privacidade</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: '#0a0a0f',
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  container: {
    width: '100%',
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#0a0a0f',
  },
  header: {
    width: '100%',
    padding: '32px 24px',
    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, transparent 50%)',
    borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  logoIcon: {
    fontSize: '32px',
  },
  logoText: {
    fontSize: '24px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #f59e0b 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: '#f59e0b',
  },
  content: {
    width: '100%',
    padding: '48px 32px',
    backgroundColor: 'rgba(20, 20, 30, 0.8)',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    borderRadius: '16px',
    margin: '24px 0',
  },
  iconWrapper: {
    textAlign: 'center' as const,
    marginBottom: '24px',
  },
  mainIcon: {
    fontSize: '48px',
    display: 'inline-block',
    padding: '16px',
    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.05) 100%)',
    borderRadius: '50%',
    border: '2px solid rgba(245, 158, 11, 0.3)',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#ffffff',
    textAlign: 'center' as const,
    margin: '0 0 24px 0',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#ffffff',
    textAlign: 'center' as const,
    margin: '0 0 24px 0',
  },
  greeting: {
    fontSize: '18px',
    color: '#f59e0b',
    margin: '0 0 16px 0',
  },
  text: {
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 1.6,
    margin: '0 0 24px 0',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.1) 100%)',
    borderRadius: '50px',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    margin: '0 auto 24px',
    textAlign: 'center' as const,
  },
  statusIcon: {
    fontSize: '18px',
  },
  statusText: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#f59e0b',
  },
  divider: {
    height: '1px',
    background: 'linear-gradient(90deg, transparent 0%, rgba(245, 158, 11, 0.3) 50%, transparent 100%)',
    margin: '32px 0',
  },
  stepsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    marginBottom: '24px',
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  stepNumber: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    color: '#0a0a0f',
    fontSize: '16px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 4px 0',
  },
  stepDesc: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    margin: 0,
  },
  infoBox: {
    padding: '24px',
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(59, 130, 246, 0.15)',
    textAlign: 'center' as const,
    marginBottom: '24px',
  },
  infoTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 8px 0',
  },
  infoText: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)',
    margin: '0',
    lineHeight: 1.6,
  },
  featuresCard: {
    padding: '24px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    margin: '24px 0',
  },
  featuresTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 16px 0',
  },
  featureItem: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.8)',
    padding: '8px 0',
  },
  checkIcon: {
    color: '#22c55e',
    marginRight: '12px',
    fontWeight: 700,
  },
  supportBox: {
    padding: '24px',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    textAlign: 'center' as const,
  },
  supportTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 8px 0',
  },
  supportText: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)',
    margin: '0 0 16px 0',
  },
  supportLink: {
    fontSize: '14px',
    color: '#f59e0b',
    textDecoration: 'none',
    fontWeight: 600,
  },
  footer: {
    width: '100%',
    padding: '24px',
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
    margin: '0 0 8px 0',
  },
  footerLinks: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
    margin: 0,
  },
  footerLink: {
    color: '#f59e0b',
    textDecoration: 'none',
  },
};

export default PendingApprovalEmail;

