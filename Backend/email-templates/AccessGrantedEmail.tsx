import React from 'react';

interface AccessGrantedEmailProps {
  userName?: string;
  planName?: string;
  features?: string[];
  loginLink?: string;
}

export const AccessGrantedEmail: React.FC<AccessGrantedEmailProps> = ({
  userName = 'Usuário',
  planName = 'Premium',
  features = [
    'Analisador de Títulos Virais com IA',
    'Gerador de Thumbnails Automático',
    'Roteiros Inteligentes para Vídeos',
    'Análise de Competidores e Nichos',
    'Biblioteca de Títulos de Sucesso',
    'Suporte Prioritário 24/7',
  ],
  loginLink = '#',
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
                    {/* Celebration Banner */}
                    <div style={styles.celebrationBanner}>
                      <span style={styles.celebrationEmoji}>🎉</span>
                      <span style={styles.celebrationText}>Parabéns!</span>
                      <span style={styles.celebrationEmoji}>🎉</span>
                    </div>
                    
                    <h1 style={styles.title}>Seu Acesso Foi Liberado!</h1>
                    
                    <p style={styles.greeting}>Olá, {userName}!</p>
                    
                    <p style={styles.text}>
                      Bem-vindo ao <strong style={{ color: '#f59e0b' }}>La Casa Dark Core {planName}</strong>! 
                      Seu acesso foi ativado com sucesso e você já pode aproveitar 
                      todos os recursos exclusivos da nossa plataforma de criação de conteúdo para YouTube.
                    </p>

                    {/* Plan Badge */}
                    <div style={styles.planBadge}>
                      <span style={styles.planIcon}>⭐</span>
                      <span style={styles.planText}>Plano {planName} Ativo</span>
                    </div>

                    {/* Features List */}
                    <div style={styles.featuresCard}>
                      <h3 style={styles.featuresTitle}>🚀 Seus Benefícios:</h3>
                      <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
                        {features.map((feature, index) => (
                          <tr key={index}>
                            <td style={styles.featureItem}>
                              <span style={styles.checkIcon}>✓</span>
                              {feature}
                            </td>
                          </tr>
                        ))}
                      </table>
                    </div>

                    <table cellPadding="0" cellSpacing="0" style={{ margin: '32px auto' }}>
                      <tr>
                        <td>
                          <a href={loginLink} style={styles.button}>
                            🚀 Acessar Minha Conta
                          </a>
                        </td>
                      </tr>
                    </table>

                    <div style={styles.divider}></div>

                    {/* Quick Start */}
                    <h2 style={styles.subtitle}>Primeiros Passos</h2>
                    
                    <div style={styles.stepsContainer}>
                      <div style={styles.step}>
                        <div style={styles.stepNumber}>1</div>
                        <div style={styles.stepContent}>
                          <p style={styles.stepTitle}>Configure seu Dashboard</p>
                          <p style={styles.stepDesc}>Personalize sua experiência</p>
                        </div>
                      </div>
                      <div style={styles.step}>
                        <div style={styles.stepNumber}>2</div>
                        <div style={styles.stepContent}>
                          <p style={styles.stepTitle}>Explore as Ferramentas</p>
                          <p style={styles.stepDesc}>Títulos virais, thumbnails IA e mais</p>
                        </div>
                      </div>
                      <div style={styles.step}>
                        <div style={styles.stepNumber}>3</div>
                        <div style={styles.stepContent}>
                          <p style={styles.stepTitle}>Crie Conteúdo de Sucesso</p>
                          <p style={styles.stepDesc}>Veja seu canal crescer</p>
                        </div>
                      </div>
                    </div>

                    {/* Support Box */}
                    <div style={styles.supportBox}>
                      <p style={styles.supportTitle}>💬 Precisa de Ajuda?</p>
                      <p style={styles.supportText}>
                        Nossa equipe de suporte está disponível 24/7 para ajudá-lo.
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
    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(245, 158, 11, 0.1) 100%)',
    borderBottom: '1px solid rgba(34, 197, 94, 0.2)',
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
    border: '1px solid rgba(34, 197, 94, 0.15)',
    borderRadius: '16px',
    margin: '24px 0',
  },
  celebrationBanner: {
    textAlign: 'center' as const,
    marginBottom: '16px',
  },
  celebrationEmoji: {
    fontSize: '32px',
    margin: '0 8px',
  },
  celebrationText: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#22c55e',
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
  planBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.1) 100%)',
    borderRadius: '50px',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    margin: '0 auto 24px',
    textAlign: 'center' as const,
  },
  planIcon: {
    fontSize: '18px',
  },
  planText: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#22c55e',
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
  button: {
    display: 'inline-block',
    padding: '16px 40px',
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 700,
    textDecoration: 'none',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(34, 197, 94, 0.4)',
    textAlign: 'center' as const,
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

export default AccessGrantedEmail;
