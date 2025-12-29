import React from 'react';

interface CancellationEmailProps {
  userName?: string;
  planName?: string;
  endDate?: string;
}

export const CancellationEmail: React.FC<CancellationEmailProps> = ({
  userName = 'Usuário',
  planName = 'Premium',
  endDate = '31/12/2024',
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
                      <span style={styles.mainIcon}>💔</span>
                    </div>
                    
                    <h1 style={styles.title}>Cancelamento Confirmado</h1>
                    
                    <p style={styles.greeting}>Olá, {userName}!</p>
                    
                    <p style={styles.text}>
                      Confirmamos o cancelamento da sua assinatura do plano{' '}
                      <strong style={{ color: '#f59e0b' }}>{planName}</strong>. 
                      Lamentamos ver você partir.
                    </p>

                    {/* Info Card */}
                    <div style={styles.infoCard}>
                      <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
                        <tr>
                          <td style={styles.infoLabel}>Plano cancelado:</td>
                          <td style={styles.infoValue}>{planName}</td>
                        </tr>
                        <tr>
                          <td style={styles.infoLabel}>Acesso até:</td>
                          <td style={styles.infoValue}>{endDate}</td>
                        </tr>
                      </table>
                    </div>

                    <p style={styles.text}>
                      Você ainda terá acesso a todos os recursos até a data acima. 
                      Após esse período, sua conta será convertida para o plano gratuito.
                    </p>

                    <div style={styles.divider}></div>

                    <h2 style={styles.subtitle}>Sentiremos sua falta! 😢</h2>
                    
                    <p style={styles.textSmall}>
                      Se mudar de ideia, você pode reativar sua assinatura a qualquer momento 
                      e continuar aproveitando todos os benefícios premium.
                    </p>

                    <table cellPadding="0" cellSpacing="0" style={{ margin: '32px auto' }}>
                      <tr>
                        <td>
                          <a href="#" style={styles.buttonOutline}>
                            Reativar Minha Assinatura
                          </a>
                        </td>
                      </tr>
                    </table>

                    <div style={styles.feedbackBox}>
                      <p style={styles.feedbackTitle}>📝 Nos ajude a melhorar</p>
                      <p style={styles.feedbackText}>
                        Sua opinião é muito importante. Gostaríamos de saber o motivo 
                        do cancelamento para melhorarmos nosso serviço.
                      </p>
                      <a href="#" style={styles.feedbackLink}>Deixar Feedback →</a>
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
    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, transparent 50%)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
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
    border: '1px solid rgba(239, 68, 68, 0.15)',
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
    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)',
    borderRadius: '50%',
    border: '2px solid rgba(239, 68, 68, 0.3)',
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
    margin: '0 0 16px 0',
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
    margin: '0 0 16px 0',
  },
  textSmall: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.6,
    margin: '0',
    textAlign: 'center' as const,
  },
  infoCard: {
    padding: '20px 24px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    margin: '24px 0',
  },
  infoLabel: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.5)',
    padding: '8px 0',
  },
  infoValue: {
    fontSize: '14px',
    color: '#ffffff',
    fontWeight: 600,
    textAlign: 'right' as const,
    padding: '8px 0',
  },
  buttonOutline: {
    display: 'inline-block',
    padding: '16px 40px',
    background: 'transparent',
    color: '#f59e0b',
    fontSize: '16px',
    fontWeight: 700,
    textDecoration: 'none',
    borderRadius: '12px',
    border: '2px solid #f59e0b',
    textAlign: 'center' as const,
  },
  divider: {
    height: '1px',
    background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%)',
    margin: '32px 0',
  },
  feedbackBox: {
    padding: '24px',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    textAlign: 'center' as const,
    marginTop: '24px',
  },
  feedbackTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 8px 0',
  },
  feedbackText: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)',
    margin: '0 0 16px 0',
    lineHeight: 1.6,
  },
  feedbackLink: {
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

export default CancellationEmail;
