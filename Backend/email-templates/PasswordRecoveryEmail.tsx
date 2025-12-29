import React from 'react';

interface PasswordRecoveryEmailProps {
  userName?: string;
  resetLink: string;
}

export const PasswordRecoveryEmail: React.FC<PasswordRecoveryEmailProps> = ({
  userName = 'Usuário',
  resetLink,
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
                      <span style={styles.mainIcon}>🔐</span>
                    </div>
                    
                    <h1 style={styles.title}>Recuperação de Senha</h1>
                    
                    <p style={styles.greeting}>Olá, {userName}!</p>
                    
                    <p style={styles.text}>
                      Recebemos uma solicitação para redefinir a senha da sua conta. 
                      Clique no botão abaixo para criar uma nova senha:
                    </p>

                    <table cellPadding="0" cellSpacing="0" style={{ margin: '32px auto' }}>
                      <tr>
                        <td>
                          <a href={resetLink} style={styles.button}>
                            Redefinir Minha Senha
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style={styles.textSmall}>
                      Este link expira em <strong style={{ color: '#f59e0b' }}>24 horas</strong>. 
                      Se você não solicitou esta alteração, ignore este email.
                    </p>

                    <div style={styles.divider}></div>

                    <p style={styles.securityNote}>
                      🛡️ Dica de segurança: Nunca compartilhe sua senha com terceiros.
                    </p>
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
  button: {
    display: 'inline-block',
    padding: '16px 40px',
    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    color: '#0a0a0f',
    fontSize: '16px',
    fontWeight: 700,
    textDecoration: 'none',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(245, 158, 11, 0.4)',
    textAlign: 'center' as const,
  },
  divider: {
    height: '1px',
    background: 'linear-gradient(90deg, transparent 0%, rgba(245, 158, 11, 0.3) 50%, transparent 100%)',
    margin: '32px 0',
  },
  securityNote: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center' as const,
    margin: 0,
    padding: '16px',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderRadius: '8px',
    border: '1px solid rgba(245, 158, 11, 0.1)',
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

export default PasswordRecoveryEmail;
